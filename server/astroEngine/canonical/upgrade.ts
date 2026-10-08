/**
 * Legacy chart handling. Charts saved before V3 were computed by an
 * approximate Keplerian engine that assumed Indian Standard Time everywhere.
 * When their owner opens them they are recalculated deterministically from the
 * stored birth data (date, time, coordinates) in the birthplace's historical
 * time zone. This module is pure: it returns the V3 fields and never writes.
 * By default the route serves them as a view and leaves the stored row as is.
 *
 * Reversible: any persisted upgrade keeps the previous chartData verbatim under
 * `legacySnapshot`. Never silent: a migration note is surfaced in the UI.
 * Never fabricated: without stored coordinates or a valid birth time the chart
 * is marked `limited` and left unconverted.
 */
import type { Kundli } from '@shared/schema';
import { isCurrentCanonicalChart, CANONICAL_SCHEMA_VERSION, type CanonicalChart } from '@shared/v3/canonical';
import { validCoordinates } from '../../geocode.js';
import { BirthInputError } from '../errors.js';
import { getKundli, birthDateString } from '../index.js';
import { CalculationError } from './compute.js';
import { reconcileBirthStarRemedies } from '../remedies.js';

export interface ChartVersionStatus {
  version: 'v3' | 'v3-recalculated-from-legacy' | 'limited';
  schemaVersion?: string;
  notes: string[];
}

export interface MigrationRecord {
  from: 'pre-v3';
  to: string;
  at: string;
  notes: string[];
}

export function chartVersionStatus(kundli: Pick<Kundli, 'chartData'>): ChartVersionStatus {
  const cd = (kundli.chartData ?? {}) as Record<string, any>;
  if (isCurrentCanonicalChart(cd.canonical)) {
    const migration = cd.migration as MigrationRecord | undefined;
    return migration
      ? { version: 'v3-recalculated-from-legacy', schemaVersion: CANONICAL_SCHEMA_VERSION, notes: migration.notes }
      : { version: 'v3', schemaVersion: CANONICAL_SCHEMA_VERSION, notes: [] };
  }
  return { version: 'limited', notes: [cd.limitedReason ?? 'This chart predates the V3 engine and has not been recalculated.'] };
}

type ChartFields = Pick<Kundli, 'zodiacSign' | 'moonSign' | 'ascendant' | 'chartData' | 'dashas' | 'doshas' | 'remedies'>;

/**
 * Returns the fields to persist when a legacy chart can be upgraded, or null
 * when it is already current or cannot be converted without guessing.
 */
export async function upgradeLegacyKundli(kundli: Kundli, now = new Date()): Promise<ChartFields | null> {
  const cd = (kundli.chartData ?? {}) as Record<string, any>;
  if (isCurrentCanonicalChart(cd.canonical)) return null;

  const coords = validCoordinates(kundli.latitude, kundli.longitude);
  const limited = (reason: string): ChartFields => ({
    zodiacSign: kundli.zodiacSign, moonSign: kundli.moonSign, ascendant: kundli.ascendant,
    dashas: kundli.dashas, doshas: kundli.doshas, remedies: kundli.remedies,
    chartData: { ...cd, limitedReason: reason },
  });
  if (!coords) return limited('This chart has no stored birth coordinates, so it cannot be recalculated with the V3 engine. Please create it again with the birth place.');

  try {
    // An older canonical record keeps the zone/offset the person supplied (e.g. to settle a DST fold).
    const prevBirth = cd.canonical?.birth ?? {};
    const approximate = cd.isBirthTimeApproximate === true || prevBirth.timeAccuracy === 'approximate';
    const nk = await getKundli(prevBirth.localDate ?? birthDateString(kundli.dateOfBirth), prevBirth.localTime ?? kundli.timeOfBirth, coords.lat, coords.lng, {
      timeAccuracy: approximate ? 'approximate' : 'exact',
      timezone: prevBirth.timezoneSource === 'supplied' ? prevBirth.timezone : null,
      utcOffset: typeof prevBirth.utcOffset === 'string' ? prevBirth.utcOffset : null,
      place: kundli.placeOfBirth,
    });
    const canonical: CanonicalChart = nk.chartData.canonical;
    const notes = [
      'Recalculated with the V3 engine (Swiss Ephemeris, Lahiri ayanamsa).',
      canonical.birth.timezone === 'Asia/Kolkata' && canonical.birth.utcOffset === '+05:30'
        ? 'The birth time was read as Indian Standard Time, as before.'
        : `The birth time was read in the birthplace's historical time zone (${canonical.birth.timezone}, UTC${canonical.birth.utcOffset}); the earlier version assumed Indian Standard Time.`,
      'Earlier versions used an approximate planetary engine, so some degrees, nakshatras or dasha dates may differ from what you saw before.',
    ];
    const migration: MigrationRecord = { from: 'pre-v3', to: CANONICAL_SCHEMA_VERSION, at: now.toISOString(), notes };
    const { limitedReason: _drop, legacySnapshot: priorSnapshot, legacyColumns: priorColumns, ...previous } = cd;
    // Everything an upgrade overwrites is kept, so a rollback can restore the row exactly.
    const legacyColumns = priorColumns ?? {
      zodiacSign: kundli.zodiacSign, moonSign: kundli.moonSign, ascendant: kundli.ascendant,
      dashas: kundli.dashas, doshas: kundli.doshas, remedies: kundli.remedies,
    };
    return {
      zodiacSign: nk.zodiacSign, moonSign: nk.moonSign, ascendant: nk.ascendant,
      dashas: nk.dashas, doshas: nk.doshas, remedies: nk.remedies,
      chartData: { ...nk.chartData, migration, legacySnapshot: priorSnapshot ?? previous, legacyColumns },
    };
  } catch (err) {
    if (err instanceof BirthInputError || err instanceof CalculationError) {
      return limited(`This chart could not be recalculated: ${err.message}`);
    }
    throw err;
  }
}

export type ListedChartStatus = 'v3' | 'recalculated' | 'limited';

/**
 * The chart-list view of a (possibly recalculated) chart: placements are shown
 * only when the V3 engine vouches for them. A limited chart's stored signs come
 * from the retired engine, and an approximate birth time leaves the Ascendant unknown.
 */
export function listedChart<T extends Pick<Kundli, 'chartData' | 'zodiacSign' | 'moonSign' | 'ascendant'>>(kundli: T) {
  const cd = (kundli.chartData ?? {}) as Record<string, any>;
  const status = chartVersionStatus(kundli);
  const listed: ListedChartStatus = status.version === 'limited' ? 'limited' : status.version === 'v3' ? 'v3' : 'recalculated';
  const approximate = cd.isBirthTimeApproximate === true || cd.canonical?.birth?.timeAccuracy === 'approximate';
  if (listed === 'limited') {
    return { ...kundli, zodiacSign: null, moonSign: null, ascendant: null, timeAccuracy: approximate ? 'approximate' as const : 'exact' as const, listStatus: listed };
  }
  return {
    ...kundli,
    ascendant: approximate ? null : kundli.ascendant,
    timeAccuracy: approximate ? 'approximate' as const : 'exact' as const,
    listStatus: listed,
  };
}

/**
 * Applies the current birth-star remedy rules to a V3 chart's stored remedies,
 * so charts saved before the rule changed are served consistently. Read-only
 * and idempotent; non-V3 charts are returned unchanged.
 */
export function withReconciledRemedies<T extends Pick<Kundli, 'chartData' | 'remedies'>>(kundli: T): T {
  const cd = (kundli.chartData ?? {}) as Record<string, any>;
  if (!isCurrentCanonicalChart(cd.canonical) || !Array.isArray(kundli.remedies)) return kundli;
  const chart = cd.canonical as CanonicalChart;
  const lord = chart.planets.find((p) => p.name === 'Moon')?.nakshatra.lord;
  const houseLords = cd.bhava?.houseLords;
  if (!lord || !Array.isArray(houseLords)) return kundli;
  const remedies = reconcileBirthStarRemedies(kundli.remedies as any[], lord, houseLords, chart.birth.timeAccuracy === 'approximate');
  return { ...kundli, remedies };
}

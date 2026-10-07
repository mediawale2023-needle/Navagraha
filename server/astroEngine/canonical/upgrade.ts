/**
 * Legacy chart handling. Charts saved before V3 were computed by an
 * approximate Keplerian engine that assumed Indian Standard Time everywhere.
 * They are upgraded lazily, when their owner opens them, by deterministic
 * recalculation from the stored birth data (date, time, coordinates) in the
 * birthplace's historical time zone.
 *
 * Reversible: the previous chartData is kept verbatim under `legacySnapshot`.
 * Never silent: a migration note is recorded and surfaced in the UI.
 * Never fabricated: without stored coordinates or a valid birth time the chart
 * is marked `limited` and left unconverted.
 */
import type { Kundli } from '@shared/schema';
import { isCurrentCanonicalChart, CANONICAL_SCHEMA_VERSION, type CanonicalChart } from '@shared/v3/canonical';
import { validCoordinates } from '../../geocode.js';
import { BirthInputError } from '../errors.js';
import { getKundli, birthDateString } from '../index.js';
import { CalculationError } from './compute.js';

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
    const { limitedReason: _drop, legacySnapshot: priorSnapshot, ...previous } = cd;
    return {
      zodiacSign: nk.zodiacSign, moonSign: nk.moonSign, ascendant: nk.ascendant,
      dashas: nk.dashas, doshas: nk.doshas, remedies: nk.remedies,
      chartData: { ...nk.chartData, migration, legacySnapshot: priorSnapshot ?? previous },
    };
  } catch (err) {
    if (err instanceof BirthInputError || err instanceof CalculationError) {
      return limited(`This chart could not be recalculated: ${err.message}`);
    }
    throw err;
  }
}

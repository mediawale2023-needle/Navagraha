import type { Kundli } from '@shared/schema';
import type { CanonicalChart } from '@shared/v3/canonical';
import type { Remedy } from '../astroEngine/remedies';
import { runningPeriod } from '../astroEngine/evidence/engine';
import { extractChartRemedies } from '../aiAstrologerService';
import type { UniversalReportCategory } from './types';

const ord = (n: number) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;

/** The houses and natural significators each report is about; a remedy is offered only for a planet tied to them. */
const SUBJECT: Partial<Record<UniversalReportCategory, { houses: number[]; significators: Record<string, string> }>> = {
  marriage: { houses: [7], significators: { Venus: 'natural significator of marriage' } },
  finance: { houses: [2, 11], significators: { Jupiter: 'natural significator of wealth' } },
  life: { houses: [1], significators: {} },
};

const practice = (r: Remedy, why: string) =>
  `${r.focus}, ${why}: to ${r.action === 'Strengthen' ? 'strengthen' : 'pacify'} it, the traditional practice is the mantra "${r.mantra}" (${r.japaCount.toLocaleString('en-IN')} repetitions over time), on ${r.day}s${r.action === 'Pacify' && r.donation ? `, with a donation of ${r.donation}` : ''}. Optional and devotional; it is not a substitute for practical action.`;

/**
 * Remedies for one report, from the chart's functional remedies (the Remedies page's own rules): only planets that rule
 * the report's houses, signify its subject or lead its running periods. Gemstones are never offered here, and nothing
 * that depends on lordship is offered when the birth time is approximate. Career keeps its own (none).
 */
export function reportRemedies(category: UniversalReportCategory, kundli: Partial<Kundli>, asOf: Date): string[] {
  const chart = (kundli as any).chartData?.canonical as CanonicalChart | undefined;
  const functional: Remedy[] = Array.isArray((kundli as any).chartData?.functionalRemedies) ? (kundli as any).chartData.functionalRemedies : [];
  const approximate = chart?.birth.timeAccuracy === 'approximate';
  const why = new Map<string, string>();
  if (chart && !approximate) {
    if (category === 'year_ahead') {
      const rp = runningPeriod(chart, asOf);
      if (rp?.mahadasha) why.set(rp.mahadasha, 'lord of your running Mahadasha');
      if (rp?.antardasha && !why.has(rp.antardasha)) why.set(rp.antardasha, 'lord of your running Antardasha');
    }
    const subject = SUBJECT[category];
    if (subject) {
      for (const h of subject.houses) {
        const lord = chart.houses.find((x) => x.house === h)?.lord;
        if (lord && !why.has(lord)) why.set(lord, h === 1 ? 'your Ascendant lord' : `ruler of your ${ord(h)} house`);
      }
      for (const [planet, role] of Object.entries(subject.significators)) if (!why.has(planet)) why.set(planet, role);
    }
  }
  const selected = functional.filter((r) => why.has(r.focus)).map((r) => practice(r, why.get(r.focus)!));
  // The birth-star practices concern the person as a whole, so they belong to the Life Reading only.
  if (category === 'life') selected.push(...extractChartRemedies({ remedies: ((kundli as any).remedies ?? []).filter((r: any) => r?.type !== 'gemstone') } as Partial<Kundli>));
  return Array.from(new Set(selected)).slice(0, 6);
}

import type { CanonicalChart } from '@shared/v3/canonical';

export interface Segment { text: string; bold?: boolean }

const DOSHA_SHORT: Record<string, string> = { mangal: 'Mangal', kaalSarp: 'Kaal Sarp', pitru: 'Pitru' };

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);

/**
 * The mockup's one-line summary under the nine grahas: yogas present (grouped, with counts) and the
 * doshas. With an approximate birth time, house-based yogas and Mangal Dosha are not stated.
 */
export function summariseYogasAndDoshas(chart: CanonicalChart): Segment[] {
  const exact = chart.birth.timeAccuracy === 'exact';
  const out: Segment[] = [];
  if (exact) {
    const counts = new Map<string, number>();
    for (const y of chart.yogas) if (!y.cancelled) counts.set(y.name, (counts.get(y.name) ?? 0) + 1);
    if (counts.size) {
      out.push({ text: 'Yogas: ' });
      Array.from(counts.entries()).forEach(([name, n], i) => {
        if (i) out.push({ text: ', ' });
        out.push({ text: n > 1 ? `${name} ×${n}` : name, bold: true });
      });
      out.push({ text: '. ' });
    } else {
      out.push({ text: 'No classical yogas found. ' });
    }
  } else {
    out.push({ text: 'Yogas and Mangal Dosha depend on the Lagna, so they are not stated for an approximate birth time. ' });
  }

  const stated = chart.doshas.filter((d) => d.id in DOSHA_SHORT && (exact || d.id !== 'mangal'));
  const present = stated.filter((d) => d.present);
  const cancelled = stated.filter((d) => !d.present && (d.cancelledBy?.length ?? 0) > 0);
  const absent = stated.filter((d) => !d.present && !(d.cancelledBy?.length));
  for (const d of present) out.push({ text: `${DOSHA_SHORT[d.id]} Dosha`, bold: true }, { text: ' present. ' });
  for (const d of cancelled) out.push({ text: `${DOSHA_SHORT[d.id]} Dosha cancelled (${d.cancelledBy!.join('; ')}). ` });
  if (absent.length) out.push({ text: `No ${list(absent.map((d) => DOSHA_SHORT[d.id]))} Dosha.` });
  const visha = chart.doshas.find((d) => d.id === 'vishaYoga');
  if (visha?.present && (exact || chart.uncertainty.moonSignStableAcrossBirthDate)) out.push({ text: ' ' }, { text: 'Visha Yoga', bold: true }, { text: ' present.' });
  return out.map((s, i, a) => (i === a.length - 1 ? { ...s, text: s.text.trimEnd() } : s));
}

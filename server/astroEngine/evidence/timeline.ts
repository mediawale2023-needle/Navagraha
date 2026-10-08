/**
 * Life Timeline — Vimshottari periods from the CanonicalChart, each annotated
 * deterministically with the life areas its lord engages in THIS chart and how
 * well placed that lord is. Dates come only from the dasha calculation.
 */
import type { CanonicalChart, Graha } from '@shared/v3/canonical';
import { DOMAIN_LABELS, type Confidence, type TimelinePeriod } from '@shared/v3/evidence';
import { indexChart, planetCondition, planetDomainLinks, type ChartIndex } from './engine.js';

export const PLANET_THEMES: Record<Graha, string[]> = {
  Sun: ['authority and recognition', 'self-confidence', 'relations with father figures'],
  Moon: ['emotional life and home', 'public dealings', 'care and nurture'],
  Mars: ['initiative and courage', 'property and competition', 'decisive action'],
  Mercury: ['communication and learning', 'business and networking', 'analysis'],
  Jupiter: ['growth and guidance', 'teaching and wisdom', 'children and blessings'],
  Venus: ['relationships and harmony', 'comforts and the arts', 'finances'],
  Saturn: ['responsibility and discipline', 'slow consolidation', 'endurance'],
  Rahu: ['ambition and unconventional paths', 'foreign links', 'sudden change'],
  Ketu: ['detachment and introspection', 'spiritual focus', 'simplification'],
};

function status(start: string, end: string, t: number): TimelinePeriod['status'] {
  const s = Date.parse(start), e = Date.parse(end);
  return t >= s && t < e ? 'current' : t >= e ? 'past' : 'upcoming';
}

function describe(ix: ChartIndex, level: TimelinePeriod['level'], lord: Graha, start: string, end: string, t: number, dashaTimeSensitive: boolean): TimelinePeriod {
  const links = planetDomainLinks(ix, lord).filter((l) => !(ix.approximate && l.requiresBirthTime));
  const cond = planetCondition(ix, lord);
  const domains = links.map((l) => ({ domain: l.domain, direction: cond.direction, reasons: l.reasons }));
  // Each reason is classified once, by its own direction (never both lists).
  const isNegative = (r: string) => /debilitated|combust|dusthana/.test(r);
  const supporting = cond.reasons.filter((r) => !isNegative(r));
  const conflicting = cond.reasons.filter(isNegative);
  let confidence: Confidence = 'Medium';
  if (ix.approximate || dashaTimeSensitive) confidence = 'Low';
  else if (links.length > 0 && cond.reasons.length >= 2) confidence = 'High';
  const areaNames = domains.map((d) => DOMAIN_LABELS[d.domain].toLowerCase());
  const years = ((Date.parse(end) - Date.parse(start)) / (365.25 * 86_400_000)).toFixed(1);
  const quality = cond.direction === 'positive' ? 'a well-placed' : cond.direction === 'negative' ? 'a strained' : 'a neutral';
  const whyItMatters = areaNames.length
    ? `${lord} is ${quality} period lord in this chart, and it engages ${areaNames.join(', ')}${links[0] ? ` (${links[0].reasons[0]})` : ''}, so this ${years}-year ${level} brings those areas forward.`
    : `${lord} has no direct link to the main life areas in this chart; this ${years}-year ${level} is coloured mainly by ${lord}'s general themes.`;
  return {
    level, lord, start, end, status: status(start, end, t),
    themes: PLANET_THEMES[lord], domains, supporting, conflicting, confidence, whyItMatters,
  };
}

export function buildTimeline(chart: CanonicalChart, asOf: Date, ix = indexChart(chart)): TimelinePeriod[] {
  const t = asOf.getTime();
  const birth = Date.parse(chart.birth.birthUTC);
  const dashaTimeSensitive = ix.approximate && !chart.uncertainty.moonNakshatraStableAcrossBirthDate;
  return chart.dashas.vimshottari.mahadashas
    .filter((m) => Date.parse(m.end) > birth)
    .map((m) => {
      const start = new Date(Math.max(Date.parse(m.start), birth)).toISOString();
      const period = describe(ix, 'mahadasha', m.lord, start, m.end, t, dashaTimeSensitive);
      if (period.status === 'current') {
        period.antardashas = m.antardashas
          .filter((a) => Date.parse(a.end) > birth)
          .map((a) => describe(ix, 'antardasha', a.lord, new Date(Math.max(Date.parse(a.start), birth)).toISOString(), a.end, t, dashaTimeSensitive));
      }
      return period;
    });
}

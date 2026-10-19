import type { Kundli } from '@shared/schema';
import { isCurrentCanonicalChart } from '@shared/v3/canonical';
import type { LifeDomain } from '@shared/v3/evidence';
import { buildInterpretationContext } from '../astroEngine/reasoning/interpretationContext';
import { transitsForChart } from '../astroEngine';
import { dashaTimingStable } from '../astroEngine/evidence/engine';
import { datedChanges } from './dated';
import { chartSummary } from '../aiAstrologerService';
import { ReportGenerationError } from '../reportQuality';
import type { BlueprintEvidence, UniversalReportBlueprint, UniversalReportConfig } from './types';

const unique = <T>(xs: T[]) => Array.from(new Set(xs));

export function buildUniversalBlueprint(config: UniversalReportConfig, kundli: Partial<Kundli>, asOf: Date): UniversalReportBlueprint {
  const chart = (kundli as any).chartData?.canonical;
  if (!isCurrentCanonicalChart(chart)) throw new ReportGenerationError('chart is not a verified V3 calculation');
  const context = buildInterpretationContext(chart, asOf);
  if (context.birthTime === 'approximate' && config.approximateBirthTimePolicy === 'require-exact') {
    throw new ReportGenerationError(`the ${config.reportName} needs an exact birth time`);
  }

  const wanted = new Set<LifeDomain>(config.requiredEvidence as readonly LifeDomain[]);
  const areas = context.areas.filter((a) => !wanted.size || wanted.has(a.domain));
  const evidence: BlueprintEvidence[] = [];
  for (const area of areas) {
    evidence.push({ id: `conclusion:${area.domain}`, text: area.conclusion, direction: 'neutral', source: 'deterministic-resolution', domains: [area.domain] });
    for (const f of area.supporting) evidence.push({ id: f.evidenceId, text: f.text, direction: 'supporting', source: f.kind, domains: [area.domain] });
    for (const f of area.challenging) evidence.push({ id: f.evidenceId, text: f.text, direction: 'challenging', source: f.kind, domains: [area.domain] });
  }
  for (const p of context.planets) {
    const details = [p.sign && `in ${p.sign}`, p.house && `house ${p.house}`, p.dignity].filter(Boolean).join(', ');
    if (details) evidence.push({ id: `planet:${p.planet}`, text: `${p.planet}: ${details}.`, direction: 'neutral', source: 'canonical-chart', domains: p.areas.map((a) => a.domain), planets: [p.planet], houses: p.house ? [p.house] : [] });
  }
  for (const h of chart.houses) evidence.push({
    id: `house:${h.house}`,
    text: `House ${h.house} is ${h.sign}; its lord ${h.lord} is in house ${h.lordHouse}; occupants: ${h.occupants.join(', ') || 'none'}.`,
    direction: 'neutral', source: 'canonical-house', domains: [...lifeDomains], planets: [h.lord, ...h.occupants], houses: [h.house, h.lordHouse],
  });
  const chartData = (kundli as any).chartData ?? {};
  const addVarga = (key: 'navamsa' | 'dasamsa', label: 'D9' | 'D10', domains: LifeDomain[]) => {
    const positions: any[] = Array.isArray(chartData[key]?.planetaryPositions) ? chartData[key].planetaryPositions : [];
    for (const p of positions.filter((x) => x?.planet && x.planet !== 'Ascendant')) {
      evidence.push({ id: `${label}:${p.planet}`, text: `${p.planet} is in ${p.sign}${p.house ? `, house ${p.house}` : ''} in the ${label}.`, direction: 'neutral', source: label, domains, planets: [p.planet], houses: p.house ? [p.house] : [] });
    }
  };
  addVarga('navamsa', 'D9', ['relationships']);
  addVarga('dasamsa', 'D10', ['career', 'leadership']);
  const dashas: any[] = Array.isArray((kundli as any).dashas) ? (kundli as any).dashas : [];
  for (const d of dashas) if (d?.planet && d?.startDate && d?.endDate) evidence.push({ id: `dasha:${d.planet}:${d.startDate}`, text: `${d.planet} Mahadasha runs from ${d.startDate} to ${d.endDate}.`, direction: 'neutral', source: 'vimshottari-dates', domains: [...lifeDomains], planets: [d.planet] });
  for (const d of chart.doshas) evidence.push({ id: `dosha:${d.id}`, text: `${d.name} is ${d.present ? 'present' : 'not present'} under the verified rule: ${d.rule}${d.cancelledBy?.length ? `; cancelled by ${d.cancelledBy.join(', ')}` : ''}.`, direction: d.present ? 'challenging' : 'neutral', source: 'verified-dosha', domains: [...lifeDomains] });
  for (const y of context.yogas) evidence.push({ id: `yoga:${y.id}`, text: `${y.name} is ${y.cancelled ? 'formed but cancelled' : 'formed'}; contribution: ${y.contributesTo.join(', ') || 'not established'}.`, direction: y.contributesTo.length ? 'supporting' : 'neutral', source: 'verified-yoga', domains: y.contributesTo });
  if (!context.yogas.length) evidence.push({ id: 'yoga:none', text: 'No yoga is established by the verified yoga detector for this chart.', direction: 'neutral', source: 'verified-yoga', domains: [...lifeDomains] });
  for (const p of context.periods.filter((p) => p.status === 'known' && p.lord)) evidence.push({ id: `period:${p.id}`, text: `${p.level} ${p.lord}: ${p.direction}; linked areas ${p.linkedAreas.join(', ') || 'none'}.`, direction: p.direction === 'positive' ? 'supporting' : p.direction === 'negative' ? 'challenging' : 'neutral', source: 'vimshottari', domains: p.linkedAreas, planets: [p.lord!] });
  const remedies = extractRemedyEvidence(kundli);
  remedies.forEach((remedy, i) => evidence.push({ id: `remedy:${i + 1}`, text: remedy, direction: 'neutral', source: 'verified-remedy', domains: [...lifeDomains] }));
  if (!remedies.length) evidence.push({ id: 'remedy:none', text: 'The deterministic chart supplied no remedy; do not invent or recommend one.', direction: 'neutral', source: 'verified-remedy', domains: [...lifeDomains] });
  if (config.requiredChartData.includes('transits')) {
    const transits = transitsForChart(chart, chartData.ashtakavarga?.sav, asOf);
    for (const p of transits.planets) {
      const houses = [transits.moonSignCertain ? `${p.houseFromMoon}th from Moon` : 'Moon-relative house uncertain', p.houseFromLagna != null ? `${p.houseFromLagna}th from Lagna` : 'Lagna-relative house withheld'].join(', ');
      evidence.push({ id: `transit:${transits.date}:${p.planet}`, text: `As of ${transits.date}, ${p.planet} transits ${p.sign} (${houses}${p.retrograde ? ', retrograde' : ''}${p.sav != null ? `, SAV ${p.sav}` : ''}).`, direction: 'neutral', source: 'calculated-transit', domains: [...lifeDomains], planets: [p.planet] });
    }
    evidence.push({
      id: `transit:${transits.date}:sade-sati`,
      text: transits.sadeSati.determined ? `As of ${transits.date}, ${transits.sadeSati.phase}.` : `As of ${transits.date}, Sade Sati status is withheld because the natal Moon sign is uncertain.`,
      direction: transits.sadeSati.active ? 'challenging' : 'neutral', source: 'calculated-transit', domains: [...lifeDomains],
    });
    evidence.push(...datedChanges(chart, asOf, { moonSignCertain: transits.moonSignCertain, antardashaReliable: dashaTimingStable(chart, asOf).antardasha }));
  }

  const byId = new Map(evidence.map((e) => [e.id, e]));
  const sections = config.reportSections.map((s) => {
    // Keep prompts bounded: conclusions first, then a balanced deterministic evidence sample. The full ledger stays
    // in the blueprint for validation/appendices, but prose generation receives only what this section can use.
    const relevantConclusions = evidence.filter((e) => e.source === 'deterministic-resolution' && (!s.domains.length || e.domains.some((d) => s.domains.includes(d))));
    const selected = s.evidenceSelectors ? evidence.filter((e) =>
      (s.evidenceSelectors?.planets?.some((p) => e.planets?.includes(p))) ||
      (s.evidenceSelectors?.houses?.some((h) => e.houses?.includes(h))) ||
      (s.evidenceSelectors?.sources?.includes(e.source)))
      // Dated changes reach only the sections that select them; elsewhere they would crowd out the natal evidence.
      : evidence.filter((e) => !DATED_SOURCES.includes(e.source) && (!s.domains.length || e.domains.some((d) => s.domains.includes(d)) || e.source === 'canonical-chart'));
    const candidates = [...relevantConclusions, ...selected].filter((e, i, all) => all.findIndex((x) => x.id === e.id) === i);
    const scoped = [
      ...candidates.filter((e) => e.source === 'deterministic-resolution'),
      ...candidates.filter((e) => e.direction === 'supporting'),
      ...candidates.filter((e) => e.direction === 'challenging'),
      ...candidates.filter((e) => e.direction === 'neutral' && e.source !== 'deterministic-resolution'),
    ].filter((e, i, all) => all.findIndex((x) => x.id === e.id) === i).slice(0, 36);
    const sectionAreas = areas.filter((a) => !s.domains.length || s.domains.includes(a.domain));
    const areaConclusions = sectionAreas.map((a) => a.conclusion).slice(0, 3);
    // Where the engine finds too little evidence for a verdict, an honest short section beats one padded to length.
    const insufficient = s.domains.length > 0 && sectionAreas.length > 0 && sectionAreas.every((a) => a.verdict === 'Insufficient evidence');
    return {
      ...s,
      minWords: insufficient ? Math.min(s.minWords, INSUFFICIENT_MIN_WORDS) : s.minWords,
      conclusion: areaConclusions.join(' ') || 'Explain only what the verified chart evidence supports.',
      evidenceIds: unique(scoped.map((e) => e.id)).filter((id) => byId.has(id)),
      leadEvidenceIds: [] as string[],
      limitations: uniqueStrings([...(insufficient ? [INSUFFICIENT_NOTE] : []), ...context.withheld, ...areas.filter((a) => a.openInterpretation && (!s.domains.length || s.domains.includes(a.domain))).map((a) => `${a.label}: weighing remains open to expert review`)]).slice(0, 4),
    };
  });
  assignLeads(sections, byId);
  const thesis = areas.map((a) => `${a.label}: ${a.conclusion}`);
  return {
    schemaVersion: 1, reportId: config.reportId, reportName: config.reportName, reportVersion: config.reportVersion,
    asOf: asOf.toISOString(), chartMetadata: { timeAccuracy: context.birthTime, withheld: context.withheld }, thesis,
    evidence: Array.from(byId.values()), sections, chartFacts: chartSummary(kundli),
    disclosures: context.birthTime === 'approximate' ? [`Birth time is approximate. Withheld: ${context.withheld.join(', ')}.`] : [],
  };
}

const LEADS_PER_SECTION = 3;
/**
 * Deals each section's weighty facts (those with a direction, the running periods, dated changes) out round-robin in
 * its own priority order, so every section leads with different facts. Neutral background facts lead nowhere.
 */
function assignLeads(sections: Array<{ evidenceIds: string[]; leadEvidenceIds?: string[] }>, byId: Map<string, BlueprintEvidence>) {
  const weighty = (id: string) => { const e = byId.get(id); return !!e && (e.direction !== 'neutral' || ['vimshottari', ...DATED_SOURCES].includes(e.source)); };
  const taken = new Set<string>();
  for (const s of sections) s.leadEvidenceIds = [];
  for (let round = 0; round < LEADS_PER_SECTION; round++) for (const s of sections) {
    const next = s.evidenceIds.find((id) => weighty(id) && !taken.has(id));
    if (next) { taken.add(next); s.leadEvidenceIds!.push(next); }
  }
}

const DATED_SOURCES = ['dated-transit', 'dated-period'];
const INSUFFICIENT_MIN_WORDS = 60;
const INSUFFICIENT_NOTE = 'The chart gives too little reliable evidence for a verdict in this area: say so plainly, describe what the cited evidence does show, and do not fill the section with general advice.';
const lifeDomains: LifeDomain[] = ['career', 'wealth', 'relationships', 'leadership', 'property', 'foreign', 'education', 'children', 'spirituality'];

function extractRemedyEvidence(kundli: Partial<Kundli>): string[] {
  const remedies = (kundli as any).remedies;
  if (!Array.isArray(remedies)) return [];
  return remedies.map((r: any) => r && typeof r === 'object' ? `${r.title ?? ''}${r.title && r.description ? ': ' : ''}${r.description ?? ''}`.trim() : String(r)).filter(Boolean);
}

const uniqueStrings = (items: string[]) => Array.from(new Set(items));

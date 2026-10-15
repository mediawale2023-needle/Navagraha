import { isCurrentCanonicalChart, type CanonicalChart } from '@shared/v3/canonical';
import { CAREER_SECTIONS, careerBrief, WORD_TOLERANCE, type CareerBrief } from './careerReport';
import { ReportGenerationError } from './reportQuality';
import { computeCanonicalChart } from './astroEngine/canonical/compute';
import { DOMAIN_SPECS } from './astroEngine/evidence/engine';
import { signDignity } from './astroEngine/dignity';

export type CareerContext = 'D1' | 'D10' | 'Vimshottari';
export interface CareerEvidence {
  id: string;
  contexts: CareerContext[];
  text: string;
  value: unknown;
}
export interface CareerPacket {
  id: number;
  heading: string;
  minimumWords: number;
  facts: CareerEvidence[];
  supporting: string[];
  limiting: string[];
  permittedInterpretations: string[];
  indicators: { supporting: string[]; limiting: string[] };
}
export interface CareerEvidenceSet { chart: CanonicalChart; brief: CareerBrief; packets: CareerPacket[]; asOf: Date }

/** Recompute with the SAME engine, never trust merely version-labelled stored projections. */
export function buildCareerEvidence(kundli: any, asOf: Date): CareerEvidenceSet {
  const stored = kundli?.chartData?.canonical;
  if (!isCurrentCanonicalChart(stored) || stored.birth.timeAccuracy !== 'exact') throw new ReportGenerationError('Career requires a complete canonical chart and exact birth time');
  const chart = computeCanonicalChart(stored.birth);
  const keys = ['planets', 'ascendant', 'houses', 'aspects', 'vargas', 'dashas', 'yogas', 'strength'] as const;
  for (const key of keys) if (JSON.stringify(chart[key]) !== JSON.stringify(stored[key])) throw new ReportGenerationError(`Career canonical verification failed: ${key}`);
  const brief = careerBrief({ chartData: { canonical: chart } }, asOf)!;
  const all = new Map<string, CareerEvidence>();
  const put = (id: string, contexts: CareerContext[], text: string, value: unknown) => { all.set(id, { id, contexts, text, value }); return id; };
  for (const p of chart.planets) {
    const d = chart.strength.dignities.find((x) => x.planet === p.name);
    put(`D1.planet.${p.name}`, ['D1'], `D1: ${p.name} is in ${p.sign}, house ${p.house}${d ? `; condition: ${d.dignity}${d.neechaBhanga ? ', debilitation cancelled' : ''}${d.combust ? ', combust' : ''}${d.retrograde ? ', retrograde' : ''}` : ''}.`, { ...p, dignity: d });
  }
  for (const p of chart.vargas.D10.placements) {
    const dignity = signDignity(p.planet, p.signIndex);
    put(`D10.planet.${p.planet}`, ['D10'], `D10: ${p.planet} is in ${p.sign}, house ${p.house}${dignity ? `; condition: ${dignity} in D10` : ''}.`, { ...p, dignity });
  }
  put('D1.ascendant', ['D1'], `D1 Lagna (the rising sign) is ${chart.ascendant.sign}; its lord is ${chart.houses[0].lord}.`, chart.ascendant);
  put('D10.ascendant', ['D10'], `D10 Dasamsa (the divisional chart of profession): Lagna is ${brief.facts.d10LagnaSign}; its lord is ${brief.facts.d10LagnaLord}.`, chart.vargas.D10.ascendantSignIndex);
  for (const h of chart.houses) put(`D1.house.${h.house}`, ['D1'], `D1 house ${h.house}: ${h.sign}; lord ${h.lord} occupies D1 house ${h.lordHouse}; Sarvashtakavarga (house support tally): ${chart.strength.ashtakavarga.savByHouse[h.house - 1]} bindus.`, h);
  put('D1.aspects', ['D1'], `D1 aspects on the 10th house: ${chart.aspects.filter((a) => a.aspectsHouses.includes(10)).map((a) => a.planet).join(', ') || 'none'}. These are the engine\'s planetary aspects.`, chart.aspects);
  put('D10.tenth', ['D10'], `D10 10th house: ${brief.facts.d10TenthSign}; lord ${brief.facts.d10TenthLord}.`, { sign: brief.facts.d10TenthSign, lord: brief.facts.d10TenthLord });
  put('D10.caveat', ['D10'], `D10 Lagna depends on an accurate birth time. ${brief.birthTimeCaveat.replace(/^- /, '')} D10 degrees are not calculated.`, brief.birthTimeCaveat);
  const yogaIds = brief.yogaEvidence.map((text, i) => put(`D1.yoga.${i}`, ['D1', 'D10'], `D1 combination (D10 career links are explicitly labelled): ${text.replaceAll('Neecha Bhanga Raja Yoga', 'Neecha Bhanga (cancelled debilitation)')}`, chart.yogas[i]));
  if (!yogaIds.length) yogaIds.push(put('D1.yoga.none', ['D1'], 'D1: no yoga is detected by the canonical engine. Absence of a detected combination is not a prediction of professional failure.', null));
  const scoped = (s: string) => `${s.includes('D10') ? 'D10' : 'D1'}: ${s}`;
  const fieldIds = brief.fields.map((f) => put(`D1.D10.field.${f.id}`, ['D1', 'D10'], `${f.label}: ${f.rating}. Supporting indicators: ${f.plus.map(scoped).join('; ') || 'none supplied'}. Limiting indicators: ${f.minus.map(scoped).join('; ') || 'none supplied; absence of a listed obstacle is not a guarantee'}. ${f.rating === 'weakly supported' ? 'This field is less indicated, not recommended by this reading.' : 'This is a traditional indication to compare with actual skills and experience.'}`, { ...f, plus: f.plus.map(scoped), minus: f.minus.map(scoped) }));
  const current = chart.dashas.vimshottari.mahadashas.find((m) => Date.parse(m.start) <= +asOf && +asOf < Date.parse(m.end));
  if (!current) throw new ReportGenerationError('Career period coverage unavailable');
  const periodIds: string[] = [];
  const period = (level: string, p: { lord: string; start: string; end: string }) => periodIds.push(put(`Vimshottari.${level}.${p.lord}.${p.start}`, ['Vimshottari'], `Vimshottari ${p.lord} ${level}: ${p.start.slice(0, 10)} to ${p.end.slice(0, 10)} (UTC boundaries).`, p));
  period('Mahadasha', current);
  const ads = current.antardashas.filter((a) => Date.parse(a.end) > +asOf).slice(0, 3);
  ads.forEach((a) => period('Antardasha', a));
  const next = chart.dashas.vimshottari.mahadashas.find((m) => m.start === current.end);
  if (next) period('Mahadasha', next);
  const pp = (g: string) => [`D1.planet.${g}`, `D10.planet.${g}`];
  const tenth = chart.houses[9].lord;
  const comparison = Array.from(new Set([tenth, brief.facts.d10LagnaLord, brief.facts.d10TenthLord]));
  const sameSign = chart.planets.filter((p) => chart.vargas.D10.placements.find((d) => d.planet === p.name)!.signIndex === p.signIndex).map((p) => p.name);
  const groups = [
    ['D1.ascendant', `D1.planet.${chart.houses[0].lord}`, 'D1.planet.Moon'],
    ['D1.house.10', `D1.planet.${tenth}`, 'D1.aspects', ...chart.planets.filter((p) => p.house === 10).map((p) => `D1.planet.${p.name}`)],
    ['D1.aspects', ...Array.from(new Set([...DOMAIN_SPECS.career.karakas, ...chart.aspects.filter((a) => a.aspectsHouses.includes(10)).map((a) => a.planet)])).map((g) => `D1.planet.${g}`)],
    ['D10.ascendant', 'D10.tenth', 'D10.caveat', ...Array.from(new Set([...comparison, ...chart.vargas.D10.placements.filter((p) => [1, 10].includes(p.house)).map((p) => p.planet)])).map((g) => `D10.planet.${g}`)],
    Array.from(new Set([...comparison, ...sameSign])).flatMap(pp), yogaIds, fieldIds,
    [6, 7, 10].flatMap((h) => [`D1.house.${h}`, `D1.planet.${chart.houses[h - 1].lord}`]),
    [...periodIds, ...Array.from(new Set([current.lord, ...ads.map((a) => a.lord)])).flatMap(pp)],
    ['D1.house.10', ...comparison.flatMap(pp)],
  ];
  const permitted = [
    'Explain the rising-sign and Moon foundations as context; do not infer personality, occupation or outcomes as established facts.',
    'Explain professional responsibility using the tenth-house conditions; strength supports expression, affliction qualifies it.',
    'Explain the supplied significators and aspects as traditional professional indicators, not proof of skills or leadership.',
    'Explain only the supplied D10 professional indications; birth-time sensitivity and D1 confirmation limit conclusions.',
    'Compare the same planet in D1 and D10; agreement reinforces an indication, differences qualify it without changing either placement.',
    'Explain only detected combinations, their rules and limitations; cancellation of debilitation is not proof of a separate royal combination.',
    'Compare only listed professional fields using their supporting and limiting indicators. Weakly supported fields must not be recommended.',
    'Compare service and trade indicators without declaring either certain; where no explicit comparative verdict is supplied, explain the trade-off.',
    'Explain the supplied periods as traditional timing context, not event predictions; never invent or change a boundary.',
    'Synthesize the supplied strengths and limitations into conditional practical steps; do not invent occupational history or guaranteed results.',
  ];
  const packets = CAREER_SECTIONS.map((s, id) => {
    const facts = Array.from(new Set(groups[id])).map((key) => all.get(key)!);
    if (facts.some((f) => !f)) throw new ReportGenerationError('Career evidence incomplete');
    const supporting = facts.filter((f) => /Own sign|Exalted|Moolatrikona|well supported/.test(f.text)).map((f) => f.id);
    const limiting = facts.filter((f) => /Debilitated|combust|weakly supported|sensitivity|cancelled/.test(f.text)).map((f) => f.id);
    return { id, heading: s.heading, minimumWords: id === 5 && !brief.facts.careerYogas?.length ? 40 : Math.floor(s.words[0] * (1 - WORD_TOLERANCE)), facts,
      supporting: supporting.length ? supporting : facts.map((f) => f.id), limiting: limiting.length ? limiting : facts.map((f) => f.id),
      indicators: {
        supporting: supporting.length ? supporting.map((id) => `${id}: the explicitly stated strength is a supporting traditional indication; do not infer skill or outcome`) : ['No unqualified favourable indicator is established here; explain the evidence and this inference limit.'],
        limiting: limiting.length ? limiting.map((id) => `${id}: discuss the stated condition, cancellation or birth-time limitation precisely; cancellation may mitigate a difficulty`) : ['No explicit adverse indicator is established here; absence of an obstacle is not proof of success.'],
      }, permittedInterpretations: [permitted[id], 'If no favourable or adverse indicator is established, explicitly state that evidence gap; do not manufacture one.'] };
  });
  return { chart, brief, packets, asOf: new Date(asOf) };
}

/**
 * Career & Profession Report, facts-first: the report plan. Every chart statement comes from the evidence ledger
 * (careerLedger.ts) and every conclusion from the synthesis (careerSynthesis.ts), both written by code. The model
 * writes one paragraph per slot, citing the ledger items it interprets (careerReportRendering.ts checks it).
 *
 * Five requests (parts), as before, write seven reader sections; all parts receive the same report-level plan
 * (the theses) so their conclusions agree, and each paragraph may cite only its slot's evidence.
 */
import { GRAHAS, SIGN_NAMES, isCurrentCanonicalChart, type CanonicalChart } from '@shared/v3/canonical';
import { ReportGenerationError } from './reportQuality';
import { computeCanonicalChart } from './astroEngine/canonical/compute';
import { FIELDS, type FieldId } from './careerReport';
import { buildCareerLedger, type CareerLedger } from './careerLedger';
import { synthesiseCareer, type CareerSynthesis, type WorkStyle } from './careerSynthesis';

export { dateOf } from './careerSynthesis';
export type { WorkStyle } from './careerSynthesis';

export const CAREER_HEADINGS = ['Executive Career Summary', 'Professional Identity', 'Strengths and Challenges', 'D1 and D10 Analysis', 'Professional Field Comparison', 'Career Timing', 'Career Strategy'] as const;
export type CareerHeading = (typeof CAREER_HEADINGS)[number];
export type SectionKey = 'overview' | 'chart' | 'fields' | 'timing' | 'strategy';

/** The same job for each field paragraph (the prompt states a repeated job once). */
export const FIELD_JOB = 'The field named: evidence for and against and which weighs more, the responsibilities and settings it suggests, and why it ranks where it does. What is particular to it.';
export const PERIOD_JOB = 'The period in its must-cite item: what its lord\'s condition and links bring forward, support and strain at work, with its dates.';

/** One paragraph the model writes. */
export interface CareerSlot {
  id: string;
  heading: CareerHeading;
  /** What the paragraph is for (to the model). */
  job: string;
  /** Ledger ids it may cite. */
  scope: string[];
  /** Ledger ids it must cite. */
  mustCite: string[];
  /** A required slot fails the report if still invalid after correction; an optional one is dropped. */
  required: boolean;
  /** Code-written words printed before the paragraph (a field's name and reading). */
  lead?: string;
}
export interface CareerSectionFacts {
  key: SectionKey;
  headings: CareerHeading[];
  /** The part's job (to the model). */
  purpose: string;
  slots: CareerSlot[];
  /** Career Strategy also asks for 3–5 next steps, citing ids from `stepScope`. */
  steps: boolean;
  stepScope: string[];
}
/** A ledger item as the shared text checks read it. */
export interface CareerFact { id: string; text: string; required: boolean; explain: boolean; chart?: 'D10' }
export interface CareerReportFacts {
  chart: CanonicalChart;
  asOf: Date;
  ledger: CareerLedger;
  synthesis: CareerSynthesis;
  workStyle: WorkStyle;
  /** The plain-words conclusion every section must agree with. */
  workStyleSentence: string;
  weakFields: FieldId[];
  strongFields: FieldId[];
  sections: CareerSectionFacts[];
}

/**
 * JSON with object keys sorted, so two values compare equal exactly when their contents do. A chart read back from
 * Postgres JSONB has its keys re-ordered (JSONB stores shorter keys first), so a plain JSON.stringify comparison
 * refused every saved chart; values, array order and numbers are still compared exactly.
 */
export function canonicalJson(value: unknown): string {
  const sorted = (v: unknown): unknown => Array.isArray(v) ? v.map(sorted)
    : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(sorted(value));
}

/** Recompute with the same engine; a stored chart that differs is refused before any spending. */
export function verifiedCareerChart(kundli: any): CanonicalChart {
  const stored = kundli?.chartData?.canonical;
  if (!isCurrentCanonicalChart(stored) || stored.birth.timeAccuracy !== 'exact') throw new ReportGenerationError('Career requires a complete canonical chart and exact birth time');
  const chart = computeCanonicalChart(stored.birth);
  for (const key of ['planets', 'ascendant', 'houses', 'aspects', 'vargas', 'dashas', 'yogas', 'strength'] as const) {
    if (canonicalJson(chart[key]) !== canonicalJson(stored[key])) throw new ReportGenerationError(`Career canonical verification failed: ${key}`);
  }
  return chart;
}

export function buildCareerReportFacts(kundli: unknown, asOf: Date): CareerReportFacts {
  const chart = verifiedCareerChart(kundli);
  const t = +asOf;
  if (!chart.dashas.vimshottari.mahadashas.some((m) => Date.parse(m.start) <= t && t < Date.parse(m.end) && m.antardashas.some((a) => Date.parse(a.start) <= t && t < Date.parse(a.end)))) {
    throw new ReportGenerationError('Career period coverage unavailable');
  }
  const ledger = buildCareerLedger(chart, asOf);
  const s = synthesiseCareer(ledger, asOf);
  const item = (id: string) => ledger.byId.get(id)!;
  const withSources = (ids: string[]) => Array.from(new Set(ids.flatMap((id) => [id, ...(item(id).derivedFrom ?? [])])));
  const T = s.theses;
  const { lords, planets, houses } = ledger;
  const W = { strong: 3, moderate: 2, weak: 1 } as const;
  /** The strongest counted items first: a paragraph's evidence list carries what can bear a conclusion. */
  const firmest = (xs: string[], n: number) => xs.filter((x) => item(x).role !== 'context').sort((a, b) => W[item(b).strength] - W[item(a).strength]).slice(0, n);
  /** A planet's condition in both charts and its lordships (not its capacity, which restates the condition). */
  const corePlanet = (g: string) => [planets[g].d1, planets[g].d10Dignity, planets[g].d10House, ...planets[g].links.filter((x) => item(x).ruleId !== 'context.same-sign-d10')].filter((x): x is string => !!x);
  const planetItems = (g: string) => [planets[g].d1, planets[g].d10Dignity, planets[g].d10House, ...planets[g].links, planets[g].capacity].filter((x): x is string => !!x);

  // ── Executive Career Summary + Professional Identity ──
  const overview: CareerSlot[] = [
    { id: 'summary.reading', heading: 'Executive Career Summary', required: true, mustCite: [T.verdict], scope: [T.verdict, T.leadership, T.strength, T.challenge, ...s.strengths.slice(0, 2), ...s.challenges.slice(0, 2)],
      job: 'The overall career reading and the two or three factors that most shape it, stronger first. Conclusions only.' },
    { id: 'summary.direction', heading: 'Executive Career Summary', required: true, mustCite: [T.fields], scope: [T.fields, T.d10, T.arrangement],
      job: 'Which fields lead and trail, the working arrangement, and what the D10 adds. Conclusions only.' },
    { id: 'summary.now', heading: 'Executive Career Summary', required: true, mustCite: [T.timing], scope: [T.timing, ...s.periods.map((p) => p.itemId)],
      job: 'The running periods\' tone for career and what changes at the next sub-period, with its date.' },
    { id: 'identity.foundation', heading: 'Professional Identity', required: true, mustCite: planets[lords.tenth].links.slice(0, 1), scope: Array.from(new Set([...firmest(houses[1], 2), ...firmest(houses[10], 3), ...corePlanet(lords.lagna), ...corePlanet(lords.tenth), T.leadership])),
      job: 'Professional make-up from the Lagna, its lord, the 10th house and its lord taken together: how they bear on each other, not a list.' },
    { id: 'identity.arrangement', heading: 'Professional Identity', required: true, mustCite: [T.arrangement], scope: withSources([T.arrangement]),
      job: 'Employment or independent work: what the 6th and 7th houses say, how firmly, and the working environments that follow.' },
  ];

  // ── Strengths and Challenges + D1 and D10 Analysis ──
  // The career lords first; the natural significators only while fewer than three lords are distinct.
  const relations = s.relations.slice(0, 3);
  const chartSlots: CareerSlot[] = [
    { id: 'strengths', heading: 'Strengths and Challenges', required: true, mustCite: [T.strength], scope: Array.from(new Set([T.strength, ...s.strengths.slice(0, 4), ...firmest(item(T.strength).derivedFrom ?? [], 3)])),
      job: 'Professional strengths, strongest first: what each makes easier at work and where they reinforce each other.' },
    { id: 'challenges', heading: 'Strengths and Challenges', required: true, mustCite: [T.challenge], scope: Array.from(new Set([T.challenge, ...s.challenges.slice(0, 4), ...firmest(item(T.challenge).derivedFrom ?? [], 3)])),
      job: 'Challenges, strongest first: what each makes harder at work and whether a strength offsets it.' },
    ...relations.map((r, i): CareerSlot => ({
      id: `d1d10.${i + 1}`, heading: 'D1 and D10 Analysis', required: i < 3, mustCite: [r.itemId], scope: [r.itemId, ...corePlanet(r.planet)],
      job: `${r.planet}: what its birth-chart and D10 conditions each say about work, and how the D10 ${r.relation === 'reinforces' ? 'reinforces' : r.relation === 'contradicts' ? 'cuts against' : r.relation === 'qualifies' ? 'qualifies' : 'leaves unresolved'} the birth-chart reading.`,
    })),
    { id: 'd1d10.overall', heading: 'D1 and D10 Analysis', required: true, mustCite: [T.d10], scope: [T.d10, ...relations.map((r) => r.itemId), s.d10.sensitivityId],
      job: 'What the D10 adds overall: where the charts agree or disagree, what that changes, and the birth-time caveat.' },
  ];

  // ── Professional Field Comparison ──
  const verdictLead = (v: string) => (v === 'Insufficient evidence' ? 'too little evidence to judge' : `${v.toLowerCase()} reading`);
  const fieldSlots: CareerSlot[] = [
    ...s.order.map((id): CareerSlot => {
      const f = s.fields.find((x) => x.id === id)!;
      return { id: `field.${id}`, heading: 'Professional Field Comparison', required: true, mustCite: [f.itemId], lead: `${f.label} (${verdictLead(f.verdict)}).`,
        // Its firmest evidence: the weak remainder is summarised in its assessment and comparisons.
        scope: Array.from(new Set([f.itemId, ...firmest(f.counted, 3), ...f.links.filter((x) => item(x).ruleId !== 'context.same-sign-d10'), ...s.comparisons.filter((c) => c.higher === id || c.lower === id).map((c) => c.itemId)])),
        job: FIELD_JOB };
    }),
    { id: 'fields.comparison', heading: 'Professional Field Comparison', required: true, mustCite: [T.fields], scope: [T.fields, ...s.comparisons.map((c) => c.itemId), ...s.fields.map((f) => f.itemId)],
      job: 'The ranking drawn together: what separates the leaders from the rest; where the chart cannot tell two fields apart, say so.' },
  ];

  // ── Career Timing ──
  const timingSlots: CareerSlot[] = [
    ...s.periods.map((p): CareerSlot => ({
      id: `timing.${p.key}`, heading: 'Career Timing', required: true, mustCite: [p.itemId], scope: withSources([p.itemId]),
      job: PERIOD_JOB,
    })),
    { id: 'timing.shift', heading: 'Career Timing', required: true, mustCite: [T.timing], scope: withSources([T.timing]),
      job: 'How the emphasis changes to the next sub-period: what to build now and prepare for, and when.' },
  ];

  // ── Career Strategy ──
  const strategyScope = [T.arrangement, T.fields, T.timing, ...s.fields.map((f) => f.itemId), ...s.periods.map((p) => p.itemId)];
  const strategySlots: CareerSlot[] = [
    { id: 'strategy.approach', heading: 'Career Strategy', required: true, mustCite: [T.fields], scope: strategyScope,
      job: 'A practical approach from the whole reading: directions to put first, use of the arrangement and timing, what to watch. No new conclusions.' },
  ];

  const sections: CareerSectionFacts[] = [
    { key: 'overview', headings: ['Executive Career Summary', 'Professional Identity'], slots: overview, steps: false, stepScope: [],
      purpose: 'The opening: the conclusions in brief (Executive Career Summary), then the person\'s professional make-up and working arrangement (Professional Identity). The summary states conclusions; the reasons belong to later sections.' },
    { key: 'chart', headings: ['Strengths and Challenges', 'D1 and D10 Analysis'], slots: chartSlots, steps: false, stepScope: [],
      purpose: 'The chart\'s professional strengths and challenges, then how the D10 bears on each career planet and on the overall reading.' },
    { key: 'fields', headings: ['Professional Field Comparison'], slots: fieldSlots, steps: false, stepScope: [],
      purpose: 'The six professional fields, best supported first, each on its own evidence, then the ranking drawn together.' },
    { key: 'timing', headings: ['Career Timing'], slots: timingSlots, steps: false, stepScope: [],
      purpose: 'The running Mahadasha and Antardasha and the next sub-period, each through its lord, then how the emphasis shifts.' },
    { key: 'strategy', headings: ['Career Strategy'], slots: strategySlots, steps: true, stepScope: strategyScope,
      purpose: 'Practical strategy that follows from the reading, then 3–5 concrete next steps.' },
  ];

  return {
    chart, asOf: new Date(asOf), ledger, synthesis: s, workStyle: s.workStyle, workStyleSentence: s.workStyleSentence,
    weakFields: s.fields.filter((f) => f.rating === 'weakly supported').map((f) => f.id),
    strongFields: s.fields.filter((f) => f.rating === 'well supported').map((f) => f.id),
    sections,
  };
}

/** Ledger items as the shared text checks read them. */
export function factsOf(evidence: CareerReportFacts, ids: string[]): CareerFact[] {
  return ids.map((id) => evidence.ledger.byId.get(id)).filter((x): x is NonNullable<typeof x> => !!x)
    .map((x) => ({ id: x.id, text: x.text, required: false, explain: true, ...(x.chart === 'D10' ? { chart: 'D10' as const } : {}) }));
}

/** Planet and sign names a text mentions. */
export const namesIn = (text: string) => ({
  planets: GRAHAS.filter((g) => new RegExp(`\\b${g}\\b`).test(text)),
  signs: SIGN_NAMES.filter((s) => new RegExp(`\\b${s}\\b`).test(text)),
});

export { FIELDS };

/**
 * Shared explanation layer (USER_FACING_REASONING_V1): turns the canonical interpretation context
 * into plain-language explanations for Kundli and Insights, and into one compact grounding block for
 * Ask and paid reports. Every sentence restates the context: the existing verdicts and evidence, or
 * reliable calculated facts. It adds no claim, score, date or timing of its own, keeps natal promise,
 * period activation, yoga formation and yoga effectiveness apart, and never says a yoga will deliver.
 */
import { DOMAIN_LABELS, type LifeDomain } from '@shared/v3/evidence';
import { EXPLANATIONS_VERSION, type AreaExplanation, type ChartExplanations, type ExplainedFactor, type PeriodExplanation, type PlanetExplanation, type YogaExplanation } from '@shared/v3/explanations';
import type { ContextArea, ContextFactor, ContextPeriod, ContextPlanet, ContextYoga, InterpretationContext } from './interpretationContext.js';

const ORD = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const areaName = (d: LifeDomain) => DOMAIN_LABELS[d].toLowerCase();
const tone = (d: string | null) => (d === 'positive' ? 'supportive' : d === 'negative' ? 'challenging' : 'neither clearly supportive nor challenging');
const LEVEL = { mahadasha: 'Mahadasha', antardasha: 'Antardasha' } as const;
const SUPPORTED: readonly string[] = ['Exceptional', 'Very Strong', 'Strong'];
const STRAINED: readonly string[] = ['Challenging', 'Very Challenging'];
/** The period lord's reading points one way and the area's own verdict the other. */
const opposes = (direction: string, verdict: string) =>
  (direction === 'positive' && STRAINED.includes(verdict)) || (direction === 'negative' && SUPPORTED.includes(verdict));
/** A dignity as a phrase ("in its own sign", "exalted"), from the engine's dignity label. */
const DIGNITY_PHRASE: Record<string, string> = {
  Exalted: 'exalted', Debilitated: 'debilitated', Moolatrikona: 'in its moolatrikona sign', 'Own sign': 'in its own sign',
  "Friend's sign": "in a friend's sign", 'Neutral sign': 'in a neutral sign', "Enemy's sign": "in an enemy's sign",
};
const dignityPhrase = (d: string) => DIGNITY_PHRASE[d] ?? d.toLowerCase();

export const INTERPRETIVE_DISCLOSURE = 'Jyotish is a traditional interpretive system, not a scientific prediction. These explanations describe how the tradition reads your chart; they are not guarantees.';
export const APPROXIMATE_DISCLOSURE = 'Your birth time is approximate, so anything that depends on the exact time — the Ascendant (Lagna), house positions and lords, house-based yogas and dasha dates — is left out of these explanations.';

const factor = (f: ContextFactor): ExplainedFactor => ({ evidenceId: f.evidenceId, text: f.text, strength: f.strength, kind: f.kind });

function periodLink(p: ContextArea['periods'][number], d: LifeDomain): string {
  const why: string[] = [];
  if (p.via.rules?.length) why.push(`${p.lord} rules your ${list(p.via.rules.map(ORD))} house${p.via.rules.length > 1 ? 's' : ''}`);
  if (typeof p.via.occupies === 'number') why.push(`${p.lord} sits in your ${ORD(p.via.occupies)} house`);
  if (p.via.significator) why.push(`${p.lord} is a natural significator of ${areaName(d)}`);
  return list(why);
}

function areaExplanation(a: ContextArea, ctx: InterpretationContext): AreaExplanation {
  const supports = a.supporting.slice(0, 3).map(factor);
  const challenges = a.challenging.slice(0, 3).map(factor);
  // Every running period that bears on the area (the Mahadasha and, when it differs, the Antardasha).
  const period = a.periods.length
    ? a.periods.map((p) => `Your running ${p.lord} ${LEVEL[p.level]} bears on ${areaName(a.domain)} because ${periodLink(p, a.domain)}. Navagraha reads ${p.lord}'s overall condition as ${tone(p.direction)}. This is one reading of the planet itself, used as a single factor wherever the period applies; it does not mean ${areaName(a.domain)} will go the same way as the other areas this period touches.${opposes(p.direction, a.verdict) ? ` Weighed with ${areaName(a.domain)}'s other factors, the assessment here is ${a.verdict.toLowerCase()}.` : ''}${p.natal === 'mixed' ? ` Some of the birth chart's own factors about ${p.lord} in this area point the other way: the natal promise and the current period are different questions, so both are kept.` : ''}`).join(' ')
    : null;
  const uncertainty: string[] = [];
  if (a.verdict === 'Insufficient evidence') uncertainty.push('There are too few reliable indicators to judge this area firmly.');
  else if (a.confidence === 'Low') uncertainty.push('Confidence is low: the indicators here are few or point in different directions.');
  if (a.mixed) uncertainty.push('Supporting and challenging factors are both present. They describe different influences rather than cancelling each other out.');
  if (a.openInterpretation) uncertainty.push('Astrologers weigh some of these factors differently, so treat the balance as an interpretation rather than a certainty.');
  if (ctx.birthTime === 'approximate') uncertainty.push('Factors that need the exact birth time were not used.');
  return {
    domain: a.domain, label: a.label, verdict: a.verdict, confidence: a.confidence,
    summary: `${a.conclusion} Confidence: ${a.confidence.toLowerCase()}.`,
    supports, challenges, period,
    yogas: a.yogas.map((y) => `${y.name} is present and counts toward this assessment. A formed yoga describes a potential; whether it delivers in full is not assessed.`),
    uncertainty,
  };
}

function planetExplanation(p: ContextPlanet, ctx: InterpretationContext): PlanetExplanation {
  const where = [p.sign ? `in ${p.sign}` : null, p.house ? `in your ${ORD(p.house)} house` : null].filter(Boolean).join(', ');
  const condition = [p.dignity ? dignityPhrase(p.dignity) : null, p.combust ? 'combust (close to the Sun)' : null].filter(Boolean).join(', ');
  const summary = `${p.planet}${where ? ` is ${where}` : ''}${condition ? `${where ? ', and' : ' is'} ${condition}` : ''}.`;
  const points: string[] = [];
  if (p.naturalNature) points.push(`In the tradition ${p.planet} is a natural ${p.naturalNature}.`);
  if (p.rules?.length) points.push(`It rules your ${list(p.rules.map(ORD))} house${p.rules.length > 1 ? 's' : ''}.`);
  if (p.karakaFor.length) points.push(`It is a natural significator of ${list(p.karakaFor.map(areaName))}.`);
  for (const a of p.areas) {
    const s = a.supporting[0], c = a.challenging[0];
    if (s && c) points.push(`In ${areaName(a.domain)} it works both ways: ${s.text} ${c.text}`);
    else if (s) points.push(`In ${areaName(a.domain)} it supports: ${s.text}`);
    else if (c) points.push(`In ${areaName(a.domain)} it challenges: ${c.text}`);
  }
  if (p.strongButChallenged) points.push(`Being ${dignityPhrase(p.dignity!)} is a real strength, yet it can still create challenges: dignity describes the planet's own condition, while its effect on an area also depends on where it sits and what it rules.`);
  for (const level of p.runningPeriods) points.push(`Its ${LEVEL[level]} is running now.`);
  const uncertainty: string[] = [];
  if (!p.sign) uncertainty.push(`Its sign changes during your birth date, so it is not stated.`);
  if (ctx.birthTime === 'approximate') uncertainty.push('Its house and the houses it rules are not shown because the birth time is approximate.');
  return { planet: p.planet, summary, points, uncertainty };
}

const NON_CONTRIBUTION: Record<string, string> = {
  'common-experimental': 'It is a common combination, so it is shown for context but not counted in any assessment.',
  cancelled: 'Because it is cancelled, it does not count in any assessment.',
  'counted-under-another-formation': 'Another formation of the same yoga already counts in the same areas.',
  'not-usable': 'It depends on details the birth time cannot support, so it is not used.',
  'neutral-evidence': 'Its reading is neutral, so it does not weigh in any assessment.',
  'no-area-mapped': 'It is not linked to a particular life area.',
};

function yogaExplanation(y: ContextYoga): YogaExplanation {
  const period = y.participantPeriods.length
    ? `${list(y.participantPeriods.map((x) => `${x.planet}'s ${LEVEL[x.level]}`))} ${y.participantPeriods.length > 1 ? 'are' : 'is'} running now. That makes the yoga's planets active in timing; it does not show that the yoga will deliver.`
    : null;
  const challenged = y.challengedParticipants.length
    ? ` ${list(y.challengedParticipants.map((x) => `${x.planet} is ${x.reading}`))}, which some astrologers take to weaken it; Navagraha does not judge by how much.`
    : '';
  return {
    id: y.id, name: y.name,
    // Formation, cancellation, contribution and effectiveness are each stated once, in that order.
    formation: `${y.name} is formed${y.participants.length ? ` by ${list([...y.participants])}` : ''}${y.cancelled ? ', and a condition that cancels it is also present in this chart' : ''}.`,
    contribution: y.contributesTo.length ? `It counts toward your ${list(y.contributesTo.map(areaName))} assessment${y.contributesTo.length > 1 ? 's' : ''}.` : NON_CONTRIBUTION[y.nonContribution ?? 'no-area-mapped'],
    effectiveness: y.cancelled
      ? `Whether any of its traditional result remains is not assessed.${challenged}`
      : `Whether it gives its full traditional result is not assessed: a formed yoga describes a potential, not a guarantee.${challenged}`,
    period,
  };
}

function periodExplanation(p: ContextPeriod, ctx: InterpretationContext): PeriodExplanation | null {
  if (p.status === 'not-running' || (p.level === 'antardasha' && p.sameLordAsMahadasha)) return null;
  if (p.status === 'withheld') {
    return { id: p.id, level: p.level, lord: null, areas: [], text: `The current ${LEVEL[p.level]} cannot be named because the birth time is approximate: a different period could be running.` };
  }
  const areas = p.areas.map((d) => DOMAIN_LABELS[d]);
  const linked = p.linkedAreas.map((d) => DOMAIN_LABELS[d]);
  const verdicts = ctx.areas.filter((a) => p.areas.includes(a.domain));
  const differ = new Set(verdicts.map((a) => a.verdict)).size > 1;
  // Bearing on an area (a link) and counting in its assessment (a non-neutral reading) are different things.
  const touches = areas.length
    ? ` It bears on ${list(areas.map((x) => x.toLowerCase()))}. Navagraha uses this one reading of ${p.lord} as a single factor in each of these areas; it does not make them turn out alike. Each area's assessment weighs it with that area's own birth-chart factors${differ ? ` (${verdicts.map((a) => `${areaName(a.domain)}: ${a.verdict.toLowerCase()}`).join('; ')})` : ''}.`
    : linked.length
      ? ` It bears on ${list(linked.map((x) => x.toLowerCase()))}. Because this reading is neutral, it counts neither for nor against ${linked.length > 1 ? 'any of these areas' : 'that area'}; ${linked.length > 1 ? "each area's" : "the area's"} assessment rests on its other factors.`
      : ` It is not linked to any of the life areas assessed here.`;
  return {
    id: p.id, level: p.level, lord: p.lord, areas,
    text: `Your running ${p.lord} ${LEVEL[p.level]}: Navagraha reads ${p.lord}'s overall condition as ${tone(p.direction)}.${touches}${ctx.birthTime === 'approximate' ? ' Its dates are not given because the birth time is approximate.' : ''}`,
  };
}

/** The explanations every surface shows: deterministic, from the context alone. */
export function buildExplanations(ctx: InterpretationContext): ChartExplanations {
  return {
    version: EXPLANATIONS_VERSION,
    birthTime: ctx.birthTime,
    areas: ctx.areas.map((a) => areaExplanation(a, ctx)),
    planets: ctx.planets.map((p) => planetExplanation(p, ctx)),
    yogas: ctx.yogas.map(yogaExplanation),
    periods: ctx.periods.map((p) => periodExplanation(p, ctx)).filter((x): x is PeriodExplanation => !!x),
    disclosures: [INTERPRETIVE_DISCLOSURE, ...(ctx.birthTime === 'approximate' ? [APPROXIMATE_DISCLOSURE] : [])],
  };
}

export const GROUNDING_RULES = [
  'Keep every verdict and confidence above exactly as given; explain it, never change it.',
  'Natal promise (the birth chart) and period activation (the running dasha) are separate questions; when they differ, explain both.',
  'A formed yoga is a potential, not a guarantee; its effectiveness is not assessed, so never promise its result. A yoga planet\'s running period is timing only, not proof the yoga will deliver.',
  'A strong dignity can coexist with challenges in an area; where factors pull different ways, explain each rather than forcing one direction.',
  'Where the interpretation is open, say so; do not present it as settled.',
  'Add no date, timing window or placement that is not supplied.',
];

/**
 * The grounding block for an AI prompt: the explanations for the chosen areas, the running periods,
 * the yogas and any strong-but-challenged planet. No dates, no new claims. `evidenceLines: false` leaves out
 * the per-area evidence sentences for a prompt that already carries them.
 */
const GROUNDING_HEADER = 'INTERPRETATION CONTEXT (prepared from the same calculation and evidence; explain it, never extend it):';
const rulesLines = () => ['Grounding rules:', ...GROUNDING_RULES.map((r) => `  - ${r}`)];
const yogaLine = (y: ChartExplanations['yogas'][number]) => `- ${y.formation} ${y.contribution} ${y.effectiveness}${y.period ? ` ${y.period}` : ''}`;
const isStrongButChallenged = (p: ChartExplanations['planets'][number]) => p.points.some((x) => x.includes('is a real strength, yet'));
/** A planet's line; the "strong yet challenging" note only stands beside a challenge it explains. */
function planetLine(p: ChartExplanations['planets'][number], points: string[]): string {
  const challengeShown = points.some((x) => / it (challenges|works both ways):/.test(x));
  return `- ${p.summary} ${points.filter((x) => challengeShown || !x.includes('is a real strength, yet')).join(' ')}`;
}

export function groundingBlock(ex: ChartExplanations, focus: { domains?: LifeDomain[]; planets?: string[]; allYogas?: boolean; evidenceLines?: boolean } = {}): string {
  const areas = focus.domains?.length ? ex.areas.filter((a) => focus.domains!.includes(a.domain)) : ex.areas;
  const whole = !focus.domains?.length;
  const lines: string[] = [GROUNDING_HEADER];
  for (const a of areas) {
    lines.push(`- ${a.summary}`);
    // The Ask packet already lists each area's evidence lines, so it asks for them to be left out here.
    if (focus.evidenceLines !== false && a.supports.length) lines.push(`  Supports: ${a.supports.map((s) => s.text).join(' | ')}`);
    if (focus.evidenceLines !== false && a.challenges.length) lines.push(`  Challenges: ${a.challenges.map((s) => s.text).join(' | ')}`);
    if (a.period) lines.push(`  Period: ${a.period}`);
    for (const y of a.yogas) lines.push(`  Yoga: ${y}`);
    for (const u of a.uncertainty) lines.push(`  Note: ${u}`);
  }
  for (const p of ex.periods) lines.push(`- ${p.text}`);
  // A focused prompt carries the yogas that count in its areas, involve its planets or have a running period;
  // the rest are named once, so the model can still say which combinations exist without promising them.
  const areaLabels = areas.map((a) => a.label.toLowerCase());
  const relevant = (y: ChartExplanations['yogas'][number]) => whole || focus.allYogas || !!y.period
    || areaLabels.some((l) => y.contribution.includes(l)) || (focus.planets ?? []).some((p) => y.formation.includes(p));
  for (const y of ex.yogas.filter(relevant)) lines.push(yogaLine(y));
  const others = Array.from(new Set(ex.yogas.filter((y) => !relevant(y)).map((y) => y.name)));
  if (others.length) lines.push(`- Also present (context only; formation is not a guaranteed result): ${others.join(', ')}.`);
  const touches = (p: ChartExplanations['planets'][number]) => whole || areaLabels.some((l) => p.points.some((x) => x.startsWith(`In ${l}`)));
  const planets = ex.planets.filter((p) => (focus.planets ?? []).includes(p.planet) || (isStrongButChallenged(p) && touches(p)));
  // A focused prompt keeps a planet's points about its own areas only.
  const inFocus = (x: string) => whole || !/^In [a-z&, ]+ it /.test(x) || areaLabels.some((l) => x.startsWith(`In ${l} `));
  for (const p of planets) lines.push(planetLine(p, p.points.filter(inFocus)));
  lines.push(...rulesLines());
  return lines.join('\n');
}

/**
 * What one part of a long report needs from the explanations. The parts that read the life areas (the
 * overview, the twelve houses, the life domains) take the whole block; the others take only their own
 * evidence:
 * - planets: the named planets in full, the yogas they form and their running periods;
 * - yogas: every yoga (formation, contribution, and that effectiveness is not assessed);
 * - periods: every running period and each area's reading of it;
 * - remedies: the running periods and the strong-but-challenged planets;
 * - rules: the grounding rules alone (the block holds nothing on doshas or transits).
 */
export type ReportSection =
  | { kind: 'whole' } | { kind: 'planets'; planets: readonly string[] } | { kind: 'yogas' }
  | { kind: 'periods' } | { kind: 'remedies' } | { kind: 'rules' };

export function sectionGroundingBlock(ex: ChartExplanations, section: ReportSection): string {
  if (section.kind === 'whole') return groundingBlock(ex);
  const lines: string[] = [GROUNDING_HEADER];
  const periods = ex.periods.map((p) => `- ${p.text}`);
  if (section.kind === 'planets') {
    const named = (s: string) => section.planets.some((p) => s.includes(p));
    for (const p of ex.planets.filter((x) => section.planets.includes(x.planet))) lines.push(planetLine(p, p.points));
    for (const y of ex.yogas.filter((y) => named(y.formation))) lines.push(yogaLine(y));
    lines.push(...ex.periods.filter((p) => p.lord && section.planets.includes(p.lord)).map((p) => `- ${p.text}`));
  } else if (section.kind === 'yogas') {
    lines.push(...ex.yogas.map(yogaLine));
  } else if (section.kind === 'periods') {
    lines.push(...periods);
    for (const a of ex.areas) if (a.period) lines.push(`- ${a.label}: ${a.period}`);
  } else if (section.kind === 'remedies') {
    lines.push(...periods);
    for (const p of ex.planets.filter(isStrongButChallenged)) lines.push(planetLine(p, p.points));
  }
  lines.push(...rulesLines());
  return lines.join('\n');
}

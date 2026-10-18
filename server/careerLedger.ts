/**
 * Career Report evidence ledger: every chart statement the Career Report may interpret, written by code from the
 * canonical chart, with an id the model cites. Most items are the production evidence engine's own items
 * (natalEvidence / houseEvidence / domainResolution), restated, never re-judged. The few career rules added here
 * apply the engine's existing conventions to the D10 and are listed, with their limits, in CAREER_RULES.
 *
 * Weights are the engine's strength classes (strong/moderate/weak) and every balance is the engine's own
 * (evidenceBalance / resolveDomain); nothing here introduces a number of its own.
 */
import type { CanonicalChart, Graha } from '@shared/v3/canonical';
import type { EvidenceDirection, EvidenceItem, EvidenceStrength } from '@shared/v3/evidence';
import { DUSTHANA, KENDRA, TRIKONA, dignityDirection, houseEvidence, indexChart, natalEvidence, planetCondition, type ChartIndex } from './astroEngine/evidence/engine';
import { domainResolution } from './astroEngine/evidence/insights';
import { signDignity } from './astroEngine/dignity';
import { evidenceMetadata } from './astroEngine/reasoning/evidenceMetadata';
import { FIELDS } from './careerReport';

export type LedgerChart = 'D1' | 'D10' | 'timing' | 'synthesis';
/**
 * counted: decides a balance (an engine core item, or a career rule below);
 * experimental: the engine's experimental tier or a provisional career rule — shown and interpreted with caution, never counted;
 * context: a placement, rulership or link — what the chart is, not how strong it is; never counted.
 */
export type LedgerRole = 'counted' | 'experimental' | 'context';

export interface LedgerItem {
  /** "E12" (evidence), "F.finance" (field), "C.1" (comparison), "R.Jupiter" (D1/D10 relation), "P.antardasha" (period), "T.verdict" (thesis). */
  id: string;
  /** Reader-facing statement written by code. */
  text: string;
  /** Short name for lists and comparisons ("10th lord dignity (Jupiter)"). */
  label: string;
  /** A shorter form for prompts, naming nothing `text` does not (the checks read `text`). */
  brief?: string;
  direction: EvidenceDirection;
  strength: EvidenceStrength;
  role: LedgerRole;
  chart: LedgerChart;
  planets: Graha[];
  houses: number[];
  /** The general rule applied, in plain words. */
  rule: string;
  /** Engine evidence id, or a CAREER_RULES id. */
  ruleId: string;
  /** The engine rule that produced an engine item ("house.occupant.malefic"), from its evidence metadata. */
  engineRule?: string;
  /** For conclusions built from other items: the items they rest on. */
  derivedFrom?: string[];
  /** The engine item this restates, or an engine-shaped item for a career rule (used only in engine balances). */
  evidence?: EvidenceItem;
}

/** The interpretive rules this report adds. Each applies an existing engine convention to a new input. */
export const CAREER_RULES = {
  'career.significator-dignity': {
    rule: 'A field\'s natural significator is judged by its sign dignity, exactly as the engine judges a domain\'s karaka (karakaRules).',
    limits: 'The six fields and their significators are textbook associations (FIELDS), not an engine domain; the dignity reading is the engine\'s.',
  },
  'career.d10-dignity': {
    rule: 'A planet exalted or in its own sign in the D10 supports what it signifies professionally; debilitated in the D10, it weakens it. The engine applies this to the 10th lord (vargaRules); the report applies it to the other career planets.',
    limits: 'Friendly, neutral and enemy D10 signs are stated but not counted, as in the engine. Moolatrikona is not judged in the D10. The D10 depends on an exact birth time.',
  },
  'career.d10-house': {
    rule: 'A planet in a D10 angle or trine (1, 4, 5, 7, 9, 10) can express itself in professional life; in a D10 6th, 8th or 12th house it works under strain. This is the house rule the engine applies to period lords (planetCondition), read in the D10.',
    limits: 'Weak strength only; widely taught but applied here without a cited verse. Depends on the exact birth time.',
  },
  'career.antardasha-relation': {
    rule: 'A sub-period lord placed 6th, 8th or 12th from the major-period lord is traditionally read as less harmonious; in an angle or trine from it, as more harmonious.',
    limits: 'Provisional: shown and interpreted with caution, never counted in a period\'s tone. Sign positions in the birth chart.',
  },
} as const;

const ORD = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
export const ord = ORD;
export const listOf = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
export const the = (g: string) => (g === 'Sun' || g === 'Moon' ? `the ${g}` : g);
export const The = (g: string) => (g === 'Sun' || g === 'Moon' ? `The ${g}` : g);
const SEVEN: Graha[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
const SIGN_LORDS: Graha[] = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];
const DIGNITY_WORDS: Record<string, string> = {
  Exalted: 'exalted', 'Own sign': 'in its own sign', Moolatrikona: 'in its Moolatrikona sign', "Friend's sign": 'in a friendly sign', 'Neutral sign': 'in a neutral sign', "Enemy's sign": "in an enemy's sign", Debilitated: 'debilitated',
};
/** Houses any career field or the career profile reads. */
export const CAREER_HOUSES = [1, 2, 3, 5, 6, 7, 9, 10, 11];

export interface CareerLedger {
  chart: CanonicalChart;
  ix: ChartIndex;
  items: LedgerItem[];
  byId: Map<string, LedgerItem>;
  /** Engine evidence id → ledger id. */
  byEngineId: Map<string, string>;
  /** The production career resolution (the Kundli page's Career verdict). */
  career: ReturnType<typeof domainResolution>;
  leadership: ReturnType<typeof domainResolution>;
  lords: { lagna: Graha; tenth: Graha; d10Lagna: Graha; d10Tenth: Graha };
  /** Per planet: its D1 dignity item, D10 dignity item, D10 house item and context links (ledger ids). */
  planets: Record<string, { d1?: string; d10Dignity?: string; d10House?: string; links: string[]; capacity: string }>;
  /** Per house: the engine's items about it (ledger ids). */
  houses: Record<number, string[]>;
  add(item: Omit<LedgerItem, 'id'> & { id?: string }): string;
}

export function buildCareerLedger(chart: CanonicalChart, asOf: Date): CareerLedger {
  const ix = indexChart(chart);
  const items: LedgerItem[] = [];
  const byId = new Map<string, LedgerItem>();
  const byEngineId = new Map<string, string>();
  let n = 0;
  const add: CareerLedger['add'] = (item) => {
    const id = item.id ?? `E${++n}`;
    const full = { ...item, id } as LedgerItem;
    items.push(full); byId.set(id, full);
    if (item.evidence && item.ruleId === item.evidence.id) byEngineId.set(item.evidence.id, id);
    return id;
  };
  const fromEngine = (e: EvidenceItem): string => {
    const known = byEngineId.get(e.id);
    if (known) return known;
    // A yoga's description ends in a one-line promise ("— status and success"), which is not a chart fact; the
    // engine's "Neecha Bhanga Raja Yoga" is a cancelled debilitation only.
    const yoga = e.source === 'Yoga' ? chart.yogas.find((y) => y.name === e.factor) : undefined;
    const neecha = e.factor === 'Neecha Bhanga Raja Yoga';
    const description = e.explanation.split(' — ')[0].replace(/\.$/, '');
    const text = !yoga ? e.explanation : neecha ? `Neecha Bhanga (a cancelled debilitation): ${description}.` : `${e.factor} (${listOf(yoga.planets.map(the))}): ${description}.`;
    return add({
      text, label: yoga ? (neecha ? `${yoga.planets[0]}'s cancelled debilitation (Neecha Bhanga)` : e.factor) : e.planet && !e.factor.includes(e.planet) ? `${e.factor} (${e.planet})` : e.factor, direction: e.direction, strength: e.strength, role: e.usable ? (e.tier === 'core' ? 'counted' : 'experimental') : 'context',
      chart: e.source === 'D10' ? 'D10' : e.source === 'Dasha' ? 'timing' : 'D1', planets: yoga ? (yoga.planets as Graha[]) : e.planet ? [e.planet] : [], houses: e.house ? [e.house] : [],
      rule: e.rule, ruleId: e.id, engineRule: evidenceMetadata(e)?.ruleId, evidence: e,
    });
  };

  const career = domainResolution(chart, 'career', asOf);
  const leadership = domainResolution(chart, 'leadership', asOf);
  for (const e of [...career.supporting, ...career.conflicting, ...career.neutral, ...career.experimental]) fromEngine(e);

  const houses: CareerLedger['houses'] = {};
  for (const h of CAREER_HOUSES) {
    const own = h === 10 ? natalEvidence(chart, 'career', ix).filter((e) => e.house === 10 && e.source !== 'D10') : houseEvidence(chart, 'career', h, ix);
    houses[h] = own.map(fromEngine);
  }

  const d10 = chart.vargas.D10;
  const d10Of = (g: Graha) => d10.placements.find((p) => p.planet === g)!;
  const lords = {
    lagna: chart.houses[0].lord as Graha, tenth: chart.houses[9].lord as Graha,
    d10Lagna: SIGN_LORDS[d10.ascendantSignIndex], d10Tenth: SIGN_LORDS[(d10.ascendantSignIndex + 9) % 12],
  };
  const aspecting10 = chart.aspects.filter((a) => a.aspectsHouses.includes(10)).map((a) => a.planet);

  const planets: CareerLedger['planets'] = {};
  // Rahu and Ketu have no dignity; they still have a D10 house, links and a period-lord capacity.
  for (const g of [...SEVEN, 'Rahu', 'Ketu'] as Graha[]) {
    const p = ix.planet(g), dig = ix.dignity(g);
    // D1 dignity: the engine's karaka item where it made one (Sun, Saturn), else the same rule for a field significator.
    const karaka = career.supporting.concat(career.conflicting, career.neutral).find((e) => e.factor === `${g} as significator`);
    let d1: string | undefined;
    if (karaka) d1 = fromEngine(karaka);
    else {
      const dd = dignityDirection(dig);
      if (dd) {
        const strength: EvidenceStrength = dd.strength === 'strong' ? 'moderate' : 'weak';
        d1 = add({ text: `${The(g)} is ${dd.text} in ${p.sign}.`, label: `${g} as significator`, direction: dd.direction, strength, role: 'counted', chart: 'D1', planets: [g], houses: [],
          rule: CAREER_RULES['career.significator-dignity'].rule, ruleId: 'career.significator-dignity', evidence: engineShaped(`career:d1:${g}-dignity`, g, dd.direction, strength, 'D1') });
      }
    }

    // D10 dignity: the engine's own item for the 10th lord; the same rule for the other planets.
    const xd = SEVEN.includes(g) ? signDignity(g, d10Of(g).signIndex) : null;
    const engineD10 = g === lords.tenth ? career.supporting.concat(career.conflicting).find((e) => e.source === 'D10') : undefined;
    let d10Dignity: string | undefined;
    if (engineD10) d10Dignity = fromEngine(engineD10);
    else if (xd === 'Exalted' || xd === 'Own sign' || xd === 'Debilitated') {
      const direction: EvidenceDirection = xd === 'Debilitated' ? 'negative' : 'positive';
      const strength: EvidenceStrength = xd === 'Exalted' ? 'strong' : 'moderate';
      d10Dignity = add({ text: `In the D10, ${the(g)} is ${DIGNITY_WORDS[xd]} in ${d10Of(g).sign}.`, label: `${g}'s D10 dignity`, direction, strength, role: 'counted', chart: 'D10', planets: [g], houses: [],
        rule: CAREER_RULES['career.d10-dignity'].rule, ruleId: 'career.d10-dignity', evidence: engineShaped(`career:d10:${g}-dignity`, g, direction, strength, 'D10') });
    } else if (xd) {
      d10Dignity = add({ text: `In the D10, ${the(g)} is ${DIGNITY_WORDS[xd]} (${d10Of(g).sign}).`, label: `${g}'s D10 sign`, direction: 'neutral', strength: 'weak', role: 'context', chart: 'D10', planets: [g], houses: [],
        rule: CAREER_RULES['career.d10-dignity'].limits, ruleId: 'career.d10-dignity' });
    }

    const xh = d10Of(g).house;
    const angular = KENDRA.includes(xh) || TRIKONA.includes(xh), hard = DUSTHANA.includes(xh);
    const d10House = add({
      text: `In the D10, ${the(g)} is in the ${ORD(xh)} house${angular ? `, ${KENDRA.includes(xh) ? 'an angle' : 'a trine'} of the D10` : hard ? ', a difficult (6th, 8th or 12th) house of the D10' : ''}.`,
      label: `${g}'s D10 house`, direction: angular ? 'positive' : hard ? 'negative' : 'neutral', strength: 'weak', role: angular || hard ? 'counted' : 'context', chart: 'D10', planets: [g], houses: [xh],
      rule: CAREER_RULES['career.d10-house'].rule, ruleId: 'career.d10-house',
      evidence: angular || hard ? engineShaped(`career:d10:${g}-house`, g, angular ? 'positive' : 'negative', 'weak', 'D10') : undefined,
    });

    const links: string[] = [];
    const d1Roles = [g === lords.lagna && 'your Lagna (rising sign)', g === lords.tenth && 'your 10th house of career'].filter(Boolean) as string[];
    if (d1Roles.length) links.push(add({ text: `${The(g)} rules ${listOf(d1Roles)} in the birth chart.`, label: `${g}'s birth-chart lordship`, direction: 'neutral', strength: 'moderate', role: 'context', chart: 'D1', planets: [g], houses: [g === lords.lagna ? 1 : 10], rule: 'A house lord carries that house\'s matters; its condition shows how well it delivers them.', ruleId: 'context.lordship' }));
    const d10Roles = [g === lords.d10Lagna && 'the D10 Lagna', g === lords.d10Tenth && "the D10's 10th house"].filter(Boolean) as string[];
    if (d10Roles.length) links.push(add({ text: `${The(g)} rules ${listOf(d10Roles)}.`, label: `${g}'s D10 lordship`, direction: 'neutral', strength: 'moderate', role: 'context', chart: 'D10', planets: [g], houses: [], rule: 'The D10 Lagna and 10th lords carry professional matters in the Dasamsa.', ruleId: 'context.d10-lordship' }));
    const placedIn10 = p.house === 10, aspects10 = aspecting10.includes(g) && !placedIn10;
    if (placedIn10 || aspects10) links.push(add({ text: `${The(g)} ${placedIn10 ? 'occupies' : 'aspects'} your 10th house.`, label: `${g}'s link to the 10th`, direction: 'neutral', strength: 'weak', role: 'context', chart: 'D1', planets: [g], houses: [10], rule: 'A planet occupying or aspecting the 10th house colours career matters.', ruleId: 'context.tenth-link' }));
    if (d10Of(g).signIndex === p.signIndex) links.push(add({ text: `${The(g)} is in ${p.sign} in both the birth chart and the D10.`, label: `${g} in the same sign in D1 and D10`, direction: 'neutral', strength: 'weak', role: 'context', chart: 'D10', planets: [g], houses: [], rule: 'A planet in the same sign in the birth chart and a divisional chart expresses the same sign there. (Classical vargottama refers to the D9; no extra strength is assumed here.)', ruleId: 'context.same-sign-d10' }));

    // How well it can deliver in its periods: the engine's period-lord rule, restated (not counted again).
    const cond = planetCondition(ix, g);
    const capacity = add({ label: `${g}'s capacity as a period lord`, text: `As a period lord, ${the(g)}'s capacity reads as ${cond.direction === 'positive' ? 'supportive' : cond.direction === 'negative' ? 'strained' : 'neutral'}${cond.reasons.length ? ` (${cond.reasons.join('; ')})` : ' (no strong or weak dignity, and not in an angle, trine or difficult house)'}.`,
      direction: cond.direction, strength: 'moderate', role: 'context', chart: 'D1', planets: [g], houses: [p.house],
      rule: 'A planet delivers its period according to its dignity and house placement (the engine\'s period-lord rule).', ruleId: 'context.capacity' });
    planets[g] = { d1, d10Dignity, d10House, links, capacity };
  }

  return { chart, ix, items, byId, byEngineId, career, leadership, lords, planets, houses, add };
}

/** An engine-shaped item for a career rule, so engine balances (evidenceBalance / resolveDomain) can read it. */
function engineShaped(id: string, planet: Graha, direction: EvidenceDirection, strength: EvidenceStrength, source: 'D1' | 'D10'): EvidenceItem {
  return { id, domain: 'career', factor: id, planet, direction, strength, source, provenance: 'derived-rule', rule: '', explanation: '', requiresBirthTime: true, usable: true, tier: 'core' };
}

/** Engine items for a set of ledger ids (counted and experimental; context items carry none). */
export function engineItems(ledger: CareerLedger, ids: string[]): EvidenceItem[] {
  return ids.map((id) => ledger.byId.get(id)?.evidence).filter((e): e is EvidenceItem => !!e);
}

/** The field significators and houses, from FIELDS (textbook associations; see careerReport.ts). */
export const fieldSpec = (id: keyof typeof FIELDS) => FIELDS[id];

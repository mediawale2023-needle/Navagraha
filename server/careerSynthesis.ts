/**
 * Career Report synthesis: the conclusions every section shares, derived by code from the evidence ledger
 * (careerLedger.ts). Balances are always the engine's (resolveDomain / evidenceBalance); what this module adds is
 * how items relate — which evidence a field shares with another and which is its own, whether the D10 agrees with
 * the birth chart, which planet recurs across the chart's strengths or strains, and what changes between periods.
 * Each conclusion is a ledger item citing the items it rests on (`derivedFrom`). Rules: CAREER_SYNTHESIS_RULES.
 */
import type { Graha } from '@shared/v3/canonical';
import { VERDICTS, type EvidenceDirection, type Verdict } from '@shared/v3/evidence';
import { evidenceBalance, resolveDomain } from './astroEngine/evidence/resolution';
import { planetDomainLinks } from './astroEngine/evidence/engine';
import { naturalRelation } from './astroEngine/dignity';
import { FIELDS, d10LagnaWindow, type FieldId } from './careerReport';
import { CAREER_RULES, engineItems, listOf, ord, the, The, type CareerLedger, type LedgerItem } from './careerLedger';

/** How the synthesis relates evidence. No rule here weighs evidence; balances are the engine's. */
export const CAREER_SYNTHESIS_RULES = {
  'house-neutral': 'Houses are compared only through rules that read every house alike. Left out: the rules whose direction depends on the kind of house (a malefic occupying or aspecting a house helps in the 3rd, 6th, 10th and 11th and strains elsewhere; a lord in a difficult house is not held against the 6th). They are classical and stay in the Career verdict, but comparing houses through them favours some by construction. Fields, which read different numbers of houses, also leave out the one-sided rules (a benefic occupant and Jupiter\'s aspect can only support), which otherwise rate most fields strong. Measured over 300 random synthetic charts (all engine rules → these): fields rated well supported per chart 2.4 → 2.9 with the one-sided rules removed (3.6 with them); Administration in the top tier 74% → 56%, Advisory 16% → 26%; employment favoured 51% → 31%, independent work 5% → 16%. Residual: Administration is still in the top tier more often than the others; not adjusted, since no further rule could be justified.',
  'field.assessment': 'A field is judged by the engine\'s resolveDomain over the counted evidence on its significators (D1 dignity, D10 dignity and D10 house) and its houses (the engine\'s house rules). Lordship of the 10th or the D10 Lagna is a link, not support: it makes the planet\'s condition matter, in whichever direction that condition points.',
  'field.comparison': 'Fields are ordered by that verdict, and within one verdict by the engine\'s balance (which only orders). Two neighbours are compared by the counted items only one of them draws on. Identical counted evidence means the chart cannot distinguish them; a shared verdict whose differences are all weak indicators means it does not clearly separate them.',
  'arrangement': 'Employment (the 6th house of service) against independent work (the 7th of trade and partnership): each house\'s engine balance is read with the engine\'s verdict bands (r ≥ 0.25 supportive). One supported and the other not decides a lean; both supported is a mix; neither, or too little evidence (total weight under 3, i.e. less than one strong indicator), leaves it unresolved.',
  'd1-d10': 'For each career planet, the birth-chart reading is the engine\'s period-lord capacity (dignity and house). The D10 reading is its counted D10 items. D10 items only agreeing reinforce; only opposing contradict; both qualify; none leave it unresolved. Where the birth chart is neutral, a directional D10 qualifies it.',
  'recurring': 'A planet recurs as a strength (or strain) when at least two different counted items about it point the same way; where several do, the one with the greatest engine weight (strong 3, moderate 2, weak 1, as resolveDomain weighs) is named.',
  'period': 'A period\'s tone is the engine\'s period-lord capacity. What it activates is the houses its lord rules and occupies and the fields it signifies; Rahu and Ketu, owning no sign, also reach the fields of the lord of the sign they occupy (as commonly taught). The D10 standing and the relation to the major-period lord qualify the tone and never change it.',
} as const;

export type FieldRating = 'well supported' | 'mixed' | 'weakly supported' | 'unclear';
export interface FieldAssessment {
  id: FieldId; label: string; verdict: Verdict; rating: FieldRating; itemId: string;
  counted: string[]; supporting: string[]; conflicting: string[]; links: string[]; careerAxis: boolean;
}
export interface FieldComparison { itemId: string; higher: FieldId; lower: FieldId; relation: 'ranks-above' | 'on-a-par' | 'not-clearly-separable' | 'indistinguishable'; onlyHigher: string[]; onlyLower: string[] }
export type D10Relation = 'reinforces' | 'contradicts' | 'qualifies' | 'unresolved';
export interface PlanetRelation { planet: Graha; roles: string[]; itemId: string; d1: EvidenceDirection; relation: D10Relation; d10For: string[]; d10Against: string[] }
export type WorkStyle = 'employment' | 'independent' | 'mixed' | 'unresolved';
export interface PeriodReading { key: 'mahadasha' | 'antardasha' | 'next'; level: 'Mahadasha' | 'Antardasha'; lord: Graha; within?: Graha; start: string; end: string; itemId: string; tone: EvidenceDirection; fields: FieldId[]; activationId: string; relationId?: string; items: string[] }

export interface CareerSynthesis {
  fields: FieldAssessment[];
  /** Fields in order, best first; ties keep FIELDS order. */
  order: FieldId[];
  comparisons: FieldComparison[];
  relations: PlanetRelation[];
  d10: { relation: D10Relation; itemId: string; sensitivityId: string; window: { earlier: number | null; later: number | null } };
  workStyle: WorkStyle;
  workStyleSentence: string;
  strengths: string[];
  challenges: string[];
  periods: PeriodReading[];
  theses: Record<ThesisKey, string>;
  /** One-line forms of the theses, for parts that do not interpret them (the shared plan stays in every prompt). */
  briefs: Record<ThesisKey, string>;
}
export type ThesisKey = 'verdict' | 'leadership' | 'arrangement' | 'fields' | 'd10' | 'strength' | 'challenge' | 'timing';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Engine boundaries are UTC instants; the report states their UTC calendar date. */
export const dateOf = (iso: string) => { const d = new Date(iso); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const rank = (v: Verdict) => VERDICTS.indexOf(v);
const RATING: Record<Verdict, FieldRating> = { Exceptional: 'well supported', 'Very Strong': 'well supported', Strong: 'well supported', Mixed: 'mixed', Challenging: 'weakly supported', 'Very Challenging': 'weakly supported', 'Insufficient evidence': 'unclear' };
const direction = (v: Verdict): EvidenceDirection | null => (rank(v) <= 2 ? 'positive' : v === 'Mixed' ? 'neutral' : v === 'Insufficient evidence' ? null : 'negative');
const tone = (d: EvidenceDirection) => (d === 'positive' ? 'supportive' : d === 'negative' ? 'strained' : 'neutral');
const verdictWords = (v: Verdict) => (v === 'Insufficient evidence' ? 'too thinly evidenced to judge' : `${v.toLowerCase()}`);

export const WORK_STYLE_SENTENCES: Record<WorkStyle, string> = {
  employment: 'the chart favours employment within an organisation over independent business',
  independent: 'the chart favours independent work or business over salaried employment',
  mixed: 'the chart supports both employment and independent work, without favouring one',
  unresolved: 'the chart does not clearly favour employment or independent work',
};

/**
 * How the D10 evidence bears on a birth-chart reading. `agreeing`/`opposing` are the D10's counted items on the
 * reading's side and against it (for a neutral reading: positive and negative). A neutral reading has no side to
 * agree with: one-sided D10 evidence leans it, two-sided leaves it open.
 */
export function d10Relation(d1: EvidenceDirection | null, agreeing: readonly unknown[], opposing: readonly unknown[]): D10Relation {
  if (!agreeing.length && !opposing.length) return 'unresolved';
  if (d1 === 'neutral' || d1 === null) return agreeing.length && opposing.length ? 'unresolved' : 'qualifies';
  return agreeing.length && opposing.length ? 'qualifies' : agreeing.length ? 'reinforces' : 'contradicts';
}

export function synthesiseCareer(ledger: CareerLedger, asOf: Date): CareerSynthesis {
  const { chart, byId, planets, houses, lords, add } = ledger;
  const item = (id: string) => byId.get(id)!;
  const counted = (ids: Array<string | undefined>) => Array.from(new Set(ids.filter((id): id is string => !!id && item(id).role !== 'context')));
  const labels = (ids: string[]) => listOf(ids.map((id) => item(id).label));
  const dir = (ids: string[], d: EvidenceDirection) => ids.filter((id) => item(id).role === 'counted' && item(id).direction === d);

  const W = { strong: 3, moderate: 2, weak: 1 } as const;
  // Rules whose direction depends on the house type (CAREER_SYNTHESIS_RULES['house-neutral']).
  // CAREER_SYNTHESIS_RULES['house-neutral']. Lord placement is house-typed only where the engine exempts a lord's own
  // difficult house: of the houses read here, the 6th.
  const HOUSE_TYPED = ['house.occupant.malefic-upachaya', 'house.occupant.malefic', 'house.aspect.saturn-mars'];
  const sixthLordPlacement = (id: string) => !!item(id).engineRule?.startsWith('house.lord-placement.') && item(id).houses.includes(6);
  /** Rules that read every house alike (for the 6th against the 7th). */
  const houseNeutral = (ids: string[]) => ids.filter((id) => !HOUSE_TYPED.includes(item(id).engineRule ?? '') && !sixthLordPlacement(id));
  /** Of those, the rules that can point either way (for fields, which differ in how many houses they read). */
  const TWO_SIDED = /^(?:house\.lord-placement\.|house\.lord-dignity$|house\.sav$|house\.lord-dig-bala$)/;
  const comparable = (ids: string[]) => houseNeutral(ids).filter((id) => TWO_SIDED.test(item(id).engineRule ?? ''));
  // ── Fields ──
  const fields: FieldAssessment[] = (Object.keys(FIELDS) as FieldId[]).map((id) => {
    const spec = FIELDS[id];
    const ids = counted([...comparable(spec.houses.flatMap((h) => houses[h])), ...spec.planets.flatMap((g) => [planets[g].d1, planets[g].d10Dignity, planets[g].d10House])]);
    const res = resolveDomain('career', engineItems(ledger, ids), { approximate: false });
    const links = spec.planets.flatMap((g) => planets[g].links);
    const careerAxis = spec.planets.some((g) => [lords.tenth, lords.d10Lagna, lords.d10Tenth].includes(g)) || spec.houses.includes(10);
    const supporting = dir(ids, 'positive'), conflicting = dir(ids, 'negative');
    const itemId = add({
      id: `F.${id}`, label: spec.label,
      text: `${spec.label} (significators ${listOf(spec.planets.map(the))}; houses ${listOf(spec.houses.map(ord))}) reads as ${verdictWords(res.verdict)}: ${supporting.length} indicator${supporting.length === 1 ? '' : 's'} for, ${conflicting.length} against.`,
      brief: `${spec.label} (${listOf(spec.planets.map(the))}; ${listOf(spec.houses.map(ord))}): ${verdictWords(res.verdict)}, ${supporting.length} for, ${conflicting.length} against.`,
      direction: direction(res.verdict) ?? 'neutral', strength: 'moderate', role: 'context', chart: 'synthesis', planets: spec.planets, houses: spec.houses,
      rule: CAREER_SYNTHESIS_RULES['field.assessment'], ruleId: 'field.assessment', derivedFrom: [...ids, ...links],
    });
    return { id, label: spec.label, verdict: res.verdict, rating: RATING[res.verdict], itemId, counted: ids, supporting, conflicting, links, careerAxis };
  });
  const keyOrder = Object.keys(FIELDS) as FieldId[];
  // Within one verdict, the engine's own balance orders the fields (as in resolveDomain, it only orders); list
  // order would always put the first field first.
  const balance = new Map(fields.map((f) => [f.id, evidenceBalance(engineItems(ledger, f.counted)).r]));
  const sorted = fields.slice().sort((a, b) => rank(a.verdict) - rank(b.verdict) || balance.get(b.id)! - balance.get(a.id)! || keyOrder.indexOf(a.id) - keyOrder.indexOf(b.id));

  const comparisons: FieldComparison[] = [];
  const compare = (a: FieldAssessment, b: FieldAssessment) => {
    const onlyA = a.counted.filter((x) => !b.counted.includes(x)), onlyB = b.counted.filter((x) => !a.counted.includes(x));
    const relation: FieldComparison['relation'] = !onlyA.length && !onlyB.length ? 'indistinguishable'
      : a.verdict !== b.verdict ? 'ranks-above'
        : [...onlyA, ...onlyB].every((x) => item(x).strength === 'weak') ? 'not-clearly-separable' : 'on-a-par';
    // The strongest differences, at most two a side: a comparison names what separates, not everything.
    const side = (f: FieldAssessment, only: string[]) => {
      const firm = (d: EvidenceDirection) => only.filter((x) => item(x).direction === d).sort((x, y) => W[item(y).strength] - W[item(x).strength]);
      const pos = firm('positive'), neg = firm('negative');
      const named = (xs: string[]) => `${labels(xs.slice(0, 2))}${xs.length > 2 ? ` (+${xs.length - 2} weaker)` : ''}`;
      const parts = [pos.length && `support from ${named(pos)}`, neg.length && `strain from ${named(neg)}`].filter(Boolean);
      return parts.length ? `Only ${f.label} draws on ${parts.join('; and ')}.` : '';
    };
    const head = relation === 'indistinguishable' ? `${a.label} and ${b.label} rest on the same counted evidence, so the chart does not distinguish between them.`
      : relation === 'ranks-above' ? `${a.label} (${verdictWords(a.verdict)}) ranks above ${b.label} (${verdictWords(b.verdict)}).`
        : `${a.label} and ${b.label} share the same reading (${verdictWords(a.verdict)}).`;
    const tail = relation === 'not-clearly-separable' ? 'Every difference between them is a weak indicator, so the chart does not clearly separate the two.' : '';
    const word = (f: FieldAssessment) => f.label.split(' ')[0];
    const terse = (f: FieldAssessment, only: string[]) => { const firm = (d: EvidenceDirection) => only.filter((x) => item(x).direction === d).sort((x, y) => W[item(y).strength] - W[item(x).strength]).slice(0, 2).map((x) => `${d === 'positive' ? '+' : '-'}${item(x).label}`); const xs = [...firm('positive'), ...firm('negative')]; return xs.length ? `${word(f)} only: ${xs.join(', ')}.` : ''; };
    const brief = [relation === 'indistinguishable' ? `${word(a)} = ${word(b)}: same counted evidence.` : relation === 'ranks-above' ? `${word(a)} (${verdictWords(a.verdict)}) above ${word(b)} (${verdictWords(b.verdict)}).` : `${word(a)} and ${word(b)} both ${verdictWords(a.verdict)}${relation === 'not-clearly-separable' ? ', differences all weak' : ''}.`, terse(a, onlyA), terse(b, onlyB)].filter(Boolean).join(' ');
    const itemId = add({
      id: `C.${a.id}.${b.id}`, label: `${a.label} against ${b.label}`, brief, text: [head, side(a, onlyA), side(b, onlyB), tail].filter(Boolean).join(' '),
      direction: 'neutral', strength: 'moderate', role: 'context', chart: 'synthesis', planets: [], houses: [],
      rule: CAREER_SYNTHESIS_RULES['field.comparison'], ruleId: 'field.comparison', derivedFrom: [a.itemId, b.itemId, ...onlyA, ...onlyB],
    });
    comparisons.push({ itemId, higher: a.id, lower: b.id, relation, onlyHigher: onlyA, onlyLower: onlyB });
  };
  for (let i = 0; i + 1 < sorted.length; i++) compare(sorted[i], sorted[i + 1]);
  // Identical evidence further apart is stated too: two fields the chart cannot tell apart are said to be so.
  for (let i = 0; i < sorted.length; i++) for (let j = i + 2; j < sorted.length; j++) {
    const a = sorted[i], b = sorted[j];
    if (a.counted.length === b.counted.length && a.counted.every((x) => b.counted.includes(x))) compare(a, b);
  }

  // ── D1 and D10 ──
  const roleNames = (g: Graha) => [g === lords.tenth && 'your 10th lord', g === lords.lagna && 'your Lagna lord', g === lords.d10Lagna && 'the D10 Lagna lord', g === lords.d10Tenth && "the D10's 10th lord", (g === 'Sun' || g === 'Saturn') && 'a natural significator of career'].filter(Boolean) as string[];
  const keyPlanets = Array.from(new Set<Graha>([lords.tenth, lords.lagna, lords.d10Lagna, lords.d10Tenth, 'Sun', 'Saturn']));
  const relate = d10Relation;
  const relations: PlanetRelation[] = keyPlanets.map((g) => {
    const p = planets[g], cap = item(p.capacity);
    const d10 = counted([p.d10Dignity, p.d10House]).filter((x) => item(x).role === 'counted');
    const agree = (x: string) => (cap.direction === 'neutral' ? item(x).direction === 'positive' : item(x).direction === cap.direction);
    const d10For = d10.filter((x) => item(x).direction !== 'neutral' && agree(x));
    const d10Against = d10.filter((x) => item(x).direction !== 'neutral' && !agree(x));
    const relation = relate(cap.direction, d10For, d10Against);
    const d10Text = [p.d10Dignity, p.d10House].filter(Boolean).map((x) => item(x!).text.replace(/^In the D10, (?:the )?\w+ is /, '').replace(/\.$/, '')).join(', and ');
    const lean = d10For[0] ?? d10Against[0];
    const verdictText = relation === 'reinforces' ? 'The D10 reinforces the birth-chart reading.'
      : relation === 'contradicts' ? 'The D10 points the other way from the birth chart.'
        : relation === 'qualifies' ? (cap.direction === 'neutral' && lean ? `The birth chart leaves it neutral; the D10 adds a ${tone(item(lean).direction)} lean.` : 'The D10 partly supports and partly strains it, so it qualifies the birth-chart reading.')
          : d10For.length || d10Against.length ? 'Its D10 evidence pulls both ways, so the D10 does not settle a reading the birth chart leaves neutral.' : 'Its D10 placement carries no counted strength or weakness, so the D10 leaves the birth-chart reading as it is.';
    const itemId = add({
      id: `R.${g}`, label: `${g} in D1 and D10`,
      text: `${The(g)} (${listOf(roleNames(g))}): in the birth chart its capacity reads as ${tone(cap.direction)}; in the D10 it is ${d10Text}. ${verdictText}`,
      direction: cap.direction, strength: 'moderate', role: 'context', chart: 'synthesis', planets: [g], houses: [],
      rule: CAREER_SYNTHESIS_RULES['d1-d10'], ruleId: 'd1-d10', derivedFrom: [p.capacity, ...(p.d1 ? [p.d1] : []), ...[p.d10Dignity, p.d10House].filter((x): x is string => !!x), ...p.links],
    });
    return { planet: g, roles: roleNames(g), itemId, d1: cap.direction, relation, d10For, d10Against };
  });
  const careerDir = direction(ledger.career.verdict);
  const d10All = Array.from(new Set(relations.flatMap((r) => counted([planets[r.planet].d10Dignity, planets[r.planet].d10House]).filter((x) => item(x).role === 'counted'))));
  const d10Pos = d10All.filter((x) => item(x).direction === 'positive'), d10Neg = d10All.filter((x) => item(x).direction === 'negative');
  const d10For = careerDir === 'negative' ? d10Neg : d10Pos, d10Against = careerDir === 'negative' ? d10Pos : d10Neg;
  const d10Overall = relate(careerDir, d10For, d10Against);
  const window = d10LagnaWindow(chart);
  const d10Lagna = chart.vargas.D10;
  const minutes = (m: number | null, way: string) => (m ? `${m - 1} minute${m - 1 === 1 ? '' : 's'} ${way}` : `at least an hour ${way}`);
  const sensitivityId = add({
    label: 'D10 birth-time sensitivity', text: `The D10 depends on an accurate birth time: its rising sign stays ${['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'][d10Lagna.ascendantSignIndex]} for a birth up to ${minutes(window.earlier, 'earlier')} and ${minutes(window.later, 'later')}.`,
    direction: 'neutral', strength: 'weak', role: 'context', chart: 'D10', planets: [], houses: [], rule: 'The D10 Lagna moves through a sign in about twelve minutes of birth time.', ruleId: 'context.d10-sensitivity',
  });
  const d10Words = {
    reinforces: 'the D10 evidence for the career planets reinforces it',
    contradicts: 'the D10 evidence for the career planets points the other way',
    qualifies: careerDir === 'neutral' || careerDir === null ? 'the D10 evidence for the career planets adds a lean the birth chart leaves open' : 'the D10 evidence for the career planets partly supports and partly strains it',
    unresolved: d10All.length ? 'the D10 evidence for the career planets pulls both ways, so it does not tip that reading' : 'the D10 shows no counted strength or weakness for the career planets, so it leaves that reading as it is',
  }[d10Overall];
  const d10Id = add({
    id: 'T.d10', label: 'What the D10 adds',
    text: `Against the overall career reading (${verdictWords(ledger.career.verdict)}), ${d10Words}.${d10Pos.length ? ` Supporting in the D10: ${labels(d10Pos)}.` : ''}${d10Neg.length ? ` Straining in the D10: ${labels(d10Neg)}.` : ''}`,
    direction: 'neutral', strength: 'moderate', role: 'context', chart: 'synthesis', planets: [], houses: [], rule: CAREER_SYNTHESIS_RULES['d1-d10'], ruleId: 'd1-d10',
    derivedFrom: [...relations.map((r) => r.itemId), ...d10All, sensitivityId],
  });

  // ── Work arrangement ──
  const band = (h: number) => { const b = evidenceBalance(engineItems(ledger, houseNeutral(houses[h]))); return b.pos + b.neg < 3 ? 'thin' : b.r >= 0.25 ? 'positive' : b.r <= -0.25 ? 'negative' : 'mixed'; };
  const b6 = band(6), b7 = band(7);
  const workStyle: WorkStyle = b6 === 'positive' && b7 !== 'positive' ? 'employment' : b7 === 'positive' && b6 !== 'positive' ? 'independent' : b6 === 'positive' && b7 === 'positive' ? 'mixed' : 'unresolved';
  const bandWords = (b: string) => ({ positive: 'supportive', negative: 'strained', mixed: 'mixed', thin: 'too thinly evidenced to judge' }[b]);
  const tenthLordHouse = chart.planets.find((p) => p.name === lords.tenth)!.house;
  // Each house's own evidence, for and against, so an unresolved answer says what each side has and why it does not settle.
  const sideOf = (h: number, name: string, b: string) => {
    const ids = houseNeutral(houses[h]).filter((x) => item(x).role === 'counted');
    const firm = (d: EvidenceDirection) => ids.filter((x) => item(x).direction === d).sort((x, y) => W[item(y).strength] - W[item(x).strength]).map((x) => `${item(x).label} (${item(x).strength})`);
    const pos = firm('positive'), neg = firm('negative');
    const list = (xs: string[]) => `${listOf(xs.slice(0, 3))}${xs.length > 3 ? ` and ${xs.length - 3} more` : ''}`;
    const detail = !pos.length && !neg.length ? 'no counted indicator either way' : [pos.length && `for it, ${list(pos)}`, neg.length && `against it, ${list(neg)}`].filter(Boolean).join('; ');
    return `Your ${ord(h)} house of ${name} reads as ${bandWords(b)} (${detail}).`;
  };
  const why = workStyle !== 'unresolved' ? ''
    : b6 === 'thin' && b7 === 'thin' ? ' Neither house carries enough counted evidence to decide.'
      : b6 !== 'positive' && b7 !== 'positive' ? ' Neither house is clearly supportive, so the chart gives no basis to prefer one arrangement.'
        : '';
  const arrangementId = add({
    id: 'T.arrangement', label: 'Employment or independent work',
    text: `${sideOf(6, 'service and employment', b6)} ${sideOf(7, 'trade and partnership', b7)}${why} So ${WORK_STYLE_SENTENCES[workStyle]}.${[6, 7].includes(tenthLordHouse) ? ` Your 10th lord, ${the(lords.tenth)}, sits in the ${ord(tenthLordHouse)} house, tying career to ${tenthLordHouse === 6 ? 'service' : 'partnership and trade'}.` : ''}`,
    direction: 'neutral', strength: 'moderate', role: 'context', chart: 'synthesis', planets: [6, 7].includes(tenthLordHouse) ? [lords.tenth] : [], houses: [6, 7],
    rule: CAREER_SYNTHESIS_RULES.arrangement, ruleId: 'arrangement', derivedFrom: houseNeutral([...houses[6], ...houses[7]]).filter((x) => item(x).role !== 'context' || [6, 7].includes(tenthLordHouse)),
  });

  // ── Strengths, challenges and what recurs ──
  const pool = Array.from(new Set([...houses[10], ...houses[1], ...houses[6], ...houses[7], ...houses[11], ...ledger.items.filter((x) => x.chart === 'timing').map((x) => x.id), ...keyPlanets.flatMap((g) => counted([planets[g].d1, planets[g].d10Dignity, planets[g].d10House]))]))
    .filter((x) => item(x).role === 'counted');
  const top = (d: EvidenceDirection) => { const xs = pool.filter((x) => item(x).direction === d).sort((a, b) => W[item(b).strength] - W[item(a).strength]); const firm = xs.filter((x) => item(x).strength !== 'weak'); return (firm.length >= 3 ? firm : xs).slice(0, 5); };
  const strengths = top('positive'), challenges = top('negative');
  const recurring = (d: EvidenceDirection) => {
    // Natal evidence only: a running period is a passing emphasis, not a trait of the chart.
    const all = ledger.items.filter((x) => x.role === 'counted' && x.direction === d && x.planets.length === 1 && x.chart !== 'timing');
    const byPlanet = new Map<Graha, string[]>();
    for (const x of all) byPlanet.set(x.planets[0], [...(byPlanet.get(x.planets[0]) ?? []), x.id]);
    const weight = (ids: string[]) => ids.reduce((sum, x) => sum + W[item(x).strength], 0);
    const best = Array.from(byPlanet).filter(([, ids]) => ids.length >= 2).sort((a, b) => weight(b[1]) - weight(a[1]) || (keyPlanets.indexOf(a[0]) + 1 || 99) - (keyPlanets.indexOf(b[0]) + 1 || 99))[0];
    return best ? { planet: best[0], ids: best[1] } : null;
  };
  const rs = recurring('positive'), rc = recurring('negative');
  const recurText = (r: { planet: Graha; ids: string[] } | null, what: string) => r
    ? `${The(r.planet)} recurs as a ${what}: ${labels(r.ids)} ${r.ids.length === 2 ? 'both' : 'all'} point the same way${roleNames(r.planet).length ? `, and it is ${listOf(roleNames(r.planet))}` : ''}.`
    : `No single planet recurs as a ${what} across the chart.`;
  const strengthId = add({ id: 'T.strength', label: 'Recurring strength', text: recurText(rs, 'strength'), direction: 'positive', strength: 'moderate', role: 'context', chart: 'synthesis', planets: rs ? [rs.planet] : [], houses: [], rule: CAREER_SYNTHESIS_RULES.recurring, ruleId: 'recurring', derivedFrom: [...(rs?.ids ?? []), ...strengths] });
  const challengeId = add({ id: 'T.challenge', label: 'Recurring challenge', text: recurText(rc, 'challenge'), direction: 'negative', strength: 'moderate', role: 'context', chart: 'synthesis', planets: rc ? [rc.planet] : [], houses: [], rule: CAREER_SYNTHESIS_RULES.recurring, ruleId: 'recurring', derivedFrom: [...(rc?.ids ?? []), ...challenges] });

  // ── Periods ──
  const t = +asOf;
  const mds = chart.dashas.vimshottari.mahadashas;
  const md = mds.find((m) => Date.parse(m.start) <= t && t < Date.parse(m.end))!;
  const ad = md.antardashas.find((a) => Date.parse(a.start) <= t && t < Date.parse(a.end))!;
  const nextAd = md.antardashas.find((a) => Date.parse(a.start) > t) ?? mds.find((m) => m.start === md.end)?.antardashas[0];
  const nextWithin = nextAd && !md.antardashas.includes(nextAd) ? mds.find((m) => m.start === md.end)!.lord : md.lord;
  const dispositor = (g: Graha): Graha | null => (g === 'Rahu' || g === 'Ketu' ? (['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'] as Graha[])[chart.planets.find((p) => p.name === g)!.signIndex] : null);
  const ownFields = (g: Graha) => (Object.keys(FIELDS) as FieldId[]).filter((f) => FIELDS[f].planets.includes(g) || FIELDS[f].houses.some((h) => chart.houses[h - 1].lord === g || chart.planets.find((p) => p.name === g)!.house === h));
  // Rahu and Ketu own no sign: as commonly taught, they give the results of the lord of the sign they occupy.
  const fieldsOf = (g: Graha) => { const d = dispositor(g); return Array.from(new Set([...ownFields(g), ...(d ? ownFields(d) : [])])); };
  const activation = (g: Graha) => {
    const ruled = chart.houses.filter((h) => h.lord === g).map((h) => h.house), sits = chart.planets.find((p) => p.name === g)!.house;
    const career = planetDomainLinks(ledger.ix, g).find((l) => l.domain === 'career');
    const keys = Object.keys(FIELDS) as FieldId[];
    const name = (fs: FieldId[]) => listOf(fs.map((f) => FIELDS[f].label.toLowerCase()));
    const asSignificator = keys.filter((f) => FIELDS[f].planets.includes(g));
    const byRule = ruled.map((h) => [h, keys.filter((f) => FIELDS[f].houses.includes(h) && !asSignificator.includes(f))] as const).filter(([, fs]) => fs.length);
    const bySeat = keys.filter((f) => FIELDS[f].houses.includes(sits) && !asSignificator.includes(f) && !byRule.some(([, fs]) => fs.includes(f)));
    const short = (fs: FieldId[]) => listOf(fs.map((f) => FIELDS[f].label.split(' ')[0].toLowerCase()));
    const ties = [
      asSignificator.length && `as significator: ${short(asSignificator)}`,
      ...byRule.map(([h, fs]) => `as ${ord(h)} lord: ${short(fs as FieldId[])}`),
      bySeat.length && `from the ${ord(sits)}: ${short(bySeat)}`,
    ].filter(Boolean) as string[];
    return add({
      label: `${g}'s period links`,
      text: `${The(g)} ${ruled.length ? `rules your ${listOf(ruled.map(ord))} house${ruled.length > 1 ? 's' : ''} and ` : ''}sits in your ${ord(sits)} house.${career ? ` For career: ${career.reasons.join('; ')}.` : ' It has no direct link to your 10th house.'}${ties.length ? ` Fields it bears on (${ties.join('; ')}).` : ''}${dispositor(g) ? ` Owning no sign, it works through ${the(dispositor(g)!)}, the lord of the sign it occupies, and so also bears on ${listOf(ownFields(dispositor(g)!).map((f) => FIELDS[f].label.split(' ')[0].toLowerCase())) || 'no further field'}.` : ''}`,
      direction: 'neutral', strength: 'moderate', role: 'context', chart: 'timing', planets: dispositor(g) ? [g, dispositor(g)!] : [g], houses: Array.from(new Set([...ruled, sits])),
      rule: CAREER_SYNTHESIS_RULES.period, ruleId: 'period.activation',
    });
  };
  const adRelation = (lord: Graha, major: Graha) => {
    if (lord === major) return undefined;
    const n = ((chart.planets.find((p) => p.name === lord)!.signIndex - chart.planets.find((p) => p.name === major)!.signIndex + 12) % 12) + 1;
    const d: EvidenceDirection = [6, 8, 12].includes(n) ? 'negative' : [1, 4, 5, 7, 9, 10].includes(n) ? 'positive' : 'neutral';
    let rel = '';
    try { rel = ` By nature, ${the(lord)} treats ${the(major)} as ${{ friend: 'a friend', neutral: 'neutral', enemy: 'an enemy' }[naturalRelation(lord, major)]}.`; } catch { rel = ''; }
    return add({
      label: `${lord} from ${major}`, text: `${The(lord)} is ${ord(n)} from ${the(major)} counting signs in the birth chart, a position traditionally read as ${d === 'negative' ? 'less harmonious' : d === 'positive' ? 'more harmonious' : 'neither especially harmonious nor difficult'}.${rel}`,
      direction: d, strength: 'weak', role: 'experimental', chart: 'timing', planets: [lord, major], houses: [], rule: CAREER_RULES['career.antardasha-relation'].rule, ruleId: 'career.antardasha-relation',
    });
  };
  const reading = (key: PeriodReading['key'], level: PeriodReading['level'], p: { lord: Graha; start: string; end: string }, within?: Graha): PeriodReading => {
    const lord = p.lord, cap = item(planets[lord]?.capacity ?? '') as LedgerItem | undefined;
    const activationId = activation(lord);
    const relationId = within ? adRelation(lord, within) : undefined;
    const when = key === 'next' ? `begins on ${dateOf(p.start)} and runs to ${dateOf(p.end)}` : `runs from ${dateOf(p.start)} to ${dateOf(p.end)} and is running now`;
    const itemId = add({
      id: `P.${key}`, label: `${lord} ${level}`,
      text: `The ${lord} ${level}${level === 'Mahadasha' ? ' (major period)' : ' (sub-period)'}${within ? ` within the ${within} Mahadasha` : ''} ${when}. Its tone for career is ${tone(cap?.direction ?? 'neutral')}, from its lord's capacity.`,
      brief: `${lord} ${level}${within ? ` (in ${within})` : ''}, ${dateOf(p.start)} to ${dateOf(p.end)}${key === 'next' ? ', to come' : ', running now'}; tone ${tone(cap?.direction ?? 'neutral')}.`,
      direction: cap?.direction ?? 'neutral', strength: 'moderate', role: 'context', chart: 'timing', planets: [lord], houses: [],
      rule: CAREER_SYNTHESIS_RULES.period, ruleId: 'period.reading',
      derivedFrom: [...(planets[lord] ? [planets[lord].capacity] : []), activationId, ...(relationId ? [relationId] : []), ...(planets[lord] ? counted([planets[lord].d10Dignity, planets[lord].d10House]) : [])],
    });
    return { key, level, lord, within, start: p.start, end: p.end, itemId, tone: cap?.direction ?? 'neutral', fields: fieldsOf(lord), activationId, relationId, items: item(itemId).derivedFrom! };
  };
  const periods: PeriodReading[] = [reading('mahadasha', 'Mahadasha', md), reading('antardasha', 'Antardasha', ad, md.lord)];
  if (nextAd) periods.push(reading('next', 'Antardasha', nextAd, nextWithin));
  const [, cur, nxt] = periods;
  const gained = nxt ? nxt.fields.filter((f) => !cur.fields.includes(f)) : [], lost = nxt ? cur.fields.filter((f) => !nxt.fields.includes(f)) : [];
  const timingId = add({
    id: 'T.timing', label: 'How the emphasis shifts',
    text: nxt ? `On ${dateOf(nxt.start)} the sub-period passes from ${cur.lord} (tone ${tone(cur.tone)}) to ${nxt.lord} (tone ${tone(nxt.tone)}).${gained.length ? ` Fields the new sub-period brings forward: ${listOf(gained.map((f) => FIELDS[f].label.toLowerCase()))}.` : ''}${lost.length ? ` Fields it no longer emphasises: ${listOf(lost.map((f) => FIELDS[f].label.toLowerCase()))}.` : ''}${!gained.length && !lost.length ? ' Both bear on the same fields, so the change is one of tone rather than direction.' : ''}`
      : `The ${cur.lord} sub-period is the last calculated within the period window.`,
    direction: 'neutral', strength: 'moderate', role: 'context', chart: 'timing', planets: Array.from(new Set([cur.lord, ...(nxt ? [nxt.lord] : [])])), houses: [],
    rule: CAREER_SYNTHESIS_RULES.period, ruleId: 'period.shift', derivedFrom: [cur.itemId, ...(nxt ? [nxt.itemId] : []), cur.activationId, ...(nxt ? [nxt.activationId] : [])],
  });

  // ── Theses ──
  const c = ledger.career;
  const engineLabel = (e: (typeof c.supporting)[number]) => { const id = ledger.byEngineId.get(e.id); return id ? item(id).label.replace(/^Running /, 'the running ') : e.factor; };
  const engineIds = (xs: typeof c.supporting) => xs.map((e) => ledger.byEngineId.get(e.id)).filter((x): x is string => !!x);
  const verdictId = add({
    id: 'T.verdict', label: 'Overall career reading',
    text: `On the evidence engine's reading (the same as your Kundli's Career verdict), career reads as ${verdictWords(c.verdict)}, with ${c.confidence.toLowerCase()} confidence: ${c.supporting.length} supporting and ${c.conflicting.length} conflicting indicator${c.conflicting.length === 1 ? '' : 's'}.${c.supporting[0] ? ` The strongest support: ${engineLabel(c.supporting[0])}.` : ''}${c.conflicting[0] ? ` The main counter-indication: ${engineLabel(c.conflicting[0])}.` : ''}`,
    direction: direction(c.verdict) ?? 'neutral', strength: 'strong', role: 'context', chart: 'synthesis', planets: [], houses: [10],
    rule: 'The production evidence engine\'s Career verdict (resolveDomain over the career evidence and the running periods).', ruleId: 'production.career', derivedFrom: [...engineIds(c.supporting), ...engineIds(c.conflicting)],
  });
  const l = ledger.leadership;
  const leadershipItems = [...l.supporting, ...l.conflicting].map((e) => ledger.byEngineId.get(e.id)).filter((x): x is string => !!x);
  const leadershipId = add({
    id: 'T.leadership', label: 'Leadership reading',
    text: `Leadership (your 10th and 1st houses, with the Sun and Mars) reads as ${verdictWords(l.verdict)} on the same engine, with ${l.confidence.toLowerCase()} confidence.`,
    direction: direction(l.verdict) ?? 'neutral', strength: 'moderate', role: 'context', chart: 'synthesis', planets: ['Sun', 'Mars'], houses: [1, 10],
    rule: 'The production evidence engine\'s Leadership verdict.', ruleId: 'production.leadership', derivedFrom: leadershipItems.length ? leadershipItems : [...houses[1], ...houses[10]].filter((x) => item(x).role === 'counted'),
  });
  const tiers = Array.from(new Set(sorted.map((f) => f.verdict)));
  const fieldsId = add({
    id: 'T.fields', label: 'How the six fields compare',
    text: tiers.map((v, i) => `${i === 0 ? 'Best supported' : i === tiers.length - 1 && direction(v) !== 'positive' ? 'Least supported' : 'Then'}: ${listOf(sorted.filter((f) => f.verdict === v).map((f) => f.label.toLowerCase()))} (${verdictWords(v)}).`).join(' ')
      + (tiers.length === 1 ? ' All six fields share one reading, so the comparison rests on what each draws on alone.' : ''),
    direction: 'neutral', strength: 'moderate', role: 'context', chart: 'synthesis', planets: [], houses: [],
    rule: CAREER_SYNTHESIS_RULES['field.comparison'], ruleId: 'field.comparison', derivedFrom: [...fields.map((f) => f.itemId), ...comparisons.map((x) => x.itemId)],
  });

  const short = (v: Verdict) => (v === 'Insufficient evidence' ? 'unclear' : v.toLowerCase());
  const briefs: Record<ThesisKey, string> = {
    verdict: `career ${short(c.verdict)} (${c.confidence.toLowerCase()} confidence)`,
    leadership: `leadership ${short(l.verdict)}`,
    arrangement: WORK_STYLE_SENTENCES[workStyle],
    fields: tiers.map((v) => `${short(v)}: ${sorted.filter((f) => f.verdict === v).map((f) => f.label.split(' ')[0].toLowerCase()).join(', ')}`).join('; '),
    d10: `the D10 ${d10Overall === 'reinforces' ? 'reinforces' : d10Overall === 'contradicts' ? 'cuts against' : d10Overall === 'qualifies' ? 'qualifies' : 'does not settle'} the career reading`,
    strength: rs ? `recurring strength: ${rs.planet}` : 'no recurring strength',
    challenge: rc ? `recurring challenge: ${rc.planet}` : 'no recurring challenge',
    timing: nxt ? `next sub-period ${nxt.lord} from ${dateOf(nxt.start)}` : 'no further sub-period in view',
  };
  return {
    briefs,
    fields, order: sorted.map((f) => f.id), comparisons, relations,
    d10: { relation: d10Overall, itemId: d10Id, sensitivityId, window },
    workStyle, workStyleSentence: WORK_STYLE_SENTENCES[workStyle], strengths, challenges, periods,
    theses: { verdict: verdictId, leadership: leadershipId, arrangement: arrangementId, fields: fieldsId, d10: d10Id, strength: strengthId, challenge: challengeId, timing: timingId },
  };
}

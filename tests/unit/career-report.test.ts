/**
 * The Career Report's deterministic layer: the evidence ledger, the synthesis and the report plan. Everything here
 * runs without a model. Seven invented charts (SYNTHETIC_CHARTS) and a seeded random sweep stand in for customers.
 */
import { describe, expect, it } from 'vitest';
import { GRAHAS, SIGN_NAMES } from '@shared/v3/canonical';
import { buildInsights } from '../../server/astroEngine/evidence/insights';
import { planetCondition } from '../../server/astroEngine/evidence/engine';
import { resolveDomain } from '../../server/astroEngine/evidence/resolution';
import { signDignity } from '../../server/astroEngine/dignity';
import { engineItems } from '../../server/careerLedger';
import { d10Relation } from '../../server/careerSynthesis';
import { buildCareerReportFacts, CAREER_HEADINGS, dateOf, type CareerReportFacts } from '../../server/careerReportEvidence';
import { careerSectionPrompt } from '../../server/careerReportRendering';
import { CAREER_BUDGET_MICRO_USD, CAREER_OUTPUT_TOKENS } from '../../server/careerReportGeneration';
import { ASOF, fixtureChart, SYNTHETIC_CHARTS } from '../fixtures/career-chart';

const NAMES = Object.keys(SYNTHETIC_CHARTS) as Array<keyof typeof SYNTHETIC_CHARTS>;
const cache = new Map<string, CareerReportFacts>();
const facts = (name: keyof typeof SYNTHETIC_CHARTS) => {
  if (!cache.has(name)) cache.set(name, buildCareerReportFacts(fixtureChart(...SYNTHETIC_CHARTS[name]), ASOF));
  return cache.get(name)!;
};
const text = (e: CareerReportFacts, id: string) => e.ledger.byId.get(id)!.text;

describe('every chart statement matches the engine', () => {
  it.each(NAMES)('D1 and D10 placements, dignities and dates (%s)', (name) => {
    const e = facts(name); const c = e.chart;
    const all = e.ledger.items.map((x) => x.text).join('\n');
    // "In the D10, <planet> is in the <N>th house" / "… is <dignity> in <Sign>"
    for (const m of Array.from(all.matchAll(/In the D10, (?:the )?(\w+) is in the (\d+)\w\w house/g))) expect(c.vargas.D10.placements.find((p) => p.planet === m[1])!.house).toBe(Number(m[2]));
    for (const m of Array.from(all.matchAll(/In the D10, (?:the )?(\w+) is (?:exalted|in its own sign|debilitated) in (\w+)\./g))) expect(c.vargas.D10.placements.find((p) => p.planet === m[1])!.sign).toBe(m[2]);
    for (const m of Array.from(all.matchAll(/In the D10, (?:the )?(\w+) is in an? (friendly|neutral|enemy's) sign \((\w+)\)/g))) {
      const p = c.vargas.D10.placements.find((x) => x.planet === m[1])!;
      expect(p.sign).toBe(m[3]);
      expect(signDignity(m[1], p.signIndex)).toBe({ friendly: "Friend's sign", neutral: 'Neutral sign', "enemy's": "Enemy's sign" }[m[2]]);
    }
    // "<Planet> rules your <N>th and <M>th houses and sits in your <K>th house" (period links)
    for (const m of Array.from(all.matchAll(/(?:^|\. )(?:The )?(\w+) rules your ([\d\w ,and]+?) houses? and sits in your (\d+)\w\w house/gm))) {
      const ruled = Array.from(m[2].matchAll(/(\d+)/g)).map((x) => Number(x[1]));
      expect(ruled.sort((a, b) => a - b)).toEqual(c.houses.filter((h) => h.lord === m[1]).map((h) => h.house));
      expect(c.planets.find((p) => p.name === m[1])!.house).toBe(Number(m[3]));
    }
    // Every date is a Vimshottari boundary.
    const boundaries = new Set(c.dashas.vimshottari.mahadashas.flatMap((m) => [m.start, m.end, ...m.antardashas.flatMap((a) => [a.start, a.end])]).map(dateOf));
    const dates = all.match(/\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/g)!;
    expect(dates.length).toBeGreaterThanOrEqual(4);
    for (const d of dates) expect(boundaries.has(d)).toBe(true);
  });

  it.each(NAMES)('no engine shorthand, yoga promise or degree in the evidence (%s)', (name) => {
    const all = facts(name).ledger.items.map((x) => x.text).join('\n');
    const yogas = facts(name).ledger.items.filter((x) => x.evidence?.source === 'Yoga').map((x) => x.text).join('\n');
    expect(yogas).not.toMatch(/ — |status and success|marked rise|sharp intellect/);
    expect(all).not.toMatch(/\d°|\bdegrees?\b/);
    expect(all).not.toMatch(/Neecha Bhanga Raja Yoga/);
  });
});

describe('the report agrees with the production engine', () => {
  it.each(NAMES)('the overall reading is the Kundli\'s Career verdict (%s)', (name) => {
    const e = facts(name);
    const career = buildInsights(e.chart, ASOF).domains.find((d) => d.domain === 'career')!;
    expect(e.ledger.career.verdict).toBe(career.verdict);
    expect(text(e, e.synthesis.theses.verdict)).toContain(`career reads as ${career.verdict === 'Insufficient evidence' ? 'too thinly evidenced to judge' : career.verdict.toLowerCase()}, with ${career.confidence.toLowerCase()} confidence`);
  });

  it.each(NAMES)('engine items keep their engine direction and strength; career rules carry a documented rule (%s)', (name) => {
    for (const x of facts(name).ledger.items) {
      if (x.evidence && x.ruleId === x.evidence.id) expect([x.direction, x.strength]).toEqual([x.evidence.direction, x.evidence.strength]);
      if (x.ruleId.startsWith('career.')) expect(x.rule.length).toBeGreaterThan(40);
    }
  });

  it.each(NAMES)('a period\'s tone is the engine\'s period-lord capacity, and its dates are the engine\'s (%s)', (name) => {
    const e = facts(name); const t = +ASOF;
    const md = e.chart.dashas.vimshottari.mahadashas.find((m) => Date.parse(m.start) <= t && t < Date.parse(m.end))!;
    const ad = md.antardashas.find((a) => Date.parse(a.start) <= t && t < Date.parse(a.end))!;
    const [pm, pa, pn] = e.synthesis.periods;
    expect([pm.lord, pm.start, pm.end]).toEqual([md.lord, md.start, md.end]);
    expect([pa.lord, pa.start, pa.end]).toEqual([ad.lord, ad.start, ad.end]);
    expect(Date.parse(pn.start)).toBe(Date.parse(ad.end));
    for (const p of e.synthesis.periods) expect(p.tone).toBe(planetCondition(e.ledger.ix, p.lord).direction);
  });
});

describe('fields: judged by the engine, compared by what separates them', () => {
  it.each(NAMES)('each field\'s verdict is resolveDomain over its own counted evidence, with no lordship counted (%s)', (name) => {
    const e = facts(name);
    for (const f of e.synthesis.fields) {
      expect(resolveDomain('career', engineItems(e.ledger, f.counted), { approximate: false }).verdict).toBe(f.verdict);
      for (const id of f.counted) expect(e.ledger.byId.get(id)!.role).not.toBe('context');
      // House-typed rules never decide a comparison between fields.
      for (const id of f.counted) expect(e.ledger.byId.get(id)!.engineRule ?? '').not.toMatch(/^house\.occupant\.malefic|^house\.aspect\.saturn-mars/);
    }
  });

  it.each(NAMES)('the order follows the verdicts and each comparison names only evidence one side lacks (%s)', (name) => {
    const s = facts(name).synthesis;
    const rank = (id: string) => ['Exceptional', 'Very Strong', 'Strong', 'Mixed', 'Challenging', 'Very Challenging', 'Insufficient evidence'].indexOf(s.fields.find((f) => f.id === id)!.verdict);
    for (let i = 1; i < s.order.length; i++) expect(rank(s.order[i])).toBeGreaterThanOrEqual(rank(s.order[i - 1]));
    for (const c of s.comparisons) {
      const a = s.fields.find((f) => f.id === c.higher)!, b = s.fields.find((f) => f.id === c.lower)!;
      for (const id of c.onlyHigher) expect(a.counted.includes(id) && !b.counted.includes(id)).toBe(true);
      for (const id of c.onlyLower) expect(b.counted.includes(id) && !a.counted.includes(id)).toBe(true);
      expect(c.relation === 'indistinguishable').toBe(!c.onlyHigher.length && !c.onlyLower.length);
      if (c.relation === 'ranks-above') expect(a.verdict).not.toBe(b.verdict);
    }
  });
});

describe('D1 and D10: the D10 may reinforce, qualify, contradict or leave a reading unresolved', () => {
  it('the relation rule', () => {
    expect(d10Relation('positive', [1], [])).toBe('reinforces');
    expect(d10Relation('negative', [], [1])).toBe('contradicts');
    expect(d10Relation('positive', [1], [1])).toBe('qualifies');
    expect(d10Relation('positive', [], [])).toBe('unresolved');
    expect(d10Relation('neutral', [1], [])).toBe('qualifies');
    expect(d10Relation('neutral', [1], [1])).toBe('unresolved');
    expect(d10Relation(null, [], [])).toBe('unresolved');
  });

  it('across the seven charts every kind of relation occurs, and every relation names its D1 and D10 evidence', () => {
    const seen = new Set(NAMES.flatMap((n) => facts(n).synthesis.relations.map((r) => r.relation)));
    expect(Array.from(seen).sort()).toEqual(['contradicts', 'qualifies', 'reinforces', 'unresolved']);
    for (const n of NAMES) for (const r of facts(n).synthesis.relations) {
      const from = facts(n).ledger.byId.get(r.itemId)!.derivedFrom!.map((id) => facts(n).ledger.byId.get(id)!.chart);
      expect(from).toContain('D1'); expect(from).toContain('D10');
    }
  });
});

describe('different charts, different reports', () => {
  it('the seven charts reach different conclusions', () => {
    const plans = NAMES.map((n) => { const e = facts(n); return Object.values(e.synthesis.theses).map((id) => text(e, id)).join('\n'); });
    expect(new Set(plans).size).toBe(NAMES.length);
    const leaders = new Set(NAMES.map((n) => facts(n).synthesis.order[0]));
    expect(leaders.size).toBeGreaterThanOrEqual(4);
    expect(new Set(NAMES.map((n) => facts(n).workStyle)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(NAMES.map((n) => facts(n).synthesis.d10.relation)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(NAMES.map((n) => facts(n).synthesis.periods[1].lord)).size).toBeGreaterThanOrEqual(4);
  });

  it('no field leads by construction: a seeded sweep of 80 random charts', () => {
    let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const first: Record<string, number> = {}, styles: Record<string, number> = {};
    for (let i = 0; i < 80; i++) {
      const pad = (n: number) => String(n).padStart(2, '0');
      const k = fixtureChart(`${1950 + Math.floor(rnd() * 55)}-${pad(1 + Math.floor(rnd() * 12))}-${pad(1 + Math.floor(rnd() * 28))}`, `${pad(Math.floor(rnd() * 24))}:${pad(Math.floor(rnd() * 60))}`, 8 + rnd() * 24, 70 + rnd() * 18);
      const e = buildCareerReportFacts(k, ASOF);
      first[e.synthesis.order[0]] = (first[e.synthesis.order[0]] ?? 0) + 1; styles[e.workStyle] = (styles[e.workStyle] ?? 0) + 1;
    }
    // Before the house-neutral comparison one field led half the charts and independent work was almost never favoured.
    expect(Math.max(...Object.values(first))).toBeLessThanOrEqual(36);
    expect(Object.keys(first).length).toBe(6);
    expect(styles.independent ?? 0).toBeGreaterThanOrEqual(6);
  }, 60_000);
});

describe('the plan', () => {
  it.each(NAMES)('seven reader sections in five parts; every slot cites only real ledger ids (%s)', (name) => {
    const e = facts(name);
    expect(e.sections.map((s) => s.key)).toEqual(['overview', 'chart', 'fields', 'timing', 'strategy']);
    expect(Array.from(new Set(e.sections.flatMap((s) => s.headings)))).toEqual([...CAREER_HEADINGS]);
    for (const s of e.sections) for (const slot of s.slots) {
      for (const id of [...slot.scope, ...slot.mustCite]) expect(e.ledger.byId.has(id)).toBe(true);
      for (const id of slot.mustCite) expect(slot.scope).toContain(id);
      expect(slot.id).not.toMatch(new RegExp(`\\b(${[...GRAHAS, ...SIGN_NAMES].join('|')})\\b`));
    }
    expect(e.sections.find((s) => s.key === 'fields')!.slots.filter((x) => x.id.startsWith('field.')).map((x) => x.id.slice(6))).toEqual(e.synthesis.order);
  });

  it.each(NAMES)('spending: the worst first pass plus two whole-part retries fit the unchanged ceiling even with no usage reported (%s)', (name) => {
    const e = facts(name);
    const reserve = (p: string) => Math.ceil((Buffer.byteLength(p, 'utf8') + 128) * 2.5 + CAREER_OUTPUT_TOKENS * 10);
    const costs = e.sections.map((s) => reserve(careerSectionPrompt(e, s)));
    const firstPass = costs.reduce((a, b) => a + b, 0);
    const twoRetries = costs.sort((a, b) => b - a).slice(0, 2).reduce((a, b) => a + b, 0);
    expect(firstPass + twoRetries).toBeLessThanOrEqual(CAREER_BUDGET_MICRO_USD);
  });
});

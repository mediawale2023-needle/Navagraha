// USER_FACING_REASONING_V1 (PR #105): one canonical interpretation context and one explanation layer
// for Kundli, Insights, Ask and paid reports. Off: nothing changes. On: verdicts, evidence and guards
// are unchanged; only explanations and grounding text are added.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanonicalChart } from '../../shared/v3/canonical';
import { LIFE_DOMAINS } from '../../shared/v3/evidence';
import { getKundli } from '../../server/astroEngine/index';
import { buildInsights } from '../../server/astroEngine/evidence/insights';
import { resolveBirthWithCoordinates } from '../../server/astroEngine/birthResolver';
import { computeCanonicalChart } from '../../server/astroEngine/canonical/compute';
import { buildInterpretationContext } from '../../server/astroEngine/reasoning/interpretationContext';
import { buildExplanations, groundingBlock } from '../../server/astroEngine/reasoning/explanations';
import { reasoningInput } from '../../server/astroEngine/reasoning/index';
import { planetaryReasoningFrom } from '../../server/astroEngine/reasoning/planetary';
import { reconcileFrom } from '../../server/astroEngine/reasoning/reconciliation';
import { explanationsFor, groundingFor, reportGroundingFor } from '../../server/userFacingReasoning';
import { buildEvidencePacket, routeQuestion } from '../../server/agents/askKundli';
import { validateAnswer } from '../../server/agents/answerGuard';

const asOf = new Date('2026-10-13T06:00:00Z');
const PLACES: Array<[number, number]> = [[28.6139, 77.209], [19.076, 72.8777], [13.0827, 80.2707], [51.5074, -0.1278], [40.7128, -74.006]];
async function charts(n: number, timeAccuracy: 'exact' | 'approximate' = 'exact', offset = 0): Promise<CanonicalChart[]> {
  const out: CanonicalChart[] = [];
  for (let k = 0; k < n; k++) {
    const i = k + offset;
    const [lat, lng] = PLACES[i % PLACES.length];
    const date = `${1945 + ((i * 7) % 70)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + ((i * 5) % 28)).padStart(2, '0')}`;
    out.push(((await getKundli(date, `${String((i * 2) % 24).padStart(2, '0')}:${String((i * 13) % 60).padStart(2, '0')}`, lat, lng, { timeAccuracy })) as any).chartData.canonical);
  }
  return out;
}
const explain = (c: CanonicalChart) => buildExplanations(buildInterpretationContext(c, asOf));
const prose = (x: unknown) => JSON.stringify(x, (k, v) => (k === 'id' || k === 'evidenceId' || k === 'periodId' || k === 'yogaId' ? undefined : v));
const withFlag = (on: boolean) => { if (on) vi.stubEnv('USER_FACING_REASONING_V1', 'true'); else vi.stubEnv('USER_FACING_REASONING_V1', ''); };
afterEach(() => vi.unstubAllEnvs());

describe('feature flag', () => {
  it('off (default): no explanations, no grounding, Ask packet and report prompt text unchanged', async () => {
    withFlag(false);
    const [c] = await charts(1);
    expect(explanationsFor(c, asOf)).toBeNull();
    expect(groundingFor(c, asOf)).toBe('');
    expect(reportGroundingFor({ chartData: { canonical: c } })).toBe('');
    const route = routeQuestion('How is my career?');
    const off = buildEvidencePacket(c, route, asOf).text;
    withFlag(true);
    const on = buildEvidencePacket(c, route, asOf).text;
    expect(on.startsWith(off)).toBe(true);
    expect(on.length).toBeGreaterThan(off.length);
  });

  it('on: verdicts, confidence and evidence are the production ones; a failure falls back to nothing', async () => {
    withFlag(true);
    for (const c of await charts(10)) {
      const ins = buildInsights(c, asOf);
      const before = JSON.stringify(ins);
      const ex = explanationsFor(c, asOf, ins)!;
      expect(JSON.stringify(ins)).toBe(before);
      for (const a of ex.areas) {
        const d = ins.domains.find((x) => x.domain === a.domain)!;
        expect([a.verdict, a.confidence]).toEqual([d.verdict, d.confidence]);
        for (const s of a.supports) expect(d.supporting.map((e) => e.id)).toContain(s.evidenceId);
        for (const s of a.challenges) expect(d.conflicting.map((e) => e.id)).toContain(s.evidenceId);
      }
    }
    // A chart the context cannot read: no explanation, no throw.
    expect(explanationsFor({ broken: true } as unknown as CanonicalChart, asOf)).toBeNull();
  });
});

describe('consistency across Kundli, Insights, Ask and reports', () => {
  it('every surface shows the same explanation of the same evidence', async () => {
    withFlag(true);
    for (const c of await charts(12)) {
      const ex = explanationsFor(c, asOf)!;
      const askBlock = buildEvidencePacket(c, routeQuestion('Tell me about my career and marriage'), asOf).text;
      const reportBlock = reportGroundingFor({ chartData: { canonical: c } }, asOf);
      for (const domain of ['career', 'relationships'] as const) {
        const a = ex.areas.find((x) => x.domain === domain)!;
        for (const text of [a.summary, ...a.supports.map((s) => s.text), ...a.challenges.map((s) => s.text)]) {
          expect(askBlock).toContain(text);
          expect(reportBlock).toContain(text);
        }
      }
      for (const p of ex.periods) { expect(askBlock).toContain(p.text); expect(reportBlock).toContain(p.text); }
      // The Kundli planet sheet and the report describe a planet in the same words.
      for (const p of ex.planets) if (p.points.some((x) => x.includes('is a real strength, yet'))) expect(reportBlock).toContain(p.summary);
    }
  });

  it('A–E: strong-but-challenged planets, formed yogas, natal vs period, mixed influences', async () => {
    withFlag(true);
    const seen = new Set<string>();
    for (const c of await charts(60)) {
      const ctx = buildInterpretationContext(c, asOf);
      const ex = buildExplanations(ctx);
      // A. A strong planet can still challenge: said, and the challenge is real evidence about it.
      for (const p of ctx.planets.filter((x) => x.strongButChallenged)) {
        seen.add('A');
        expect(ex.planets.find((x) => x.planet === p.planet)!.points.some((x) => x.includes('is a real strength, yet it can still create challenges'))).toBe(true);
        expect(p.areas.some((a) => a.challenging.length > 0)).toBe(true);
      }
      // B. Formation is never a guaranteed result.
      for (const y of ex.yogas) {
        seen.add('B');
        expect(y.effectiveness).toMatch(/is not assessed: a formed yoga describes a potential, not a guarantee/);
        if (y.period) expect(y.period).toMatch(/does not show that the yoga will deliver/);
      }
      // No sentence promises an outcome: every "will"/"guarantee" is negated in its own sentence.
      for (const sentence of prose(ex).split(/(?<=[.:])\s+/)) {
        if (/\b(will|guarantee[sd]?|ensures?|certainly)\b/i.test(sentence)) expect(sentence, sentence).toMatch(/\b(not|never|no)\b/i);
      }
      // C/D. Natal promise vs period activation stay distinct.
      for (const a of ctx.areas) for (const p of a.periods) {
        const text = ex.areas.find((x) => x.domain === a.domain)!.period!;
        expect(text).toMatch(/not a separate forecast/);
        if (p.natal === 'mixed') {
          seen.add(p.direction === 'negative' ? 'C' : 'D');
          expect(text).toMatch(/natal promise and the current period are different questions/);
        }
      }
      // E. Supporting and challenging evidence stay separate and both are named.
      for (const a of ex.areas) if (a.supports.length && a.challenges.length) {
        seen.add('E');
        expect(a.uncertainty.some((u) => u.includes('describe different influences rather than cancelling'))).toBe(true);
      }
    }
    for (const k of ['A', 'B', 'C', 'D', 'E']) expect(seen, k).toContain(k);
  });

  it('G and H: no dates, no internal terms, no reconciliation proposal ever reaches a user', async () => {
    withFlag(true);
    for (const c of [...await charts(30), ...await charts(8, 'approximate')]) {
      const ex = explain(c);
      const block = groundingBlock(ex);
      for (const t of [prose(ex), block]) {
        expect(t).not.toMatch(/\b(1[89]|20)\d\d\b/);
        expect(t).not.toMatch(/FactIndex|dependency|resolver|reconcil|rule registry|shadow|provisional|policy/i);
      }
      // The verdict shown is the production verdict even where a shadow policy would propose another.
      const r = reasoningInput(c, asOf);
      const rec = reconcileFrom(r, planetaryReasoningFrom(r, c));
      for (const d of rec.domains) {
        const a = ex.areas.find((x) => x.domain === d.domain)!;
        expect([a.verdict, a.confidence]).toEqual([d.original.verdict, d.original.confidence]);
      }
    }
  });

  it('the Ask guard is unchanged: the grounding block supplies no year and does not loosen a check', async () => {
    const [c] = await charts(1, 'exact', 5);
    const route = routeQuestion('How is my career and when will it improve?');
    withFlag(false);
    const off = buildEvidencePacket(c, route, asOf);
    withFlag(true);
    const on = buildEvidencePacket(c, route, asOf);
    for (const claim of ['Your career will peak in 2199.', `Jupiter is in ${c.planets.find((p) => p.name === 'Jupiter')!.sign === 'Aries' ? 'Taurus' : 'Aries'}.`]) {
      expect(validateAnswer(claim, on.guard)).toEqual(validateAnswer(claim, off.guard));
      expect(validateAnswer(claim, on.guard).length).toBeGreaterThan(0);
    }
  });
});

describe('F. approximate birth time', () => {
  it('no house, Lagna, dasha date or unstable fact appears; the period is withheld when it could change', async () => {
    withFlag(true);
    for (const c of await charts(16, 'approximate')) {
      const ex = explain(c);
      const block = groundingBlock(ex);
      const body = prose({ ...ex, disclosures: [] });
      for (const t of [body, block]) {
        expect(t).not.toMatch(/\b\d{1,2}(st|nd|rd|th) house/);
        expect(t).not.toMatch(/Lagna|Ascendant/);
      }
      for (const p of ex.planets) expect(p.uncertainty).toContain('Its house and the houses it rules are not shown because the birth time is approximate.');
    }
  });

  it('72 charts × 9 times: the context, the explanations and the AI grounding are identical', () => {
    withFlag(true);
    const places: Array<[number, number]> = [[28.6139, 77.209], [19.076, 72.8777], [13.0827, 80.2707], [22.5726, 88.3639], [26.9124, 75.7873], [51.5074, -0.1278], [40.7128, -74.006], [-33.8688, 151.2093], [1.3521, 103.8198]];
    const pad = (n: number) => String(n).padStart(2, '0');
    let seed = 99; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const perAsc = new Array(12).fill(0); const sample: Array<{ date: string; latitude: number; longitude: number }> = [];
    let i = 0, kept = 0;
    while (perAsc.some((n) => n < 28)) {
      const y = 1940 + Math.floor(rnd() * 70), m = 1 + Math.floor(rnd() * 12), d = 1 + Math.floor(rnd() * 28);
      const hh = Math.floor(rnd() * 24), mm = Math.floor(rnd() * 60);
      const [latitude, longitude] = places[i++ % places.length];
      const date = `${y}-${pad(m)}-${pad(d)}`;
      const c = computeCanonicalChart(resolveBirthWithCoordinates({ date, time: `${pad(hh)}:${pad(mm)}`, latitude, longitude, timeAccuracy: 'exact' }), { calculatedAt: asOf });
      if (perAsc[c.ascendant.signIndex] >= 28) continue;
      perAsc[c.ascendant.signIndex]++; kept++;
      if (sample.length < 72 && kept % 4 === 0) sample.push({ date, latitude, longitude });
    }
    expect(sample.length).toBe(72);
    const route = routeQuestion('How are my career, money and relationships?');
    for (const input of sample) {
      const views = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '23:59'].map((time) => {
        const c = computeCanonicalChart(resolveBirthWithCoordinates({ ...input, time, timeAccuracy: 'approximate' }), { calculatedAt: asOf });
        const ctx = buildInterpretationContext(c, asOf);
        const ex = buildExplanations(ctx);
        // groundingFor builds exactly this block from the same context (checked in the consistency tests).
        return JSON.stringify({ ctx, ex, ask: groundingBlock(ex, { domains: route.domains, planets: route.planets, evidenceLines: false }) });
      });
      for (const v of views) expect(v, input.date).toBe(views[0]);
    }
  }, 240_000);
});

describe('context', () => {
  it('is frozen, holds only production verdicts and reliable facts, and keeps formation apart from effectiveness', async () => {
    for (const c of await charts(6)) {
      const ctx = buildInterpretationContext(c, asOf);
      expect(Object.isFrozen(ctx) && Object.isFrozen(ctx.areas[0]) && Object.isFrozen(ctx.planets[0])).toBe(true);
      expect(ctx.areas.map((a) => a.domain)).toEqual([...LIFE_DOMAINS]);
      for (const y of ctx.yogas) expect(y.effectivenessAssessed).toBe(false);
      const r = reasoningInput(c, asOf);
      for (const p of ctx.planets) for (const id of p.factIds) expect(r.facts.get(id)?.reliable).toBe(true);
      expect(JSON.stringify(ctx)).not.toMatch(/functional-(benefic|malefic)|yogakaraka|proposed|shadow/);
    }
  });
});

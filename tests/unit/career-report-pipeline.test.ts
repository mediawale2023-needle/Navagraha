import { afterEach, describe, expect, it, vi } from 'vitest';
import { CareerSpending, CAREER_BUDGET_MICRO_USD, CAREER_DEADLINE_MS, CAREER_OUTPUT_TOKENS, careerRequester, generateDeterministicCareer, type CareerCompletion } from '../../server/careerReportGeneration';
import { buildFiveCareerEvidence, FIVE_CAREER_HEADINGS, type CareerPacket } from '../../server/careerReportEvidence';
import { validateFiveCareerDraft, renderCareerSection, fiveCareerPrompt, careerDraftSchema, houseClaimProblems } from '../../server/careerReportRendering';
import { ASOF, fixtureChart } from '../fixtures/career-chart';
import { CAREER_PROSE } from '../fixtures/career-prose';
import { FIELDS } from '../../server/careerReport';
import { LIVE_PERIODS_FIRST, LIVE_PERIODS_CORRECTION, LIVE_OVERVIEW, LIVE_CURRENT, LIVE_GUIDANCE, LIVE_BIRTH_CHART } from '../fixtures/career-live-d5705f6';
import { computeCanonicalChart } from '../../server/astroEngine/canonical/compute';
import { resolveBirthWithCoordinates } from '../../server/astroEngine/birthResolver';

const delivery = vi.hoisted(() => ({ setReportOrderContent: vi.fn(), failAndRefundReportOrder: vi.fn(), createNotification: vi.fn() }));
vi.mock('../../server/storage', () => ({ storage: delivery }));
vi.mock('../../server/pushService', () => ({ sendPushToUser: vi.fn() }));
import { fulfilReportOrder } from '../../server/reportOrders';

function draft(p: CareerPacket) {
  const [a, b] = [[0, 7], [8, 4], [1, 3], [2, 9], [6, 5]][p.id];
  const blocks = ['supporting', 'limiting', 'conclusion'].map((_, i) => ({ factIds: p.facts.map((f) => f.id), contexts: Array.from(new Set(p.facts.flatMap((f) => f.contexts))), text: `${CAREER_PROSE[a][i]} ${CAREER_PROSE[b][i].split(/(?<=[.!?])\s+/)[0]}` }));
  // Current Career Situation must name its running periods.
  if (p.heading === 'Current Career Situation') blocks[0].text += ' ' + p.facts.filter((f) => f.contexts.includes('Vimshottari')).map((f) => `The running ${(f.value as any).lord} ${f.id.split('.')[1]} sets part of this timing context.`).join(' ');
  return { supporting: blocks[0], limiting: blocks[1], conclusion: blocks[2] };
}
const plan = (prompt: string): CareerPacket[] => JSON.parse(prompt.split('\nSECTIONS\n')[1].split('\nCORRECTION\n')[0]);
// One section per call; usage is a realistic single-section figure ($0.012 a call).
function responder(e = buildFiveCareerEvidence(fixtureChart(), ASOF)) {
  return vi.fn(async (prompt: string): Promise<CareerCompletion> => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ workStyle: 'mixed', sections: plan(prompt).map((p) => ({ id: p.id, draft: draft(e.packets[p.id]) })) }) } }], usage: { prompt_tokens: 2000, completion_tokens: 700 } }));
}
const CHARTS = [['1991-11-13', '12:30', 15.8497, 74.4977], ['1985-03-22', '06:15', 28.6139, 77.209], ['2000-07-04', '18:45', 19.076, 72.8777]] as const;
/** Changes the reply for one section; `attempt` counts that section's calls (1 = first pass). */
const perSection = (base: ReturnType<typeof responder>, change: (section: any, attempt: number, reply: any) => void) => {
  const attempts = new Map<number, number>();
  return vi.fn(async (prompt: string, o?: any) => {
    const r = await base(prompt, o); const v = JSON.parse(r.choices[0].message.content!);
    for (const s of v.sections) { const n = (attempts.get(s.id) ?? 0) + 1; attempts.set(s.id, n); change(s, n, v); }
    r.choices[0].message.content = JSON.stringify(v); return r;
  });
};
const idsOf = (request: { mock: { calls: any[][] } }) => request.mock.calls.map((c) => plan(c[0]).map((p) => p.id));
const words = (n: number) => Array.from({ length: n }, (_, i) => `interpretation${i}`).join(' ') + '.';
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('five-section Career pipeline: one request per section', () => {
  it.each(CHARTS)('delivers all five sections, Career Overview first, for %s', async (date, time, lat, lon) => {
    const k = fixtureChart(date, time, lat, lon); const request = responder(buildFiveCareerEvidence(k, ASOF)); const metrics = vi.fn();
    const report = await generateDeterministicCareer(k, ASOF, request, { onMetrics: metrics });
    expect(report.sections.map((s) => s.heading)).toEqual(FIVE_CAREER_HEADINGS);
    expect(idsOf(request)).toEqual([[0], [1], [2], [3], [4]]);
    expect(metrics).toHaveBeenCalledWith({ calls: 5, corrections: 0, costMicroUsd: 60_000, firstPassAccepted: 5 });
    expect(report.sections[2].body).toContain('Lagna: the rising sign');
    expect(report.sections[2].body).toContain('accurate birth time');
    expect(report.dashaTimeline.length).toBeGreaterThan(0);
  });
  it('sends each section only its own facts and gives the later sections the established work style', () => {
    const e = buildFiveCareerEvidence(fixtureChart(), ASOF);
    for (const p of e.packets) {
      const prompt = fiveCareerPrompt(e, [p], { workStyle: p.id ? 'mixed' : undefined });
      const facts = JSON.parse(prompt.split('\nFACTS\n')[1].split('\nSECTIONS\n')[0]) as Array<{ id: string }>;
      expect(facts.map((f) => f.id).sort()).toEqual(p.facts.map((f) => f.id).sort());
      expect(prompt.includes('established in Career Overview, is "mixed"')).toBe(p.id !== 0);
    }
  });
  it('covers the next four years across a Mahadasha boundary using exact engine dates', () => {
    const k = fixtureChart(); const e = buildFiveCareerEvidence(k, new Date('2039-01-01T00:00:00Z'));
    const periods = e.packets[1].facts.filter((f) => f.contexts.includes('Vimshottari'));
    expect(periods.some((p) => p.id.startsWith('Vimshottari.Mahadasha.Saturn'))).toBe(true);
    const valid = new Set(k.chartData.canonical.dashas.vimshottari.mahadashas.flatMap((m) => [m.start, m.end, ...m.antardashas.flatMap((a) => [a.start, a.end])]));
    for (const p of periods) { expect(valid.has((p.value as any).start)).toBe(true); expect(valid.has((p.value as any).end)).toBe(true); }
  });
  it('accepts a naturally worded correct placement and adds the chart scope', () => {
    const e = buildFiveCareerEvidence(fixtureChart(), ASOF); const p = e.packets[2]; const d = draft(p);
    d.supporting.text += ' Jupiter occupies Capricorn.';
    const checked = validateFiveCareerDraft(p, d, e);
    expect(checked.problems).toEqual([]); expect(checked.draft!.supporting.text).toContain('Jupiter occupies Capricorn in D10');
  });
  it.each(['In D10 Jupiter is in Leo.', 'In D1 Venus is in Leo.', 'Lakshmi Yoga brings wealth.', 'Saturn Antardasha begins in 2029.', 'Saturn Antardasha begins on 2027-01-22.'])('rejects inaccurate assertion: %s', (claim) => {
    const e = buildFiveCareerEvidence(fixtureChart(), ASOF); const p = e.packets[claim.includes('Antardasha') ? 1 : 2]; const d = draft(p); d.supporting.text += ` ${claim}`;
    expect(validateFiveCareerDraft(p, d, e).problems.length).toBeGreaterThan(0);
  });
  it('allows technical terms and overlapping indicators; the application supplies definitions', () => {
    const e = buildFiveCareerEvidence(fixtureChart(), ASOF); const p = e.packets[2]; const d = draft(p);
    d.supporting.text += ' The Lagna and trikona terminology describes the verified configuration.';
    const c = validateFiveCareerDraft(p, d, e); expect(c.problems).toEqual([]);
    expect(renderCareerSection(p, c.draft!)).toContain('trikona: a trinal house');
  });
  it('rejects career recommendations in a section without field assessments', () => {
    const e = buildFiveCareerEvidence(fixtureChart(), ASOF); const p = e.packets[2]; const d = draft(p);
    d.conclusion.text += ' Finance roles are ideal for your career.';
    expect(validateFiveCareerDraft(p, d, e).problems.join(' ')).toContain('verified field assessment');
  });
  it('corrects only a missing section and preserves all passing content', async () => {
    const e = buildFiveCareerEvidence(fixtureChart(), ASOF);
    const request = perSection(responder(e), (s, attempt, v) => { if (s.id === 4 && attempt === 1) v.sections = []; });
    const report = await generateDeterministicCareer(fixtureChart(), ASOF, request);
    expect(idsOf(request)).toEqual([[0], [1], [2], [3], [4], [4]]);
    for (const p of e.packets) expect(report.sections[p.id].body).toBe(renderCareerSection(p, draft(p)));
  });
  it.each(['length', 'content_filter'])('fails closed when Career Overview ends with %s, before any other call', async (reason) => {
    const base = responder(); const request = vi.fn(async (p: string) => { const r = await base(p); r.choices[0].finish_reason = reason; return r; });
    await expect(generateDeterministicCareer(fixtureChart(), ASOF, request)).rejects.toThrow(/Career Overview.*incomplete-response/); expect(request).toHaveBeenCalledTimes(1);
  });
  it('corrects a later section that ended with length, alone', async () => {
    const base = responder(); let truncated = false;
    const request = vi.fn(async (p: string) => { const r = await base(p); if (plan(p)[0].id === 3 && !truncated) { truncated = true; r.choices[0].finish_reason = 'length'; } return r; });
    const report = await generateDeterministicCareer(fixtureChart(), ASOF, request);
    expect(report.sections).toHaveLength(5); expect(idsOf(request).at(-1)).toEqual([3]); expect(request.mock.calls.at(-1)![0]).toContain('incomplete-response');
  });
  it.each(['{', '{}'])('fails closed when Career Overview returns %s', async (content) => {
    const request = vi.fn(async () => ({ choices: [{ finish_reason: 'stop', message: { content } }] }));
    await expect(generateDeterministicCareer(fixtureChart(), ASOF, request)).rejects.toThrow(/quality check/); expect(request).toHaveBeenCalledTimes(1);
  });
  it('does not retry systematic failure', async () => {
    const request = vi.fn(async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ workStyle: 'mixed', sections: [] }) } }] }));
    await expect(generateDeterministicCareer(fixtureChart(), ASOF, request)).rejects.toThrow(/systematic/); expect(request).toHaveBeenCalledTimes(5);
  });
  it('enforces at most two correction calls', async () => {
    const request = perSection(responder(), (s) => { if ([0, 4].includes(s.id)) s.draft = {}; });
    await expect(generateDeterministicCareer(fixtureChart(), ASOF, request)).rejects.toThrow(/bounded correction/); expect(request).toHaveBeenCalledTimes(7);
  });
  it('rejects a section contradicting the work style, then accepts its correction', async () => {
    const request = perSection(responder(), (s, attempt) => { if (s.id === 0 && attempt === 1) s.draft.conclusion.text += ' This recommends employment.'; });
    const report = await generateDeterministicCareer(fixtureChart(), ASOF, request);
    expect(report.sections).toHaveLength(5); expect(request.mock.calls.at(-1)![0]).toContain('contradicts the common employment-versus-business conclusion');
  });
  it('rejects a section that changes the established work style and fails if the correction changes it again', async () => {
    const request = perSection(responder(), (s, _attempt, v) => { if (s.id === 2) v.workStyle = 'employment'; });
    await expect(generateDeterministicCareer(fixtureChart(), ASOF, request)).rejects.toThrow(/Your Birth Chart: changed the established work-style conclusion \(mixed\)/);
    expect(idsOf(request)).toEqual([[0], [1], [2], [3], [4], [2]]);
  });
  it('preserves delivery compatibility and refunds only through the existing path', async () => {
    delivery.setReportOrderContent.mockResolvedValue({ id: 'test-only' });
    await fulfilReportOrder({ id: 'test-only', userId: 'test-user' } as any, 'Career', () => generateDeterministicCareer(fixtureChart(), ASOF, responder()));
    expect(delivery.setReportOrderContent.mock.calls[0][1].sections).toHaveLength(5); expect(delivery.failAndRefundReportOrder).not.toHaveBeenCalled();
  });
  it('aborts at six minutes even if transport never settles', async () => {
    vi.useFakeTimers(); let signal: AbortSignal | undefined;
    const request = vi.fn((_p, o) => { signal = o.signal; return new Promise<CareerCompletion>(() => {}); });
    const result = generateDeterministicCareer(fixtureChart(), ASOF, request); const assertion = expect(result).rejects.toThrow(/deadline/);
    await vi.advanceTimersByTimeAsync(CAREER_DEADLINE_MS); await assertion; expect(signal?.aborted).toBe(true); expect(request).toHaveBeenCalledTimes(1);
  });
  it('aborts the parallel sections at six minutes', async () => {
    vi.useFakeTimers(); const base = responder(); const signals: AbortSignal[] = [];
    const request = vi.fn((p: string, o: any) => { signals.push(o.signal); return plan(p)[0].id === 0 ? base(p) : new Promise<CareerCompletion>(() => {}); });
    const result = generateDeterministicCareer(fixtureChart(), ASOF, request); const assertion = expect(result).rejects.toThrow(/deadline/);
    await vi.advanceTimersByTimeAsync(CAREER_DEADLINE_MS); await assertion;
    expect(request).toHaveBeenCalledTimes(5); expect(signals.every((s) => s.aborted)).toBe(true);
  });
  it('reserves before dispatch, retains missing usage and refuses overspending', async () => {
    const l = new CareerSpending(); const id = l.reserve('prompt', CAREER_OUTPUT_TOKENS); const reserved = l.reserved; l.settle(id); l.settle(id);
    expect(l.spent).toBe(reserved); const request = vi.fn();
    await expect(generateDeterministicCareer(fixtureChart(), ASOF, request, { ledger: new CareerSpending(1) })).rejects.toThrow(/ceiling/); expect(request).not.toHaveBeenCalled();
    expect(() => new CareerSpending(250001)).toThrow(); expect(() => l.reserve('prompt', CAREER_OUTPUT_TOKENS + 1)).toThrow(/allowance/);
  });
  it('does not oversubscribe concurrent reservations', async () => {
    const l = new CareerSpending(30_000); let sent = 0;
    const results = await Promise.allSettled(Array.from({ length: 3 }, async () => { const id = l.reserve('prompt', CAREER_OUTPUT_TOKENS); sent++; await Promise.resolve(); l.settle(id, { prompt_tokens: 1, completion_tokens: 1 }); }));
    expect(sent).toBe(2); expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
  it('uses explicit output limits and disables hidden SDK retries', async () => {
    const create = vi.fn(async () => ({})); await careerRequester({ chat: { completions: { create } } } as any)('prompt', { signal: new AbortController().signal, maxTokens: CAREER_OUTPUT_TOKENS });
    expect(create.mock.calls[0][0].max_tokens).toBe(CAREER_OUTPUT_TOKENS); expect(create.mock.calls[0][1]).toMatchObject({ maxRetries: 0, timeout: 120000 });
  });
});

describe('five-section Career: evaluation hook', () => {
  it('reports every section attempt with its text and problems; the order path never passes the hook', async () => {
    const attempts: any[] = [];
    const request = perSection(responder(), (s, attempt) => { if (s.id === 3 && attempt === 1) s.draft = {}; });
    await generateDeterministicCareer(fixtureChart(), ASOF, request, { onSection: (a) => attempts.push(a) });
    expect(attempts).toHaveLength(6);
    const rejected = attempts.find((a) => !a.accepted)!;
    expect(rejected).toMatchObject({ heading: 'Current Career Situation', correcting: false }); expect(rejected.problems[0]).toMatch(/^schema/); expect(rejected.content).toContain('"id":3');
    expect(attempts.at(-1)).toMatchObject({ heading: 'Current Career Situation', correcting: true, accepted: true });
    const { readFileSync } = await import('node:fs');
    expect(readFileSync(new URL('../../server/aiAstrologerService.ts', import.meta.url), 'utf8')).not.toMatch(/onSection/);
  });
});

describe('five-section Career: accuracy, recovery and limits', () => {
  it.each(CHARTS)('renders only canonical D1/D10 placements and dasha boundaries for %s', async (date, time, lat, lon) => {
    const k = fixtureChart(date, time, lat, lon); const c = k.chartData.canonical;
    const report = await generateDeterministicCareer(k, ASOF, responder(buildFiveCareerEvidence(k, ASOF)));
    const boundaries = new Set(c.dashas.vimshottari.mahadashas.flatMap((m) => [m.start, m.end, ...m.antardashas.flatMap((a) => [a.start, a.end])]).map((d) => d.slice(0, 10)));
    let d1 = 0, d10 = 0;
    for (const s of report.sections) {
      expect(s.body).toMatch(/Supporting indicators[\s\S]*Opposing or limiting indicators[\s\S]*Practical conclusion/);
      for (const m of Array.from(s.body.matchAll(/\bD1: (\w+) is in (\w+), house (\d+)/g))) { d1++; expect(c.planets.find((p) => p.name === m[1])).toMatchObject({ sign: m[2], house: +m[3] }); }
      for (const m of Array.from(s.body.matchAll(/\bD10: (\w+) is in (\w+), house (\d+)/g))) { d10++; expect(c.vargas.D10.placements.find((p) => p.planet === m[1])).toMatchObject({ sign: m[2], house: +m[3] }); }
      for (const d of s.body.match(/\d{4}-\d{2}-\d{2}/g) ?? []) expect(boundaries.has(d)).toBe(true);
    }
    expect(d1).toBeGreaterThan(0); expect(d10).toBeGreaterThan(0);
    const birthChart = report.sections[2].body;
    expect(birthChart).toContain(`D1 Lagna (the rising sign) is ${c.ascendant.sign}`);
    expect(birthChart).toContain(`D1 house 10: ${c.houses[9].sign}`);
  });
  it('refuses an approximate birth time before any request', async () => {
    const canonical = computeCanonicalChart(resolveBirthWithCoordinates({ date: '1991-11-13', time: '12:30', latitude: 15.8497, longitude: 74.4977, timeAccuracy: 'approximate' }));
    const request = vi.fn();
    await expect(generateDeterministicCareer({ chartData: { canonical } }, ASOF, request)).rejects.toThrow(/exact birth time/);
    expect(request).not.toHaveBeenCalled();
  });
  it('corrects only a section rejected for an invented placement, sends its reasons, and keeps accepted sections byte-identical', async () => {
    const e = buildFiveCareerEvidence(fixtureChart(), ASOF); const metrics = vi.fn();
    const request = perSection(responder(e), (s, attempt) => { if (s.id === 2 && attempt === 1) s.draft.supporting.text += ' In D10 Jupiter is in Leo.'; });
    const report = await generateDeterministicCareer(fixtureChart(), ASOF, request, { onMetrics: metrics });
    expect(idsOf(request)).toEqual([[0], [1], [2], [3], [4], [2]]);
    const correction = request.mock.calls[5][0];
    expect(correction).toContain('Jupiter is in Capricorn in the D10, not Leo'); expect(correction).toContain('established in Career Overview, is "mixed"');
    for (const p of e.packets) expect(report.sections[p.id].body).toBe(renderCareerSection(p, validateFiveCareerDraft(p, draft(p), e).draft!));
    expect(report.sections[2].body).not.toContain('In D10 Jupiter is in Leo');
    expect(metrics).toHaveBeenCalledWith(expect.objectContaining({ calls: 6, corrections: 1, firstPassAccepted: 4 }));
  });
  it('tolerates echoed keys in the envelope', async () => {
    const request = perSection(responder(), (s, _a, v) => { v.title = 'Career'; s.heading = FIVE_CAREER_HEADINGS[s.id]; });
    const report = await generateDeterministicCareer(fixtureChart(), ASOF, request);
    expect(report.sections).toHaveLength(5); expect(request).toHaveBeenCalledTimes(5);
  });
  it('fails closed on a transport error and refunds through the existing delivery path', async () => {
    const request = vi.fn(async () => { throw new Error('test connection failure'); });
    delivery.failAndRefundReportOrder.mockResolvedValue({ refunded: 299 }); delivery.createNotification.mockResolvedValue({});
    await fulfilReportOrder({ id: 'test-only', userId: 'test-user' } as any, 'Career', () => generateDeterministicCareer(fixtureChart(), ASOF, request));
    expect(request).toHaveBeenCalledTimes(1);
    expect(delivery.setReportOrderContent).not.toHaveBeenCalled(); expect(delivery.failAndRefundReportOrder).toHaveBeenCalledTimes(1);
  });
  it('does not persist a report whose sections remain invalid', async () => {
    const request = perSection(responder(), (s) => { if (s.id === 1) s.draft = {}; });
    delivery.failAndRefundReportOrder.mockResolvedValue({ refunded: 299 }); delivery.createNotification.mockResolvedValue({});
    await fulfilReportOrder({ id: 'test-only', userId: 'test-user' } as any, 'Career', () => generateDeterministicCareer(fixtureChart(), ASOF, request));
    expect(delivery.setReportOrderContent).not.toHaveBeenCalled(); expect(delivery.failAndRefundReportOrder).toHaveBeenCalledTimes(1);
  });
  it.each(CHARTS)('fits five sections and both corrections under $0.25 with no usage reported for %s', async (date, time, lat, lon) => {
    const k = fixtureChart(date, time, lat, lon); const ledger = new CareerSpending();
    const request = perSection(responder(buildFiveCareerEvidence(k, ASOF)), (s, attempt) => { if ([2, 4].includes(s.id) && attempt === 1) s.draft = {}; });
    const unreported = vi.fn(async (p: string, o: any) => { const r = await request(p, o); delete r.usage; return r; });
    const report = await generateDeterministicCareer(k, ASOF, unreported, { ledger });
    expect(report.sections).toHaveLength(5); expect(unreported).toHaveBeenCalledTimes(7);
    expect(ledger.spent).toBeLessThanOrEqual(CAREER_BUDGET_MICRO_USD); expect(ledger.reserved).toBe(0);
  });
});

// Shapes GPT-4o returned for the earlier prompt, which said chart contexts are rendered by the
// application and showed a SECTIONS list without a "draft" wrapper: every section failed "schema".
const omitContexts = (d: any) => { for (const k of ['supporting', 'limiting', 'conclusion']) delete d[k].contexts; return d; };
describe('five-section Career: realistic model response shapes', () => {
  it('reproduces the live failure: blocks without contexts were rejected by the strict schema', () => {
    const e = buildFiveCareerEvidence(fixtureChart(), ASOF);
    for (const p of e.packets) expect(careerDraftSchema.safeParse(omitContexts(draft(p))).success).toBe(false);
  });
  it.each(CHARTS)('accepts every section when every block omits contexts (%s)', async (date, time, lat, lon) => {
    const k = fixtureChart(date, time, lat, lon); const e = buildFiveCareerEvidence(k, ASOF); const metrics = vi.fn();
    const request = perSection(responder(e), (s) => omitContexts(s.draft));
    const report = await generateDeterministicCareer(k, ASOF, request, { onMetrics: metrics });
    expect(metrics).toHaveBeenCalledWith(expect.objectContaining({ calls: 5, corrections: 0, firstPassAccepted: 5 }));
    // Contexts come from the cited facts, so the rendered sections are those of a fully specified reply.
    for (const p of e.packets) expect(report.sections[p.id].body).toBe(renderCareerSection(p, validateFiveCareerDraft(p, draft(p), e).draft!));
  });
  it('accepts sections without the draft wrapper, echoed headings, string ids, a capitalised workStyle and paragraph arrays', async () => {
    const base = responder();
    const request = vi.fn(async (p: string) => {
      const r = await base(p); const v = JSON.parse(r.choices[0].message.content!);
      v.workStyle = 'Mixed';
      v.sections = v.sections.map((s: any) => ({ id: String(s.id), heading: FIVE_CAREER_HEADINGS[s.id], ...omitContexts(s.draft) }));
      v.sections[0].supporting.text = v.sections[0].supporting.text.split(/(?<=\.)\s+/);
      r.choices[0].message.content = JSON.stringify(v); return r;
    });
    const report = await generateDeterministicCareer(fixtureChart(), ASOF, request);
    expect(request).toHaveBeenCalledTimes(5); expect(report.sections.map((s) => s.heading)).toEqual(FIVE_CAREER_HEADINGS);
  });
  it('derives contexts from cited facts and ignores contexts the model claims', () => {
    const e = buildFiveCareerEvidence(fixtureChart(), ASOF); const p = e.packets[0]; const d: any = draft(p);
    d.supporting.factIds = ['D1.house.10']; d.supporting.contexts = ['D10', 'Vimshottari'];
    expect(validateFiveCareerDraft(p, d, e).draft!.supporting.contexts).toEqual(['D1']);
  });
  it('rejects a citation from another section and corrects only that section', async () => {
    const e = buildFiveCareerEvidence(fixtureChart(), ASOF);
    const foreign = e.packets[1].facts.find((f) => !e.packets[0].facts.some((g) => g.id === f.id))!.id;
    const request = perSection(responder(e), (s, attempt) => { if (s.id === 0 && attempt === 1) s.draft.supporting.factIds.push(foreign); });
    await generateDeterministicCareer(fixtureChart(), ASOF, request);
    expect(idsOf(request)).toEqual([[0], [1], [2], [3], [4], [0]]);
    expect(request.mock.calls[5][0]).toContain('unknown evidence reference');
  });
  it('names the failing field and section in the error, without the model text', async () => {
    const secret = 'UNIQUE-MODEL-PROSE-MARKER';
    const request = perSection(responder(), (s) => { s.draft.supporting = { factIds: s.draft.supporting.factIds, prose: secret }; });
    const failure = generateDeterministicCareer(fixtureChart(), ASOF, request);
    await expect(failure).rejects.toThrow(/systematic first-pass failure.*Career Overview: schema: .*supporting\.text invalid_/);
    await expect(failure).rejects.not.toThrow(new RegExp(secret));
    expect(request).toHaveBeenCalledTimes(5);
  });
  it('states the full block shape, the per-block lengths and the enforced rules in every section prompt', () => {
    const e = buildFiveCareerEvidence(fixtureChart(), ASOF);
    for (const p of e.packets) {
      const prompt = fiveCareerPrompt(e, [p]);
      for (const block of ['supporting', 'limiting', 'conclusion']) expect(prompt).toContain(`"${block}":{"factIds":["<id>"],"text":"<prose>"}`);
      expect(prompt).not.toContain('{...}');
      expect(prompt).toMatch(/supporting at least 90 words, limiting at least 90 words, conclusion at least 80 words/);
      const fields = p.facts.some((f) => f.id.startsWith('D1.D10.field.'));
      expect(prompt).toMatch(fields ? /only when FACTS include that field's D1\.D10\.field assessment/ : /This section has no field assessments: do not name professional fields/);
      expect(prompt).toMatch(/workStyle "mixed", never say/); expect(prompt).toMatch(/Never mention a planet, period, year, date or field that no fact in FACTS supports/);
    }
  });
  // Each rule the prompt states is one the validator enforces; a section that breaks it is rejected.
  it.each([
    ['a field named in a section without field assessments', 3, (d: any) => { d.conclusion.text += ' Consulting roles are suitable here.'; }, /verified field assessment/],
    ['a planet not in any cited fact', 1, (d: any, p: CareerPacket) => {
      const fact = p.facts.find((f) => f.contexts.includes('Vimshottari'))!;
      const absent = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'].find((g) => !fact.text.includes(g))!;
      d.supporting.factIds = [fact.id]; d.supporting.text += ` ${absent} adds polish to this period.`;
    }, /not supported by cited evidence/],
    ['a certain outcome', 3, (d: any) => { d.conclusion.text += ' You will get promoted.'; }, /certain outcome/],
  ] as const)('the validator enforces the prompt rule: %s', (_name, id, change, problem) => {
    const e = buildFiveCareerEvidence(fixtureChart(), ASOF); const p = e.packets[id]; const d = draft(p);
    change(d as any, p);
    expect(validateFiveCareerDraft(p, d, e).problems.join(' ')).toMatch(problem);
  });
});

// The latest live evaluation (synthetic Delhi chart, 1985-03-22 06:15): one shared request,
// 1/5 sections accepted. Periods: unsupported Saturn placement/assertion, year 2030, too short;
// Birth Chart: unsupported Moon assertion, too short; Current: incomplete block, too short;
// Guidance: too short.
describe('five-section Career: the live evaluation failure patterns', () => {
  const delhi = () => fixtureChart('1985-03-22', '06:15', 28.6139, 77.209);
  const setup = (id: number) => { const e = buildFiveCareerEvidence(delhi(), ASOF); const p = e.packets[id]; return { e, p, d: draft(p) }; };
  const factId = (p: CareerPacket, prefix: string) => p.facts.find((f) => f.id.startsWith(prefix))!.id;

  const absentPlanet = (p: CareerPacket) => ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'].find((g) => !p.facts.some((f) => new RegExp(`\\b${g}\\b`).test(f.text)))!;

  it('Periods: Saturn named without its fact cited gets the section\'s Saturn facts attached; a planet the section has no fact for is still rejected', () => {
    const { e, p, d } = setup(1);
    const venus = factId(p, 'Vimshottari.Mahadasha.Venus');
    d.supporting.factIds = [venus]; d.supporting.text += ' Saturn tests the structure of this phase.';
    const checked = validateFiveCareerDraft(p, d, e);
    expect(checked.problems).toEqual([]);
    expect(checked.draft!.supporting.factIds).toEqual(expect.arrayContaining([venus, 'D1.planet.Saturn', 'D10.planet.Saturn', factId(p, 'Vimshottari.Antardasha.Saturn')]));
    const other = setup(1); const absent = absentPlanet(other.p);
    other.d.supporting.text += ` ${absent} tests the structure of this phase.`;
    expect(validateFiveCareerDraft(other.p, other.d, other.e).problems.join(' ')).toMatch(new RegExp(`${absent} assertion is not supported by cited evidence`));
  });
  it('Periods: an uncited Saturn placement is checked against the attached Saturn facts and rejected when wrong', () => {
    const { e, p, d } = setup(1);
    d.supporting.factIds = [factId(p, 'Vimshottari.Antardasha.Saturn')]; d.supporting.text += ' Saturn is in Scorpio.';
    const ok = validateFiveCareerDraft(p, d, e);
    expect(ok.problems).toEqual([]); expect(ok.draft!.supporting.text).toContain('Saturn is in Scorpio in D1');
    const wrong = setup(1); wrong.d.supporting.factIds = [factId(wrong.p, 'Vimshottari.Antardasha.Saturn')]; wrong.d.supporting.text += ' Saturn is in Aries.';
    expect(validateFiveCareerDraft(wrong.p, wrong.d, wrong.e).problems.join(' ')).toMatch(/incorrect placement for Saturn/);
  });
  it('Periods: a year inside a calculated period of the section is accepted with that period attached; a year outside every period is refused', () => {
    const { e, p, d } = setup(1);
    const mercury = factId(p, 'Vimshottari.Antardasha.Mercury');
    expect(p.facts.find((f) => f.id === mercury)!.text).toContain('2029-09-19 → 2032-07-20');
    d.supporting.factIds = [factId(p, 'Vimshottari.Antardasha.Saturn')]; d.supporting.text += ' The emphasis shifts again in 2030 and in 2032.';
    const checked = validateFiveCareerDraft(p, d, e);
    expect(checked.problems).toEqual([]); expect(checked.draft!.supporting.factIds).toContain(mercury);
    const late = setup(1); late.d.supporting.text += ' Another change follows in 2045.';
    expect(validateFiveCareerDraft(late.p, late.d, late.e).problems.join(' ')).toMatch(/the year 2045 is not in the calculated timing/);
  });
  it('Periods: the prompt states no date that is not in a fact (the old review-window end, 2030-10-15, was one)', () => {
    const { e, p } = setup(1); const prompt = fiveCareerPrompt(e, [p], { workStyle: 'mixed' });
    const factDates = new Set(p.facts.flatMap((f) => f.text.match(/\d{4}-\d{2}-\d{2}/g) ?? []));
    for (const date of prompt.match(/\d{4}-\d{2}-\d{2}/g) ?? []) expect(factDates.has(date)).toBe(true);
    expect(prompt).not.toMatch(/review window/);
  });
  it('Your Birth Chart: the Moon named without D1.planet.Moon cited gets it attached; a field name there is still rejected', () => {
    const { e, p, d } = setup(2);
    d.limiting.factIds = ['D1.house.10']; d.limiting.text += ' The Moon colours how pressure at work is felt.';
    const checked = validateFiveCareerDraft(p, d, e);
    expect(checked.problems).toEqual([]); expect(checked.draft!.limiting.factIds).toContain('D1.planet.Moon');
    const field = setup(2); field.d.supporting.text += ' Communication roles suit this chart.';
    expect(validateFiveCareerDraft(field.p, field.d, field.e).problems.join(' ')).toMatch(/Communication and public-facing professions needs its verified field assessment/);
  });
  it('Career Overview and Personalised Guidance: a field named without its assessment cited gets it attached, and the weak-field rule still applies', () => {
    for (const id of [0, 4]) {
      const { e, p } = setup(id);
      for (const f of p.facts.filter((x) => x.id.startsWith('D1.D10.field.'))) {
        const field = f.value as { id: keyof typeof FIELDS; label: string; rating: string }; const d = draft(p);
        d.limiting.factIds = [p.facts.find((x) => !x.id.startsWith('D1.D10.field.'))!.id];
        d.limiting.text += ` ${field.label} roles are worth considering here.`;
        const checked = validateFiveCareerDraft(p, d, e);
        if (field.rating === 'weakly supported') expect(checked.problems.join(' ')).toMatch(/weak field must not be recommended/);
        else { expect(checked.problems).toEqual([]); expect(checked.draft!.limiting.factIds).toContain(f.id); }
      }
    }
  });
  it('a conclusion draws only on facts already weighed above: it gets nothing attached from elsewhere in the section', () => {
    const { e, p, d } = setup(1);
    const venus = factId(p, 'Vimshottari.Mahadasha.Venus');
    d.supporting.factIds = [venus]; d.limiting.factIds = [venus]; d.conclusion.factIds = [venus];
    d.supporting.text = d.supporting.text.replace(/\b(Saturn|Mercury)\b/g, 'the period'); d.limiting.text = d.limiting.text.replace(/\b(Saturn|Mercury)\b/g, 'the period');
    d.conclusion.text += ' Saturn tests the structure of this phase.';
    expect(validateFiveCareerDraft(p, d, e).problems.join(' ')).toMatch(/conclusion: Saturn assertion is not supported by cited evidence/);
  });
  it('Current Career Situation: a block under 45 words and a section under 225 words are still rejected', () => {
    const { e, p, d } = setup(3);
    d.conclusion.text = words(30);
    expect(validateFiveCareerDraft(p, d, e).problems.join(' ')).toMatch(/conclusion: incomplete interpretation/);
    const naming = p.facts.filter((f) => f.contexts.includes('Vimshottari')).map((f) => `The running ${(f.value as any).lord} ${f.id.split('.')[1]} sets part of this timing context.`).join(' ');
    d.supporting.text = `${words(60)} ${naming}`; d.limiting.text = words(70); d.conclusion.text = words(70);
    expect(validateFiveCareerDraft(p, d, e).problems.join(' ')).toMatch(/too short: at least 225 words/);
    d.conclusion.text = words(90);
    expect(validateFiveCareerDraft(p, d, e).problems).toEqual([]);
  });
  it('the shared-request pattern (four short sections) still fails closed and refunds: no weakening', async () => {
    const request = perSection(responder(buildFiveCareerEvidence(delhi(), ASOF)), (s) => { if (s.id !== 0) s.draft.conclusion.text = words(30); });
    delivery.failAndRefundReportOrder.mockResolvedValue({ refunded: 299 }); delivery.createNotification.mockResolvedValue({});
    await fulfilReportOrder({ id: 'test-only', userId: 'test-user' } as any, 'Career', () => generateDeterministicCareer(delhi(), ASOF, request));
    expect(request).toHaveBeenCalledTimes(5); expect(delivery.setReportOrderContent).not.toHaveBeenCalled(); expect(delivery.failAndRefundReportOrder).toHaveBeenCalledTimes(1);
  });
  it('per-section requests recover two such sections with targeted corrections and stay within budget', async () => {
    const e = buildFiveCareerEvidence(delhi(), ASOF); const ledger = new CareerSpending(); const metrics = vi.fn();
    const request = perSection(responder(e), (s, attempt) => {
      if (attempt > 1) return;
      if (s.id === 1) s.draft.supporting.text += ` ${absentPlanet(e.packets[1])} tests the structure of this phase.`;
      if (s.id === 3) s.draft.conclusion.text = words(30);
    });
    const report = await generateDeterministicCareer(delhi(), ASOF, request, { ledger, onMetrics: metrics });
    expect(report.sections.map((s) => s.heading)).toEqual(FIVE_CAREER_HEADINGS);
    expect(idsOf(request).slice(5).flat().sort()).toEqual([1, 3]);
    expect(metrics).toHaveBeenCalledWith(expect.objectContaining({ calls: 7, corrections: 2, firstPassAccepted: 3 }));
    expect(ledger.spent).toBeLessThanOrEqual(CAREER_BUDGET_MICRO_USD);
  });
});

// Live evaluation of d5705f6: 3/5 first pass, Your Birth Chart corrected, Favourable & Difficult
// Periods rejected twice for reasons that were not about the chart. Replayed with the model's own text.
describe('five-section Career: the d5705f6 live evaluation', () => {
  const delhi = () => buildFiveCareerEvidence(fixtureChart('1985-03-22', '06:15', 28.6139, 77.209), ASOF);
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  it('the Saturn Antardasha is the running period at the evaluation date (so Mercury is not)', () => {
    const e = delhi(); const running = e.packets[3].facts.filter((f) => f.id.startsWith('Vimshottari.Antardasha.')).map((f) => f.id);
    expect(running).toHaveLength(1); expect(running[0]).toMatch(/^Vimshottari\.Antardasha\.Saturn\./);
  });
  it('accepts the correction: "could present challenges" about the upcoming Mercury Antardasha is not a running-period claim', () => {
    const e = delhi(); const checked = validateFiveCareerDraft(e.packets[1], clone(LIVE_PERIODS_CORRECTION), e);
    expect(checked.problems).toEqual([]);
  });
  it('accepts the first pass: the conclusion loses the D10.planet.Venus citation it never used', () => {
    const e = delhi(); const checked = validateFiveCareerDraft(e.packets[1], clone(LIVE_PERIODS_FIRST), e);
    expect(checked.problems).toEqual([]);
    expect(checked.draft!.conclusion.factIds).not.toContain('D10.planet.Venus');
    expect(checked.draft!.conclusion.factIds).toEqual(expect.arrayContaining(['D1.planet.Venus', 'D1.planet.Mercury']));
  });
  it('still rejects a conclusion whose text relies only on facts not weighed above', () => {
    const e = delhi(); const d = clone(LIVE_PERIODS_FIRST);
    d.conclusion.factIds = ['D10.planet.Venus']; d.conclusion.text += ' In D10 Venus is in Leo.';
    expect(validateFiveCareerDraft(e.packets[1], d, e).problems.join(' ')).toMatch(/conclusion introduces evidence not weighed above/);
  });
  it('still rejects a claim that the Mercury Antardasha is running now, however "present" is used', () => {
    const e = delhi();
    for (const claim of ['The present Mercury Antardasha brings change.', 'At present the Mercury Antardasha shapes your work.', 'The Mercury Antardasha is presently active.', 'You are currently in the Mercury Antardasha.']) {
      const d = clone(LIVE_PERIODS_CORRECTION); d.limiting.text += ` ${claim}`;
      expect(validateFiveCareerDraft(e.packets[1], d, e).problems.join(' ')).toMatch(/the running Antardasha is Saturn, not Mercury/);
    }
  });
});

// Review of the sections that d5705f6 accepted: defects the checks missed, replayed with the model's text.
describe('five-section Career: review of the accepted d5705f6 sections', () => {
  const delhi = () => buildFiveCareerEvidence(fixtureChart('1985-03-22', '06:15', 28.6139, 77.209), ASOF);
  const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
  const heading = (e: ReturnType<typeof delhi>, h: string) => e.packets.find((p) => p.heading === h)!;
  it('rejects Personalised Guidance: Mars is in D1 house 2, not the 11th house, and "workStyle" is an internal term', () => {
    const e = delhi(); const problems = validateFiveCareerDraft(heading(e, 'Personalised Guidance'), clone(LIVE_GUIDANCE), e).problems.join(' ');
    expect(problems).toMatch(/Mars is in house 2 in D1, not house 11/); expect(problems).toMatch(/internal term "workStyle"/);
  });
  it('rejects Current Career Situation: it never names the running Saturn Antardasha', () => {
    const e = delhi(); const problems = validateFiveCareerDraft(heading(e, 'Current Career Situation'), clone(LIVE_CURRENT), e).problems;
    expect(problems).toEqual(['name and interpret the running Saturn Antardasha']);
  });
  it('accepts Your Birth Chart and keeps its Moon sentence readable', () => {
    const e = delhi(); const c = validateFiveCareerDraft(heading(e, 'Your Birth Chart'), clone(LIVE_BIRTH_CHART), e);
    expect(c.problems).toEqual([]);
    expect(c.draft!.limiting.text).toContain('The combust state of the Moon in Pisces in D1 may hinder'); expect(c.draft!.limiting.text).not.toMatch(/the in D1/);
  });
  it('accepts Career Overview', () => {
    const e = delhi(); expect(validateFiveCareerDraft(heading(e, 'Career Overview'), clone(LIVE_OVERVIEW), e).problems).toEqual([]);
  });
  it.each([
    ["Mars' favourable placement in moolatrikona and the 11th house supports initiative.", /Mars is in house 2 in D1, not house 11/],
    ['Jupiter sits in the tenth house.', /Jupiter is in house 11 in D1, not house 10/],
    ['In D10, Mercury is placed in the 10th house.', /Mercury is in house 8 in D10, not house 10/],
  ])('house placement is checked: %s', (text, problem) => { expect(houseClaimProblems(text, delhi()).join(' ')).toMatch(problem); });
  it.each([
    'The debilitated condition of Jupiter in the 11th house of the D1 chart limits gains.',
    'Venus is exalted in Pisces in the first house in D1.',
    'Saturn in Scorpio in the ninth house of D1 is retrograde.',
    "Jupiter's rulership of both the D1 10th house and the D10 Lagna supports advisory work.",
    "Mercury's influence over the D10 10th house shapes your work.",
    'Rahu aspects the 10th house.',
    'Mercury, the lord of the 10th house in D10, is in an enemy sign.',
    'Mars and the 11th house bindus support initiative.',
  ])('house statements that are true or are not placements pass: %s', (text) => { expect(houseClaimProblems(text, delhi())).toEqual([]); });
  it('every section prompt asks for "you", forbids writing workStyle and forbids unstated house placements', () => {
    const e = delhi();
    for (const p of e.packets) { const prompt = fiveCareerPrompt(e, [p], { workStyle: 'mixed' }); expect(prompt).toMatch(/Address the reader as "you"/); expect(prompt).toMatch(/never write the word workStyle/); expect(prompt).toMatch(/never place a planet in a house or sign that its fact does not state/); }
    expect(fiveCareerPrompt(e, [heading(e, 'Current Career Situation')])).toMatch(/Name and interpret both running periods/);
    expect(fiveCareerPrompt(e, [heading(e, 'Career Overview')])).toMatch(/Name at most the two best-supported fields/);
  });
});

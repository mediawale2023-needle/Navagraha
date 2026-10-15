import { afterEach, describe, expect, it, vi } from 'vitest';
import { CareerSpending, CAREER_BUDGET_MICRO_USD, CAREER_DEADLINE_MS, careerRequester, generateDeterministicCareer, type CareerCompletion } from '../../server/careerReportGeneration';
import { buildFiveCareerEvidence, FIVE_CAREER_HEADINGS, type CareerPacket } from '../../server/careerReportEvidence';
import { validateFiveCareerDraft, renderCareerSection, fiveCareerPrompt, careerDraftSchema } from '../../server/careerReportRendering';
import { ASOF, fixtureChart } from '../fixtures/career-chart';
import { CAREER_PROSE } from '../fixtures/career-prose';
import { computeCanonicalChart } from '../../server/astroEngine/canonical/compute';
import { resolveBirthWithCoordinates } from '../../server/astroEngine/birthResolver';

const delivery = vi.hoisted(() => ({ setReportOrderContent: vi.fn(), failAndRefundReportOrder: vi.fn(), createNotification: vi.fn() }));
vi.mock('../../server/storage', () => ({ storage: delivery }));
vi.mock('../../server/pushService', () => ({ sendPushToUser: vi.fn() }));
import { fulfilReportOrder } from '../../server/reportOrders';

function draft(p: CareerPacket) {
  const [a, b] = [[0, 7], [8, 4], [1, 3], [2, 9], [6, 5]][p.id];
  const blocks = ['supporting', 'limiting', 'conclusion'].map((_, i) => ({ factIds: p.facts.map((f) => f.id), contexts: Array.from(new Set(p.facts.flatMap((f) => f.contexts))), text: `${CAREER_PROSE[a][i]} ${CAREER_PROSE[b][i].split(/(?<=[.!?])\s+/)[0]}` }));
  return { supporting: blocks[0], limiting: blocks[1], conclusion: blocks[2] };
}
const plan = (prompt: string): CareerPacket[] => JSON.parse(prompt.split('\nSECTIONS\n')[1].split('\nCORRECTION\n')[0]);
function responder(e = buildFiveCareerEvidence(fixtureChart(), ASOF)) {
  return vi.fn(async (prompt: string): Promise<CareerCompletion> => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ workStyle: 'mixed', sections: plan(prompt).map((p) => ({ id: p.id, draft: draft(e.packets[p.id]) })) }) } }], usage: { prompt_tokens: 4500, completion_tokens: 4000 } }));
}
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('coordinated five-section Career pipeline', () => {
  it.each([['1991-11-13', '12:30', 15.8497, 74.4977], ['1985-03-22', '06:15', 28.6139, 77.209], ['2000-07-04', '18:45', 19.076, 72.8777]] as const)('delivers all five sections in one request for %s', async (date, time, lat, lon) => {
    const k = fixtureChart(date, time, lat, lon); const request = responder(buildFiveCareerEvidence(k, ASOF)); const metrics = vi.fn();
    const report = await generateDeterministicCareer(k, ASOF, request, { onMetrics: metrics });
    expect(report.sections.map((s) => s.heading)).toEqual(FIVE_CAREER_HEADINGS);
    expect(request).toHaveBeenCalledTimes(1);
    expect(metrics).toHaveBeenCalledWith({ calls: 1, corrections: 0, costMicroUsd: 51_250, firstPassAccepted: 5 });
    expect(report.sections[2].body).toContain('Lagna: the rising sign');
    expect(report.sections[2].body).toContain('accurate birth time');
    expect(report.dashaTimeline.length).toBeGreaterThan(0);
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
    expect(checked.problems).toEqual([]); expect(checked.draft!.supporting.text).toContain('in D10, Jupiter is in Capricorn');
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
  it('rejects career recommendations without their field evidence', () => {
    const e = buildFiveCareerEvidence(fixtureChart(), ASOF); const p = e.packets[0]; const d = draft(p);
    d.conclusion.text += ' Finance roles are ideal for your career.';
    expect(validateFiveCareerDraft(p, d, e).problems.join(' ')).toContain('verified field assessment');
  });
  it('corrects only a missing section and preserves all passing content', async () => {
    const e = buildFiveCareerEvidence(fixtureChart(), ASOF); const base = responder(e); let calls = 0;
    const request = vi.fn(async (p: string) => { const r = await base(p); if (++calls === 1) { const parsed = JSON.parse(r.choices[0].message.content!); parsed.sections.pop(); r.choices[0].message.content = JSON.stringify(parsed); } return r; });
    const report = await generateDeterministicCareer(fixtureChart(), ASOF, request);
    expect(request).toHaveBeenCalledTimes(2); expect(plan(request.mock.calls[1][0]).map((p) => p.id)).toEqual([4]);
    for (const p of e.packets) expect(report.sections[p.id].body).toBe(renderCareerSection(p, draft(p)));
  });
  it.each(['length', 'content_filter'])('fails closed on %s without expensive full-report regeneration', async (reason) => {
    const base = responder(); const request = vi.fn(async (p: string) => { const r = await base(p); r.choices[0].finish_reason = reason; return r; });
    await expect(generateDeterministicCareer(fixtureChart(), ASOF, request)).rejects.toThrow(/incomplete/); expect(request).toHaveBeenCalledTimes(1);
  });
  it.each(['{', '{}'])('rejects malformed or incomplete output', async (content) => {
    await expect(generateDeterministicCareer(fixtureChart(), ASOF, async () => ({ choices: [{ finish_reason: 'stop', message: { content } }] }))).rejects.toThrow(/quality check/);
  });
  it('does not retry systematic failure', async () => {
    const request = vi.fn(async () => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ workStyle: 'mixed', sections: [] }) } }] }));
    await expect(generateDeterministicCareer(fixtureChart(), ASOF, request)).rejects.toThrow(/systematic/); expect(request).toHaveBeenCalledTimes(1);
  });
  it('enforces at most two correction calls', async () => {
    const base = responder(); const request = vi.fn(async (p: string) => { const r = await base(p); const v = JSON.parse(r.choices[0].message.content!); for (const s of v.sections) if ([0, 4].includes(s.id)) s.draft = {}; r.choices[0].message.content = JSON.stringify(v); return r; });
    await expect(generateDeterministicCareer(fixtureChart(), ASOF, request)).rejects.toThrow(/bounded correction/); expect(request).toHaveBeenCalledTimes(3);
  });
  it('rejects inconsistent work-style conclusions', async () => {
    const base = responder(); const request = vi.fn(async (p: string) => { const r = await base(p); const v = JSON.parse(r.choices[0].message.content!); for (const s of v.sections) if (s.id === 0) s.draft.conclusion.text += ' This recommends employment.'; r.choices[0].message.content = JSON.stringify(v); return r; });
    await expect(generateDeterministicCareer(fixtureChart(), ASOF, request)).rejects.toThrow(/bounded correction/);
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
  it('reserves before dispatch, retains missing usage and refuses overspending', async () => {
    const l = new CareerSpending(); const id = l.reserve('prompt', 6000); const reserved = l.reserved; l.settle(id); l.settle(id);
    expect(l.spent).toBe(reserved); const request = vi.fn();
    await expect(generateDeterministicCareer(fixtureChart(), ASOF, request, { ledger: new CareerSpending(1) })).rejects.toThrow(/ceiling/); expect(request).not.toHaveBeenCalled();
    expect(() => new CareerSpending(250001)).toThrow();
  });
  it('does not oversubscribe concurrent reservations', async () => {
    const l = new CareerSpending(125000); let sent = 0;
    const results = await Promise.allSettled(Array.from({ length: 3 }, async () => { const id = l.reserve('prompt', 6000); sent++; await Promise.resolve(); l.settle(id, { prompt_tokens: 1, completion_tokens: 1 }); }));
    expect(sent).toBe(2); expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
  it('uses explicit output limits and disables hidden SDK retries', async () => {
    const create = vi.fn(async () => ({})); await careerRequester({ chat: { completions: { create } } } as any)('prompt', { signal: new AbortController().signal, maxTokens: 6000 });
    expect(create.mock.calls[0][0].max_tokens).toBe(6000); expect(create.mock.calls[0][1]).toMatchObject({ maxRetries: 0, timeout: 120000 });
  });
});

const CHARTS = [['1991-11-13', '12:30', 15.8497, 74.4977], ['1985-03-22', '06:15', 28.6139, 77.209], ['2000-07-04', '18:45', 19.076, 72.8777]] as const;
const edit = (base: ReturnType<typeof responder>, change: (v: any, call: number) => void) => {
  let call = 0;
  return vi.fn(async (p: string) => { const r = await base(p); const v = JSON.parse(r.choices[0].message.content!); change(v, ++call); r.choices[0].message.content = JSON.stringify(v); return r; });
};

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
    const request = edit(responder(e), (v, call) => { if (call === 1) v.sections.find((s: any) => s.id === 2).draft.supporting.text += ' In D10 Jupiter is in Leo.'; });
    const report = await generateDeterministicCareer(fixtureChart(), ASOF, request, { onMetrics: metrics });
    expect(request).toHaveBeenCalledTimes(2);
    const correction = request.mock.calls[1][0];
    expect(plan(correction).map((p) => p.id)).toEqual([2]);
    expect(correction).toContain('Jupiter is in Capricorn in the D10, not Leo'); expect(correction).toContain('"workStyle":"mixed"');
    for (const p of e.packets) expect(report.sections[p.id].body).toBe(renderCareerSection(p, validateFiveCareerDraft(p, draft(p), e).draft!));
    expect(report.sections[2].body).not.toContain('In D10 Jupiter is in Leo');
    expect(metrics).toHaveBeenCalledWith(expect.objectContaining({ calls: 2, corrections: 1, firstPassAccepted: 4 }));
  });
  it('tolerates echoed keys in the coordinated envelope', async () => {
    const request = edit(responder(), (v) => { v.title = 'Career'; for (const s of v.sections) s.heading = FIVE_CAREER_HEADINGS[s.id]; });
    const report = await generateDeterministicCareer(fixtureChart(), ASOF, request);
    expect(report.sections).toHaveLength(5); expect(request).toHaveBeenCalledTimes(1);
  });
  it('fails when a correction changes the shared work-style conclusion', async () => {
    const request = edit(responder(), (v, call) => { if (call === 1) v.sections.find((s: any) => s.id === 4).draft = {}; else v.workStyle = 'employment'; });
    await expect(generateDeterministicCareer(fixtureChart(), ASOF, request)).rejects.toThrow(/work-style/); expect(request).toHaveBeenCalledTimes(2);
  });
  it('fails closed on a transport error and refunds through the existing delivery path', async () => {
    const request = vi.fn(async () => { throw new Error('test connection failure'); });
    delivery.failAndRefundReportOrder.mockResolvedValue({ refunded: 299 }); delivery.createNotification.mockResolvedValue({});
    await fulfilReportOrder({ id: 'test-only', userId: 'test-user' } as any, 'Career', () => generateDeterministicCareer(fixtureChart(), ASOF, request));
    expect(request).toHaveBeenCalledTimes(1);
    expect(delivery.setReportOrderContent).not.toHaveBeenCalled(); expect(delivery.failAndRefundReportOrder).toHaveBeenCalledTimes(1);
  });
  it('does not persist a report whose sections remain invalid', async () => {
    const request = edit(responder(), (v) => { v.sections.find((s: any) => s.id === 1).draft = {}; });
    delivery.failAndRefundReportOrder.mockResolvedValue({ refunded: 299 }); delivery.createNotification.mockResolvedValue({});
    await fulfilReportOrder({ id: 'test-only', userId: 'test-user' } as any, 'Career', () => generateDeterministicCareer(fixtureChart(), ASOF, request));
    expect(delivery.setReportOrderContent).not.toHaveBeenCalled(); expect(delivery.failAndRefundReportOrder).toHaveBeenCalledTimes(1);
  });
  it.each(CHARTS)('fits the first pass and both corrections under $0.25 with no usage reported for %s', async (date, time, lat, lon) => {
    const k = fixtureChart(date, time, lat, lon); const ledger = new CareerSpending();
    const request = edit(responder(buildFiveCareerEvidence(k, ASOF)), (v, call) => { if (call === 1) for (const s of v.sections) if ([0, 4].includes(s.id)) s.draft = {}; });
    const unreported = vi.fn(async (p: string, o: any) => { const r = await request(p, o); delete r.usage; return r; });
    const report = await generateDeterministicCareer(k, ASOF, unreported, { ledger });
    expect(report.sections).toHaveLength(5); expect(unreported).toHaveBeenCalledTimes(3);
    expect(ledger.spent).toBeLessThanOrEqual(CAREER_BUDGET_MICRO_USD); expect(ledger.reserved).toBe(0);
  });
});

// Shapes GPT-4o actually returns for this prompt, not the idealised mock: the prompt told it
// that chart contexts are rendered by the application, and the SECTIONS list it reads has no
// "draft" wrapper. Live evaluations rejected all five sections with a bare "schema" error.
const omitContexts = (d: any) => { for (const k of ['supporting', 'limiting', 'conclusion']) delete d[k].contexts; return d; };
describe('five-section Career: realistic model response shapes', () => {
  it('reproduces the live failure: blocks without contexts were rejected by the strict schema', () => {
    const e = buildFiveCareerEvidence(fixtureChart(), ASOF);
    for (const p of e.packets) expect(careerDraftSchema.safeParse(omitContexts(draft(p))).success).toBe(false);
  });
  it.each(CHARTS)('accepts all five sections in one call when every block omits contexts (%s)', async (date, time, lat, lon) => {
    const k = fixtureChart(date, time, lat, lon); const e = buildFiveCareerEvidence(k, ASOF); const metrics = vi.fn();
    const request = edit(responder(e), (v) => { for (const s of v.sections) omitContexts(s.draft); });
    const report = await generateDeterministicCareer(k, ASOF, request, { onMetrics: metrics });
    expect(request).toHaveBeenCalledTimes(1);
    expect(metrics).toHaveBeenCalledWith(expect.objectContaining({ calls: 1, corrections: 0, firstPassAccepted: 5 }));
    // Contexts come from the cited facts, so the rendered sections are those of a fully specified reply.
    for (const p of e.packets) expect(report.sections[p.id].body).toBe(renderCareerSection(p, validateFiveCareerDraft(p, draft(p), e).draft!));
  });
  it('accepts sections without the draft wrapper, echoed headings, string ids, a capitalised workStyle and paragraph arrays', async () => {
    const e = buildFiveCareerEvidence(fixtureChart(), ASOF);
    const request = edit(responder(e), (v) => {
      v.workStyle = 'Mixed';
      v.sections = v.sections.map((s: any) => ({ id: String(s.id), heading: FIVE_CAREER_HEADINGS[s.id], ...omitContexts(s.draft) }));
      const b = v.sections[0].supporting; b.text = b.text.split(/(?<=\.)\s+/);
    });
    const report = await generateDeterministicCareer(fixtureChart(), ASOF, request);
    expect(request).toHaveBeenCalledTimes(1); expect(report.sections.map((s) => s.heading)).toEqual(FIVE_CAREER_HEADINGS);
  });
  it('derives contexts from cited facts and ignores contexts the model claims', () => {
    const e = buildFiveCareerEvidence(fixtureChart(), ASOF); const p = e.packets[0]; const d: any = draft(p);
    d.supporting.factIds = ['D1.house.10']; d.supporting.contexts = ['D10', 'Vimshottari'];
    expect(validateFiveCareerDraft(p, d, e).draft!.supporting.contexts).toEqual(['D1']);
  });
  it('keeps accuracy checks under the tolerant shape: an invented placement in a wrapper-less, context-free reply is corrected', async () => {
    const e = buildFiveCareerEvidence(fixtureChart(), ASOF);
    const request = edit(responder(e), (v, call) => {
      v.sections = v.sections.map((s: any) => ({ id: s.id, ...omitContexts(s.draft) }));
      if (call === 1) v.sections.find((s: any) => s.id === 2).supporting.text += ' In D10 Jupiter is in Leo.';
    });
    const report = await generateDeterministicCareer(fixtureChart(), ASOF, request);
    expect(request).toHaveBeenCalledTimes(2); expect(request.mock.calls[1][0]).toContain('not Leo');
    expect(report.sections[2].body).not.toContain('In D10 Jupiter is in Leo');
  });
  it('rejects a citation from another section and corrects only that section', async () => {
    const e = buildFiveCareerEvidence(fixtureChart(), ASOF);
    const foreign = e.packets[1].facts.find((f) => !e.packets[0].facts.some((g) => g.id === f.id))!.id;
    const request = edit(responder(e), (v, call) => { if (call === 1) v.sections.find((s: any) => s.id === 0).draft.supporting.factIds.push(foreign); });
    await generateDeterministicCareer(fixtureChart(), ASOF, request);
    expect(request).toHaveBeenCalledTimes(2); expect(plan(request.mock.calls[1][0]).map((p) => p.id)).toEqual([0]);
    expect(request.mock.calls[1][0]).toContain('unknown evidence reference');
  });
  it('names the failing field and section in the error, without the model text', async () => {
    const secret = 'UNIQUE-MODEL-PROSE-MARKER';
    const request = edit(responder(), (v) => { for (const s of v.sections) { s.draft.supporting = { factIds: s.draft.supporting.factIds, prose: secret }; } });
    const failure = generateDeterministicCareer(fixtureChart(), ASOF, request);
    await expect(failure).rejects.toThrow(/systematic first-pass failure.*Career Overview: schema: .*supporting\.text invalid_/);
    await expect(failure).rejects.not.toThrow(new RegExp(secret));
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('states the full block shape and the enforced rules in the prompt', () => {
    const e = buildFiveCareerEvidence(fixtureChart(), ASOF); const prompt = fiveCareerPrompt(e, e.packets);
    for (const block of ['supporting', 'limiting', 'conclusion']) expect(prompt).toContain(`"${block}":{"factIds":["<id>"],"text":"<prose>"}`);
    expect(prompt).not.toContain('{...}');
    expect(prompt).toMatch(/each block at least 80 words/); expect(prompt).toMatch(/cite only the factIds listed for that section/);
    expect(prompt).toMatch(/only in a block that cites that field's D1\.D10\.field assessment/); expect(prompt).toMatch(/workStyle "mixed", never say/);
  });
  // Each rule the prompt now states is one the validator enforces; a section that breaks it is rejected.
  it.each([
    ['a field named outside its assessment', 0, (d: any) => { d.conclusion.text += ' Consulting roles are suitable here.'; }, /verified field assessment/],
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

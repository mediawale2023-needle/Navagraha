import { afterEach, describe, expect, it, vi } from 'vitest';
import { CareerSpending, CAREER_BUDGET_MICRO_USD, CAREER_DEADLINE_MS, careerRequester, generateDeterministicCareer, type CareerCompletion } from '../../server/careerReportGeneration';
import { careerDraftPrompt, renderCareerSection } from '../../server/careerReportRendering';
import { buildCareerEvidence, type CareerPacket } from '../../server/careerReportEvidence';
import { ASOF, fixtureChart, fixtureDraft } from '../fixtures/career-chart';

const delivery = vi.hoisted(() => ({ setReportOrderContent: vi.fn(), failAndRefundReportOrder: vi.fn(), createNotification: vi.fn() }));
vi.mock('../../server/storage', () => ({ storage: delivery }));
vi.mock('../../server/pushService', () => ({ sendPushToUser: vi.fn() }));
import { fulfilReportOrder } from '../../server/reportOrders';

const packetOf = (p: string): CareerPacket => JSON.parse(p.split('PACKET\n')[1].split('\nCORRECTION:')[0]);
const reply = (p: string): CareerCompletion => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(fixtureDraft(packetOf(p))) } }], usage: { prompt_tokens: 1500, completion_tokens: 450 } });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('Career complete pipeline, mocked provider and realistic prose', () => {
  it.each([
    ['1991-11-13', '12:30', 15.8497, 74.4977], ['1985-03-22', '06:15', 28.6139, 77.2090], ['2000-07-04', '18:45', 19.0760, 72.8777],
  ] as const)('assembles all sections without any correction for %s', async (date, time, lat, lon) => {
    const request = vi.fn(async (p: string) => reply(p)); const metrics = vi.fn();
    const report = await generateDeterministicCareer(fixtureChart(date, time, lat, lon), ASOF, request, { onMetrics: metrics });
    expect(report.sections).toHaveLength(10); expect(request).toHaveBeenCalledTimes(10);
    expect(metrics).toHaveBeenCalledWith({ calls: 10, corrections: 0, costMicroUsd: 82_500, firstPassAccepted: 10 });
    expect(report.generatedAt).toBe(ASOF.toISOString());
    expect(report.sections[3].body).toContain('D10 Lagna depends on an accurate birth time');
  });
  it('corrects only one rejected section and preserves every passing byte', async () => {
    const request = vi.fn(async (p: string) => {
      const r = reply(p); if (packetOf(p).id === 3 && !p.includes('CORRECTION:')) {
        const d = fixtureDraft(packetOf(p)); d.supporting.text += ' In D10 Jupiter is in Leo.'; r.choices[0].message.content = JSON.stringify(d);
      } return r;
    });
    const k = fixtureChart(); const result = await generateDeterministicCareer(k, ASOF, request);
    expect(request).toHaveBeenCalledTimes(11);
    expect(request.mock.calls[10][0]).toContain('factual restatement prohibited');
    const evidence = buildCareerEvidence(k, ASOF);
    for (const p of evidence.packets) expect(result.sections[p.id].body).toBe(renderCareerSection(p, fixtureDraft(p)));
  });
  it('renders metadata from canonical facts even when legacy tables disagree', async () => {
    const k: any = fixtureChart();
    k.chartData.planetaryPositions = [{ planet: 'Jupiter', sign: 'Capricorn' }];
    k.dashas = [{ planet: 'Jupiter', startDate: '2029-01-01', endDate: '2040-12-03' }];
    const report = await generateDeterministicCareer(k, ASOF, async (p) => reply(p));
    expect(report.planetaryPositions.find((p) => p.planet === 'Jupiter')?.sign).toBe('Leo');
    expect(report.dashaTimeline.find((p) => p.planet === 'Jupiter')?.startDate).toBe('2024-12-03');
    expect(report.summary).toContain('D10 Lagna is Pisces');
  });
  it('allows at most two targeted calls, even when both corrections fail', async () => {
    const request = vi.fn(async (p: string) => { const r = reply(p); if ([3, 8].includes(packetOf(p).id)) r.choices[0].message.content = '{}'; return r; });
    await expect(generateDeterministicCareer(fixtureChart(), ASOF, request)).rejects.toThrow(/quality failure/);
    expect(request).toHaveBeenCalledTimes(12);
  });
  it('reproduces eight first-pass failures and does not conceal them with retries', async () => {
    const request = vi.fn(async (p: string) => { const r = reply(p); if (packetOf(p).id < 8) r.choices[0].message.content = '{}'; return r; });
    await expect(generateDeterministicCareer(fixtureChart(), ASOF, request)).rejects.toThrow(/first pass rejected 8/);
    expect(request).toHaveBeenCalledTimes(10);
  });
  it.each(['length', 'content_filter', null])('classifies incomplete output (%s), then recovers only that section', async (reason) => {
    const request = vi.fn(async (p: string) => { const r = reply(p); if (packetOf(p).id === 0 && !p.includes('CORRECTION:')) r.choices[0].finish_reason = reason; return r; });
    await generateDeterministicCareer(fixtureChart(), ASOF, request);
    expect(request).toHaveBeenCalledTimes(11); expect(request.mock.calls[10][0]).toContain('incomplete-response');
  });
  it('recovers malformed JSON and a transport failure with at most two corrections', async () => {
    const request = vi.fn(async (p: string) => {
      if (!p.includes('CORRECTION:') && packetOf(p).id === 0) throw new Error('test connection failure');
      const r = reply(p); if (!p.includes('CORRECTION:') && packetOf(p).id === 1) r.choices[0].message.content = '{'; return r;
    });
    await generateDeterministicCareer(fixtureChart(), ASOF, request);
    expect(request).toHaveBeenCalledTimes(12);
  });
  it('does not persist repeated or otherwise invalid content', async () => {
    const request = vi.fn(async (p: string) => { const r = reply(p); const d = fixtureDraft(packetOf(p)); d.limiting.text = d.supporting.text; r.choices[0].message.content = JSON.stringify(d); return r; });
    delivery.failAndRefundReportOrder.mockResolvedValue({ refunded: 299 });
    await fulfilReportOrder({ id: 'test-career', userId: 'test-only' } as any, 'Career', () => generateDeterministicCareer(fixtureChart(), ASOF, request));
    expect(delivery.setReportOrderContent).not.toHaveBeenCalled(); expect(delivery.failAndRefundReportOrder).toHaveBeenCalledTimes(1);
  });
  it('passes the validated assembled report through the existing delivery path', async () => {
    delivery.setReportOrderContent.mockResolvedValue({ id: 'test-career', status: 'ready' });
    await fulfilReportOrder({ id: 'test-career', userId: 'test-only' } as any, 'Career', () => generateDeterministicCareer(fixtureChart(), ASOF, async (p) => reply(p)));
    expect(delivery.setReportOrderContent).toHaveBeenCalledWith('test-career', expect.objectContaining({ sections: expect.arrayContaining([expect.objectContaining({ heading: 'Dasamsa (D10) Analysis' })]) }));
    expect(delivery.failAndRefundReportOrder).not.toHaveBeenCalled();
  });
  it('enforces six minutes and cancels even a provider adapter that never settles', async () => {
    vi.useFakeTimers(); let signal: AbortSignal | undefined;
    const request = vi.fn((_p, o) => { signal = o.signal; return new Promise<CareerCompletion>(() => {}); });
    const result = generateDeterministicCareer(fixtureChart(), ASOF, request);
    const assertion = expect(result).rejects.toThrow(/deadline/);
    await vi.advanceTimersByTimeAsync(CAREER_DEADLINE_MS); await assertion;
    expect(signal?.aborted).toBe(true); expect(request).toHaveBeenCalledTimes(3);
  });
  it('sets request-local transport retry and timeout options without changing shared clients', async () => {
    const create = vi.fn(async () => reply(careerDraftPrompt(buildCareerEvidence(fixtureChart(), ASOF).packets[0])));
    await careerRequester({ chat: { completions: { create } } } as any)('prompt', { signal: new AbortController().signal, maxTokens: 1400 });
    expect(create.mock.calls[0][1]).toMatchObject({ maxRetries: 0, timeout: 60_000 });
  });
});

describe('Concurrency-safe spending reservations', () => {
  it('atomically reserves before dispatch; parallel requests cannot oversubscribe', async () => {
    const ledger = new CareerSpending(30_000); let sent = 0;
    const outcomes = await Promise.allSettled(Array.from({ length: 3 }, async () => { const id = ledger.reserve('test', 1400); sent++; await Promise.resolve(); ledger.settle(id, { prompt_tokens: 1, completion_tokens: 1 }); }));
    expect(sent).toBe(2); expect(outcomes.filter((x) => x.status === 'rejected')).toHaveLength(1);
    expect(ledger.reserved).toBe(0); expect(ledger.spent).toBe(26);
  });
  it('retains maximum charge for unknown usage and settles known usage once', () => {
    const ledger = new CareerSpending(); const id = ledger.reserve('uncertain', 1400); const reserved = ledger.reserved;
    ledger.settle(id); ledger.settle(id, { prompt_tokens: 0, completion_tokens: 0 });
    expect(ledger.spent).toBe(reserved); expect(ledger.reserved).toBe(0);
  });
  it('stops dispatch if actual usage exceeds the estimate instead of hiding the overrun', () => {
    const ledger = new CareerSpending(); const id = ledger.reserve('test', 1400);
    ledger.settle(id, { prompt_tokens: 100_000, completion_tokens: 1000 });
    expect(ledger.spent).toBeGreaterThan(CAREER_BUDGET_MICRO_USD); expect(() => ledger.reserve('test', 1400)).toThrow(/ceiling/);
  });
  it('refuses oversized input before any provider request', async () => {
    const request = vi.fn();
    await expect(generateDeterministicCareer(fixtureChart(), ASOF, request, { ledger: new CareerSpending(1) })).rejects.toThrow(/ceiling/);
    expect(request).not.toHaveBeenCalled();
  });
  it('does not dispatch past $0.25 when every response lacks usage', async () => {
    const ledger = new CareerSpending();
    const request = vi.fn(async (p: string) => { const r = reply(p); delete r.usage; if ([3, 8].includes(packetOf(p).id)) r.choices[0].message.content = '{}'; return r; });
    await expect(generateDeterministicCareer(fixtureChart(), ASOF, request, { ledger })).rejects.toThrow(/ceiling/);
    expect(ledger.spent + ledger.reserved).toBeLessThanOrEqual(250_000);
    expect(request.mock.calls.length).toBeLessThan(12);
  });
  it('rejects attempts to override the report ceiling', () => {
    expect(() => new CareerSpending(250_001)).toThrow(/Invalid/);
    expect(() => new CareerSpending(Infinity)).toThrow(/Invalid/);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { CareerSpending, CAREER_BUDGET_MICRO_USD, CAREER_DEADLINE_MS, CAREER_OUTPUT_TOKENS, CAREER_CORRECTION_TOKENS, careerRequester, generateDeterministicCareer, type CareerCompletion } from '../../server/careerReportGeneration';
import { buildCareerReportFacts, CAREER_HEADINGS, type CareerReportFacts } from '../../server/careerReportEvidence';
import { careerSectionPrompt, slotProblems, checkSectionReply, parseSectionReply } from '../../server/careerReportRendering';
import { ASOF, fixtureChart } from '../fixtures/career-chart';
import { promptTarget, realisticRequester, replyFor } from '../fixtures/career-replies';

const delivery = vi.hoisted(() => ({ setReportOrderContent: vi.fn(), failAndRefundReportOrder: vi.fn(), createNotification: vi.fn() }));
vi.mock('../../server/storage', () => ({ storage: delivery }));
vi.mock('../../server/pushService', () => ({ sendPushToUser: vi.fn() }));
import { fulfilReportOrder } from '../../server/reportOrders';

const CHARTS = [['1985-03-22', '06:15', 28.6139, 77.209], ['1991-11-13', '12:30', 15.8497, 74.4977], ['2000-07-04', '18:45', 19.076, 72.8777]] as const;
const delhi = () => fixtureChart('1985-03-22', '06:15', 28.6139, 77.209);
const facts = (k = delhi()) => buildCareerReportFacts(k, ASOF);
const section = (e: CareerReportFacts, key: string) => e.sections.find((s) => s.key === key)!;
const fact = (e: CareerReportFacts, id: string) => e.sections.flatMap((s) => s.facts).find((f) => f.id === id)!;
const spy = (e: CareerReportFacts, edit?: Parameters<typeof realisticRequester>[1]) => vi.fn(realisticRequester(e, edit));
const targets = (e: CareerReportFacts, request: { mock: { calls: any[][] } }) => request.mock.calls.map((c) => { const t = promptTarget(e, c[0]); return t.correction ? `${t.section.key}:${t.correction.join(',')}` : t.section.key; });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('facts-first Career report: generation', () => {
  it.each(CHARTS)('writes all five sections in one parallel round for %s, every fact followed by its explanation', async (date, time, lat, lon) => {
    const k = fixtureChart(date, time, lat, lon); const e = facts(k); const request = spy(e); const metrics = vi.fn();
    const report = await generateDeterministicCareer(k, ASOF, request, { onMetrics: metrics });
    expect(report.sections.map((s) => s.heading)).toEqual(CAREER_HEADINGS);
    expect(targets(e, request).sort()).toEqual(['chart', 'current', 'guidance', 'overview', 'periods']);
    expect(metrics).toHaveBeenCalledWith(expect.objectContaining({ calls: 5, corrections: 0, firstPassAccepted: 5, optionalDropped: 0 }));
    for (const s of e.sections) {
      const body = report.sections.find((x) => x.heading === s.heading)!.body;
      for (const f of s.facts) expect(body).toContain(f.text);
      expect(body).toContain('What this means for you');
    }
    expect(report.sections[4].body).toMatch(/Next steps\n1\. .+\n2\. .+\n3\. .+/);
    expect(report.summary).toContain(e.workStyleSentence);
  });
  it('sends each section only its own facts, the fixed work-style conclusion and the weak fields', () => {
    const e = facts(fixtureChart()); const guidance = section(e, 'guidance'); const prompt = careerSectionPrompt(e, guidance);
    const sent = JSON.parse(prompt.split('\nFACTS\n')[1]) as Array<{ id: string }>;
    expect(sent.map((f) => f.id)).toEqual(guidance.facts.map((f) => f.id));
    expect(prompt).toContain(e.workStyleSentence); expect(prompt).toContain('Never recommend these weakly supported fields: advisory and consulting roles');
    expect(prompt).toContain('"steps": [');
    expect(careerSectionPrompt(e, section(e, 'overview'))).not.toContain('"steps"');
  });
  it('refuses an approximate birth time before any request', async () => {
    const { computeCanonicalChart } = await import('../../server/astroEngine/canonical/compute');
    const { resolveBirthWithCoordinates } = await import('../../server/astroEngine/birthResolver');
    const canonical = computeCanonicalChart(resolveBirthWithCoordinates({ date: '1985-03-22', time: '06:15', latitude: 28.6139, longitude: 77.209, timeAccuracy: 'approximate' }));
    const request = vi.fn();
    await expect(generateDeterministicCareer({ chartData: { canonical } }, ASOF, request)).rejects.toThrow(/exact birth time/);
    expect(request).not.toHaveBeenCalled();
  });
});

describe('facts-first Career report: the model cannot add chart facts', () => {
  const e = facts();
  const check = (id: string, text: string) => slotProblems(text, 'explanation', [fact(e, id)], e);
  const base = 'In practical terms, this points you towards work where steady effort is noticed and responsibility grows in measured steps over time.';
  it.each([
    ['chart.tenthLord', `${base} Jupiter in Leo would change that.`, /names Leo/],
    ['chart.d10Tenth', `${base} Mars adds drive to the picture.`, /names Mars/],
    ['period.Antardasha.Saturn.2026-07-20', `${base} Expect a shift in 2031.`, /mentions 2031/],
    ['current.mahadasha', `${base} It peaks in March 2030 for you.`, /mentions 2030|March 2030/],
    ['chart.tenth', `${base} Gaja Kesari Yoga strengthens it further.`, /names Gaja Kesari Yoga/],
    ['chart.tenthLord', `${base} Jupiter sits at 12 degrees.`, /degrees/],
    ['chart.tenthLord', `${base} The 7th house adds partnership themes.`, /7th/],
    ['field.business', `${base} Mars' favourable placement in Moolatrikona and the 11th house gives drive.`, /Mars is in house 2 in D1, not house 11/],
    ['overview.fields', `${base} You will be promoted within the year.`, /promises an outcome/],
    ['chart.tenthLord', `${base} Wearing a yellow sapphire would help.`, /suggests a remedy/],
    ['overview.workStyle', `${base} The chart favours employment over anything else.`, /contradicts the work-style conclusion/],
    ['overview.workStyle', `${base} Your workStyle is mixed.`, /internal term/],
  ])('rejects an explanation of %s that adds: %s', (id, text, problem) => {
    expect(check(id, text).join(' ')).toMatch(problem);
  });
  it('rejects recommending a weakly supported field anywhere', () => {
    const b = facts(fixtureChart()); const guidance = section(b, 'guidance');
    expect(slotProblems(`${base} Teaching and consulting are an ideal choice for you, and you can build on that with patience and a clear plan for each stage ahead.`, 'synthesis', guidance.facts, b).join(' ')).toMatch(/recommends advisory and consulting roles/);
  });
  // Sentences the old validator rejected on live runs although they were correct.
  it.each([
    ['overview.workStyle', 'This supports an adaptable career path that can shift between structured employment roles and more independent, entrepreneurial pursuits, so you can keep a stable base while testing ventures of your own.'],
    ['period.Antardasha.Mercury.2029-09-19', 'This sub-period could present challenges in communication and analytical tasks, so plan important negotiations carefully and leave room for review before you commit to them.'],
    ['chart.d10Tenth', 'Mercury, which rules this house, sits in a hidden part of the D10, which can mean your best professional work happens behind the scenes before it is recognised.'],
  ])('accepts a correct explanation of %s that the old checks rejected', (id, text) => {
    expect(check(id, text)).toEqual([]);
  });
});

describe('facts-first Career report: coverage and correction', () => {
  it('drops an invalid optional explanation silently, keeping its fact, with no extra call', async () => {
    const k = delhi(); const e = facts(k);
    const request = spy(e, (r, s) => { if (s.key === 'chart') r.explanations['chart.lagna'] += ' Mars adds drive here.'; });
    const metrics = vi.fn();
    const report = await generateDeterministicCareer(k, ASOF, request, { onMetrics: metrics });
    expect(request).toHaveBeenCalledTimes(5); expect(metrics).toHaveBeenCalledWith(expect.objectContaining({ optionalDropped: 1, corrections: 0 }));
    const body = report.sections[2].body;
    expect(body).toContain(fact(e, 'chart.lagna').text + '\n\n'); expect(body).not.toContain('Mars adds drive');
  });
  it('corrects only the failed required explanation, keeping every accepted slot', async () => {
    const k = delhi(); const e = facts(k);
    const request = spy(e, (r, s, attempt) => { if (s.key === 'current' && attempt === 1) r.explanations['current.antardasha'] += ' It ends in 2031.'; });
    const report = await generateDeterministicCareer(k, ASOF, request);
    expect(targets(e, request).slice(5)).toEqual(['current:current.antardasha']);
    const correction = request.mock.calls[5][0];
    expect(correction).toContain('mentions 2031');
    expect(JSON.parse(correction.split('\nFACTS\n')[1].split('\nCORRECTION\n')[0]).map((f: any) => f.id)).toEqual(['current.antardasha']);
    expect(report.sections[3].body).not.toContain('2031');
  });
  it('never omits a required explanation: missing in the reply, it is requested again', async () => {
    const k = delhi(); const e = facts(k);
    const request = spy(e, (r, s, attempt) => { if (s.key === 'periods' && attempt === 1) delete r.explanations['period.Antardasha.Saturn.2026-07-20']; });
    await generateDeterministicCareer(k, ASOF, request);
    expect(targets(e, request).slice(5)).toEqual(['periods:period.Antardasha.Saturn.2026-07-20']);
  });
  it('fails, and refunds through the order path, when a required explanation is still invalid after its correction', async () => {
    const k = delhi(); const e = facts(k);
    const bad = (r: any, s: any) => { if (s.key === 'chart' && r.explanations['chart.tenth']) r.explanations['chart.tenth'] += ' Venus shapes this house.'; };
    const request = spy(e, bad);
    delivery.failAndRefundReportOrder.mockResolvedValue({ refunded: 299 }); delivery.createNotification.mockResolvedValue({});
    await fulfilReportOrder({ id: 'test-only', userId: 'test-user' } as any, 'Career', () => generateDeterministicCareer(k, ASOF, request));
    expect(request).toHaveBeenCalledTimes(6);
    expect(delivery.setReportOrderContent).not.toHaveBeenCalled(); expect(delivery.failAndRefundReportOrder).toHaveBeenCalledTimes(1);
    await expect(generateDeterministicCareer(k, ASOF, spy(e, bad))).rejects.toThrow(/Your Birth Chart: chart.tenth names Venus/);
  });
  it('requires at least three valid next steps citing this section\'s facts', async () => {
    const k = delhi(); const e = facts(k);
    const request = spy(e, (r, s, attempt) => { if (s.key === 'guidance' && attempt === 1) { r.steps[0].factIds = ['chart.tenth']; r.steps[1].factIds = []; } });
    const report = await generateDeterministicCareer(k, ASOF, request);
    expect(targets(e, request).slice(5)).toEqual(['guidance:steps']);
    expect(request.mock.calls[5][0]).toMatch(/cites an id that is not in this section|cites no fact/);
    expect(report.sections[4].body.match(/^\d\. /gm)).toHaveLength(3);
  });
  it('re-requests a whole section once when its response is truncated or malformed, and fails if it is again', async () => {
    const k = delhi(); const e = facts(k); let n = 0;
    const base = realisticRequester(e);
    const request = vi.fn(async (p: string) => { const r = await base(p); if (promptTarget(e, p).section.key === 'overview' && n++ === 0) r.choices[0].finish_reason = 'length'; return r; });
    const report = await generateDeterministicCareer(k, ASOF, request);
    expect(report.sections).toHaveLength(5); expect(targets(e, request).slice(5)).toEqual(['overview']);
    const broken = vi.fn(async (p: string) => { const r = await base(p); if (promptTarget(e, p).section.key === 'overview') r.choices[0].message.content = '{'; return r; });
    await expect(generateDeterministicCareer(k, ASOF, broken)).rejects.toThrow(/Career Overview: response invalid-json/);
    expect(broken).toHaveBeenCalledTimes(6);
  });
  it('accepts the reply shapes the model has produced: explanation arrays and paragraph arrays', () => {
    const e = facts(); const s = section(e, 'current'); const reply = replyFor(e, s);
    const raw = { explanations: Object.entries(reply.explanations).map(([factId, text]) => ({ factId, text: [text] })), synthesis: [reply.synthesis!] };
    const parsed = parseSectionReply(JSON.stringify(raw));
    expect(checkSectionReply(s, parsed.reply!, e).required.size).toBe(0);
  });
  it('removes a sentence repeated in a later section, correcting it when the slot is required', async () => {
    const k = delhi(); const e = facts(k);
    const copied = 'Plan your larger commitments around the steadier phases and use the harder ones to strengthen your footing.';
    const request = spy(e, (r, s, attempt) => { if (attempt === 1 && (s.key === 'overview' || s.key === 'current')) r.synthesis += ` ${copied}`; });
    const report = await generateDeterministicCareer(k, ASOF, request);
    expect(report.sections.filter((x) => x.body.includes(copied))).toHaveLength(1);
    expect(targets(e, request).slice(5)).toEqual(['current:synthesis']);
  });
});

describe('facts-first Career report: limits and delivery', () => {
  it('fails closed on a transport error and refunds through the existing path', async () => {
    const request = vi.fn(async () => { throw new Error('test connection failure'); });
    delivery.failAndRefundReportOrder.mockResolvedValue({ refunded: 299 }); delivery.createNotification.mockResolvedValue({});
    await fulfilReportOrder({ id: 'test-only', userId: 'test-user' } as any, 'Career', () => generateDeterministicCareer(delhi(), ASOF, request));
    expect(delivery.setReportOrderContent).not.toHaveBeenCalled(); expect(delivery.failAndRefundReportOrder).toHaveBeenCalledTimes(1);
  });
  it('delivers a validated report through the existing path', async () => {
    delivery.setReportOrderContent.mockResolvedValue({ id: 'test-only' });
    await fulfilReportOrder({ id: 'test-only', userId: 'test-user' } as any, 'Career', () => generateDeterministicCareer(delhi(), ASOF, realisticRequester(facts())));
    const content = delivery.setReportOrderContent.mock.calls[0][1];
    expect(content.sections.map((s: any) => s.heading)).toEqual(CAREER_HEADINGS); expect(content.dashaTimeline.length).toBeGreaterThan(0);
    expect(delivery.failAndRefundReportOrder).not.toHaveBeenCalled();
  });
  it('aborts at six minutes even if transport never settles', async () => {
    vi.useFakeTimers(); const signals: AbortSignal[] = [];
    const request = vi.fn((_p: string, o: any) => { signals.push(o.signal); return new Promise<CareerCompletion>(() => {}); });
    const result = generateDeterministicCareer(delhi(), ASOF, request); const assertion = expect(result).rejects.toThrow(/deadline/);
    await vi.advanceTimersByTimeAsync(CAREER_DEADLINE_MS); await assertion;
    expect(request).toHaveBeenCalledTimes(5); expect(signals.every((s) => s.aborted)).toBe(true);
  });
  it.each(CHARTS)('stays under $0.25 with every section re-requested whole and no usage reported (%s)', async (date, time, lat, lon) => {
    const k = fixtureChart(date, time, lat, lon); const e = facts(k); const ledger = new CareerSpending();
    const base = realisticRequester(e); const seen = new Set<string>();
    const request = vi.fn(async (p: string) => { const r = await base(p); const key = promptTarget(e, p).section.key; if (!seen.has(key)) { seen.add(key); r.choices[0].finish_reason = 'length'; } delete r.usage; return r; });
    const report = await generateDeterministicCareer(k, ASOF, request, { ledger });
    expect(report.sections).toHaveLength(5); expect(request).toHaveBeenCalledTimes(10);
    expect(ledger.spent).toBeLessThanOrEqual(CAREER_BUDGET_MICRO_USD); expect(ledger.reserved).toBe(0);
  });
  it('reserves before dispatch, keeps missing usage at the reservation and refuses overspending', async () => {
    const l = new CareerSpending(); const id = l.reserve('prompt', CAREER_OUTPUT_TOKENS); const reserved = l.reserved; l.settle(id); l.settle(id);
    expect(l.spent).toBe(reserved);
    const request = vi.fn();
    await expect(generateDeterministicCareer(delhi(), ASOF, request, { ledger: new CareerSpending(1) })).rejects.toThrow(/ceiling/); expect(request).not.toHaveBeenCalled();
    expect(() => new CareerSpending(250001)).toThrow(); expect(() => l.reserve('prompt', CAREER_OUTPUT_TOKENS + 1)).toThrow(/allowance/);
    expect(CAREER_CORRECTION_TOKENS).toBeLessThan(CAREER_OUTPUT_TOKENS);
  });
  it('uses explicit output limits and disables hidden SDK retries', async () => {
    const create = vi.fn(async () => ({})); await careerRequester({ chat: { completions: { create } } } as any)('prompt', { signal: new AbortController().signal, maxTokens: CAREER_OUTPUT_TOKENS });
    expect(create.mock.calls[0][0].max_tokens).toBe(CAREER_OUTPUT_TOKENS); expect(create.mock.calls[0][1]).toMatchObject({ maxRetries: 0, timeout: 120000 });
  });
  it('reports each section attempt to the evaluation hook, which the order path never passes', async () => {
    const attempts: any[] = []; const e = facts();
    await generateDeterministicCareer(delhi(), ASOF, realisticRequester(e, (r, s) => { if (s.key === 'chart') r.explanations['chart.lagna'] += ' Mars adds drive.'; }), { onSection: (a) => attempts.push(a) });
    expect(attempts).toHaveLength(5); expect(attempts.every((a) => a.accepted && a.content)).toBe(true);
    expect(attempts.find((a) => a.heading === 'Your Birth Chart').dropped[0]).toMatch(/^chart.lagna: names Mars/);
    expect(readFileSync(new URL('../../server/aiAstrologerService.ts', import.meta.url), 'utf8')).not.toMatch(/onSection/);
  });
});

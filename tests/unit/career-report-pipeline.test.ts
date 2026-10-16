import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { CareerSpending, CAREER_BUDGET_MICRO_USD, CAREER_DEADLINE_MS, CAREER_OUTPUT_TOKENS, CAREER_CORRECTION_TOKENS, careerRequester, generateDeterministicCareer, type CareerCompletion } from '../../server/careerReportGeneration';
import { buildCareerReportFacts, CAREER_HEADINGS, type CareerReportFacts } from '../../server/careerReportEvidence';
import { careerSectionPrompt, slotProblems, slotCheck, checkSectionReply, parseSectionReply } from '../../server/careerReportRendering';
import { ASOF, fixtureChart } from '../fixtures/career-chart';
import { promptTarget, realisticRequester, replyFor } from '../fixtures/career-replies';
import { LIVE } from '../fixtures/career-live-db644dd';

const delivery = vi.hoisted(() => ({ setReportOrderContent: vi.fn(), failAndRefundReportOrder: vi.fn(), createNotification: vi.fn() }));
vi.mock('../../server/storage', () => ({ storage: delivery }));
vi.mock('../../server/pushService', () => ({ sendPushToUser: vi.fn() }));
import { fulfilReportOrder } from '../../server/reportOrders';

const CHARTS = [['1985-03-22', '06:15', 28.6139, 77.209], ['1977-10-30', '10:25', 22.5726, 88.3639], ['2000-07-04', '18:45', 19.076, 72.8777]] as const;
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
    ['overview.fields', `${base} You will be promoted within the year.`, /states an outcome as certain/],
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

// Replays of the db644dd live report (synthetic Delhi chart): what its review found, with the model's own text.
describe('facts-first Career report: the db644dd review findings', () => {
  const e = facts();
  const check = (id: string, text: string) => slotProblems(text, 'explanation', [fact(e, id)], e);
  const guidance = section(e, 'guidance');

  it('false rejection fixed: "Mercury\'s role in your D10\'s 10th house" is lordship, not a placement', () => {
    expect(check('chart.yoga.1', LIVE.budhaAditya)).toEqual([]);
  });
  it('false rejection fixed: "use the current Saturn Antardasha … the Mercury Antardasha in 2029" claims only Saturn is running', () => {
    const [business, advisory] = LIVE.steps;
    expect(slotProblems(business.text, 'step', business.factIds.map((id) => fact(e, id)), e)).toEqual([]);
    // A step naming a year without citing the planning dates is still refused.
    expect(slotProblems(advisory.text, 'step', advisory.factIds.map((id) => fact(e, id)), e).join(' ')).toMatch(/mentions 2029/);
  });
  it('false rejection fixed: a house named in a D10 explanation is read in the D10', () => {
    const d10Fact = { id: 'chart.d10Lagna', required: true, explain: true, text: "In the D10 (Dasamsa), the divisional chart read for profession, the rising sign is Sagittarius. Its lord, Jupiter, is in Aquarius in the D10's 3rd house." };
    expect(slotProblems(LIVE.d10LagnaFirst, 'explanation', [{ ...d10Fact, chart: 'D10' as const }], e)).toEqual([]);
    expect(slotProblems(LIVE.d10LagnaFirst, 'explanation', [d10Fact], e).join(' ')).toMatch(/Jupiter is in house 11 in D1, not house 3/);
    // An explicit D1 claim inside a D10 explanation is still checked against the D1.
    expect(slotProblems('Jupiter in the 3rd house of your birth chart and D1 points to learning through effort in daily work and short projects.', 'explanation', [{ ...d10Fact, chart: 'D10' as const }], e).join(' ')).toMatch(/not house 3|not the 3rd/);
  });
  it('the 10th lord is named as such, so "the lord of your 10th house" is no longer refused', () => {
    expect(fact(e, 'chart.tenthLord').text).toMatch(/^The lord of your 10th house, Jupiter, is in Capricorn in your 11th house/);
    expect(check('chart.tenthLord', LIVE.tenthLordFirst).join(' ')).not.toMatch(/mentions the 10th/);
  });
  it('restating the fact just printed is recorded as advisory, not refused', () => {
    const c = slotCheck(LIVE.tenthLordDelivered, 'explanation', [fact(e, 'chart.tenthLord')], e);
    expect(c.advisories.join(' ')).toMatch(/restates the fact \(Capricorn, 11th house\)/); expect(c.problems.join(' ')).not.toMatch(/restates/);
    expect(check('chart.tenthLord', 'Its debilitation suggests you may need extra effort to gain recognition through networks and large teams, so build credibility through visible, well-documented results before seeking wider responsibility.')).toEqual([]);
  });
  it('never overstates strength: the Sun is only in a friendly sign; exalted Venus may be called strong', () => {
    expect(check('overview.strength', LIVE.overviewStrength).join(' ')).toMatch(/overstates Sun's strength \(friend's sign in the birth chart\)/);
    expect(fact(e, 'overview.strength').text).toContain('That is a moderate placement rather than a strong one');
    expect(check('current.mahadasha', 'Venus is strong here, so work that relies on taste, presentation and relationships may come more easily during this long period than work that depends on rigid procedure.')).toEqual([]);
  });
  it('tendencies, not certainties: outcome promises are refused, ordinary "will" is not', () => {
    expect(check('current.next', LIVE.currentNext).join(' ')).toMatch(/as certain/);
    expect(check('chart.yoga.3', LIVE.rajaYoga).join(' ')).toMatch(/as certain/);
    expect(check('overview.workStyle', LIVE.overviewSynthesis).join(' ')).toMatch(/as certain|stock phrase/);
    for (const ok of ['You will need to plan the change carefully, building skills and savings first, so that the move rests on evidence rather than hope or pressure from others.',
      'Small, steady experiments will tell you more than one bold leap, and this chart suits testing an idea alongside a stable base before committing fully to it.',
      'This period will likely bring more structure to your work, which can feel slow but tends to reward patience, careful records and steady delivery over quick wins.']) {
      expect(check('overview.workStyle', ok)).toEqual([]);
    }
  });
  it('refuses generic stock phrases', () => {
    expect(check('overview.strength', LIVE.overviewStrength).join(' ')).toMatch(/stock phrase/);
  });
  it('refuses drifting from the mixed work-style conclusion; field talk about business is not an arrangement', () => {
    expect(slotProblems(LIVE.guidanceSynthesis, 'synthesis', guidance.facts, e).join(' ')).toMatch(/contradicts the work-style conclusion/);
    expect(check('field.business', LIVE.businessField)).toEqual([]);
    expect(check('field.finance', LIVE.financeField)).toEqual([]);
  });
  it('requires a next step that acts on a well-supported field', () => {
    const only = { explanations: {}, synthesis: undefined, steps: LIVE.steps.filter((s) => s.factIds.every((id) => !['field.business', 'field.advisory', 'field.finance', 'field.communication'].includes(id))) } as any;
    expect(checkSectionReply(guidance, only, e, ['steps']).required.get('steps')!.join(' ')).toMatch(/no valid next step acts on a well-supported field/);
    expect(checkSectionReply(guidance, { explanations: {}, steps: LIVE.steps } as any, e, ['steps']).required.has('steps')).toBe(false);
  });
});

describe('facts-first Career report: the work style is explained once', () => {
  it('only Career Overview is asked to explain it; every section is told never to contradict it', () => {
    const e = facts();
    for (const s of e.sections) {
      const prompt = careerSectionPrompt(e, s);
      expect(prompt).toContain(`fixed: ${e.workStyleSentence}. Never contradict it.`);
      expect(prompt.includes('Career Overview explains it: do not restate it here.')).toBe(s.key !== 'overview');
      expect(prompt.includes('This section is the one place it is explained.')).toBe(s.key === 'overview');
      expect(prompt).toContain('"harness your potential"');
    }
  });
});

describe('facts-first Career report: fact wording from the review', () => {
  const e = facts(); const chartText = section(e, 'chart').facts.map((f) => f.text).join('\n');
  it('states a planet that rules the Lagna, the 10th and the D10 Lagna once', () => {
    expect(chartText.match(/is in Capricorn in your 11th house/g)).toHaveLength(1);
    expect(fact(e, 'chart.lagna').text).toBe('Your rising sign (Lagna) is Pisces. Its lord, Jupiter, also rules your 10th house of career, so how you present yourself and your career are governed by the same planet; its placement follows.');
    expect(fact(e, 'chart.d10Lagna').text).toContain('Its lord is again Jupiter, your 10th lord, whose D10 placement is given above.');
    expect(chartText.match(/in Aquarius in the 3rd house/g)).toHaveLength(1);
  });
  it('acknowledges every well-supported field before naming the strongest', () => {
    expect(fact(e, 'overview.fields').text).toBe('Four of the six professional fields assessed are well supported: business and entrepreneurship, finance and management, advisory and consulting roles and communication and public-facing professions. Of these, business and entrepreneurship and finance and management have the most in their favour and the least against them. Personalised Guidance compares all six.');
  });
  it('gives each section its own job and names what belongs elsewhere', () => {
    for (const s of e.sections) expect(s.purpose).toMatch(/^Job: /);
    expect(new Set(e.sections.map((s) => s.purpose)).size).toBe(5);
  });
});

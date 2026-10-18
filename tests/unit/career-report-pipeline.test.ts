/**
 * The facts-first Career Report pipeline with MOCKED model replies (tests/fixtures/career-premium-replies.ts):
 * generation, citation-scoped checks, correction, and the unchanged limits (deadline, ceiling, refund path).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { CareerSpending, CAREER_BUDGET_MICRO_USD, CAREER_DEADLINE_MS, CAREER_OUTPUT_TOKENS, CAREER_CORRECTION_TOKENS, careerRequester, generateDeterministicCareer, partTokens, repeatsCareerInterpretation, type CareerCompletion } from '../../server/careerReportGeneration';
import { buildCareerReportFacts, CAREER_HEADINGS, factsOf, type CareerReportFacts } from '../../server/careerReportEvidence';
import { CAREER_APPENDIX_HEADING, careerSectionPrompt, checkCitedText, checkSectionReply, citationProblems, parseSectionReply, slotCheck, slotProblems } from '../../server/careerReportRendering';
import { ASOF, fixtureChart, SYNTHETIC_CHARTS } from '../fixtures/career-chart';
import { mockedRequester, promptTarget, replyFor } from '../fixtures/career-premium-replies';

const delivery = vi.hoisted(() => ({ setReportOrderContent: vi.fn(), failAndRefundReportOrder: vi.fn(), createNotification: vi.fn() }));
vi.mock('../../server/storage', () => ({ storage: delivery }));
vi.mock('../../server/pushService', () => ({ sendPushToUser: vi.fn() }));
import { fulfilReportOrder } from '../../server/reportOrders';

const NAMES = Object.keys(SYNTHETIC_CHARTS) as Array<keyof typeof SYNTHETIC_CHARTS>;
const delhi = () => fixtureChart(...SYNTHETIC_CHARTS.delhi);
const facts = (k = delhi()) => buildCareerReportFacts(k, ASOF);
const part = (e: CareerReportFacts, key: string) => e.sections.find((s) => s.key === key)!;
const slot = (e: CareerReportFacts, id: string) => e.sections.flatMap((s) => s.slots).find((s) => s.id === id)!;
const byLabel = (e: CareerReportFacts, label: string) => e.ledger.items.find((x) => x.label === label)!.id;
const spy = (e: CareerReportFacts, edit?: Parameters<typeof mockedRequester>[1]) => vi.fn(mockedRequester(e, edit));
const targets = (e: CareerReportFacts, request: { mock: { calls: any[][] } }) => request.mock.calls.map((c) => { const t = promptTarget(e, c[0]); return t.correction ? `${t.section.key}:${t.correction.join(',')}` : t.section.key; });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('generation (mocked replies)', () => {
  it.each(NAMES)('five parts in one parallel round write seven sections, an appendix and a glossary (%s)', async (name) => {
    const k = fixtureChart(...SYNTHETIC_CHARTS[name]); const e = facts(k); const request = spy(e); const metrics = vi.fn();
    const report = await generateDeterministicCareer(k, ASOF, request, { onMetrics: metrics });
    expect(report.sections.map((s) => s.heading).slice(0, 8)).toEqual([...CAREER_HEADINGS, CAREER_APPENDIX_HEADING]);
    expect(targets(e, request).sort()).toEqual(['chart', 'fields', 'overview', 'strategy', 'timing']);
    expect(metrics).toHaveBeenCalledWith(expect.objectContaining({ calls: 5, corrections: 0, firstPassAccepted: 5, outcome: 'completed' }));
    const strategy = report.sections.find((s) => s.heading === 'Career Strategy')!.body;
    expect(strategy).toMatch(/Next steps\n1\. .+\n2\. .+\n3\. .+/);
    // Each field paragraph opens with its code-written name and reading, in the synthesis order.
    const fields = report.sections.find((s) => s.heading === 'Professional Field Comparison')!.body.split('\n\n');
    e.synthesis.order.forEach((id, i) => expect(fields[i].startsWith(e.synthesis.fields.find((f) => f.id === id)!.label)).toBe(true));
    // The appendix lists only evidence the paragraphs cite, and the method.
    const appendix = report.sections.find((s) => s.heading === CAREER_APPENDIX_HEADING)!.body;
    expect(appendix).toContain('How this report reads the chart');
    expect((report as any).careerAnalysis.fields.map((f: any) => f.id)).toEqual(e.synthesis.order);
  });

  it('every part receives the whole plan; a thesis it may not cite appears in one line only', () => {
    const e = facts();
    for (const s of e.sections) {
      const prompt = careerSectionPrompt(e, s);
      const plan = prompt.split('PLAN (shared; never contradict):\n')[1].split('\nEVIDENCE')[0].split('\n');
      expect(plan).toHaveLength(8);
      for (const id of Object.values(e.synthesis.theses)) {
        const cited = s.slots.some((x) => x.scope.includes(id)) || (s.steps && s.stepScope.includes(id));
        expect(prompt.includes(`${id}: `)).toBe(cited);
      }
      expect(prompt).toContain(`Fixed: ${e.workStyleSentence}.`);
      // Only the part's own evidence is listed.
      const listed = prompt.split('\nEVIDENCE')[1].split('\nWRITE, in order')[0].split('\n').slice(1).map((l) => l.split(' ')[0]);
      for (const id of listed) expect(s.slots.some((x) => x.scope.includes(id)) || s.stepScope.includes(id)).toBe(true);
    }
  });

  it('refuses an approximate birth time before any request', async () => {
    const { computeCanonicalChart } = await import('../../server/astroEngine/canonical/compute');
    const { resolveBirthWithCoordinates } = await import('../../server/astroEngine/birthResolver');
    const canonical = computeCanonicalChart(resolveBirthWithCoordinates({ date: '1985-03-22', time: '06:15', latitude: 28.6139, longitude: 77.209, timeAccuracy: 'approximate' }));
    const request = vi.fn();
    await expect(generateDeterministicCareer({ chartData: { canonical } }, ASOF, request)).rejects.toThrow(/exact birth time/);
    expect(request).not.toHaveBeenCalled();
  });

  it('accepts the reply shapes the model produces: slot objects, slot arrays, "paragraphs", "evidence" for cites', () => {
    const e = facts(); const s = part(e, 'timing'); const reply = replyFor(e, s);
    const asArray = { slots: Object.entries(reply.slots).map(([id, c]) => ({ id, text: [c.text], evidence: c.cites })) };
    expect(checkSectionReply(s, parseSectionReply(JSON.stringify(asArray)).reply!, e).required.size).toBe(0);
    expect(checkSectionReply(s, parseSectionReply(JSON.stringify({ paragraphs: reply.slots })).reply!, e).required.size).toBe(0);
  });
});

describe('every paragraph rests on the evidence it cites', () => {
  const e = facts();
  const s = slot(e, 'field.business');
  const check = (text: string, cites: string[], where = s) => checkCitedText(text, cites, 'paragraph', where.scope, where.mustCite, e).problems.join(' | ');
  const body = 'This field draws on a broad base of indications, and the balance between them decides how readily a venture of your own could carry responsibility, so test it on a small scale before committing more of your working time to it.';

  it('cites nothing, an unknown id, or an id outside its list: refused', () => {
    expect(check(body, [])).toMatch(/cites no evidence/);
    expect(check(body, ['F.business', 'E9999'])).toMatch(/E9999, which is not in the evidence/);
    const outside = e.ledger.items.find((x) => /^E\d+$/.test(x.id) && !s.scope.includes(x.id))!.id;
    expect(check(body, ['F.business', outside])).toMatch(/outside this paragraph's evidence/);
    expect(check(body, [s.scope.find((x) => x !== 'F.business')!])).toMatch(/must cite F\.business/);
  });

  it('names only what its citations state (and what a cited conclusion was built from)', () => {
    const named = 'Business and entrepreneurship may also draw a reflective, research-minded streak from Ketu, which suggests ventures built on specialist knowledge rather than broad sales, tested carefully before any larger commitment of time.';
    const business = e.synthesis.fields.find((f) => f.id === 'business')!;
    expect(business.counted.concat(business.links).some((id) => e.ledger.byId.get(id)!.planets.includes('Ketu'))).toBe(false);
    expect(check(named, ['F.business'])).toMatch(/names Ketu, which the cited evidence does not mention/);
    const ketu = e.ledger.planets.Ketu.capacity;
    expect(check(named, ['F.business', ketu], { ...s, scope: [...s.scope, ketu] })).not.toMatch(/names Ketu/);
    // Venus is in the evidence the business assessment was built from, so citing the assessment allows it.
    expect(check(named.replace('Ketu', 'Venus'), ['F.business'])).not.toMatch(/names Venus/);
  });

  it('a sentence joining the birth chart and the D10 cites both; a D1–D10 relation counts as both', () => {
    const r = slot(e, 'd1d10.2'); // Mercury, the D10's 10th lord
    const text = 'In the birth chart Mercury sits in your 1st house, yet in the D10 it falls in the 8th house, so the visible role and the professional reality may pull apart until procedures are settled and expectations are written down.';
    expect(checkCitedText(text, [r.mustCite[0]], 'paragraph', r.scope, r.mustCite, e).problems.join(' ')).not.toMatch(/without citing evidence from both/);
    const d10Only = e.ledger.planets.Mercury.d10House!;
    expect(checkCitedText(text, [d10Only], 'paragraph', [d10Only], [], e).problems.join(' ')).toMatch(/relates the birth chart and the D10 without citing evidence from both/);
  });

  it('a comparison of two fields cites both assessments; one field with one citation is fine', () => {
    const c = slot(e, 'fields.comparison');
    const compare = 'Communication and public-facing professions and business and entrepreneurship share the leading reading, while finance trails because its 2nd house is weaker, which is why the first two deserve the first trials of your time.';
    expect(checkCitedText(compare, ['T.fields'], 'paragraph', c.scope, c.mustCite, e).problems.join(' ')).not.toMatch(/compares fields without/);
    expect(checkCitedText(compare, ['F.business'], 'paragraph', [...c.scope, 'F.business'], [], e).problems.join(' ')).toMatch(/compares fields without citing the assessment of (?:communication|finance)/);
  });

  it.each(['summary.now', 'timing.mahadasha', 'timing.antardasha', 'timing.next'])(
    '%s may name government and administration as period emphases without pretending to compare their support',
    (id) => {
      const s = slot(e, id);
      const text = 'This period brings government and administration into focus together, so both areas may become more visible in the work available to you.';
      expect(citationProblems(text, s.mustCite, s.scope, s.mustCite, e).join(' ')).not.toMatch(/compares fields/);
    },
  );

  it('accepts a supported field comparison and rejects an unsupported timing comparison with actionable guidance', () => {
    const text = 'Administration ranks ahead of government because its assessment has the firmer balance.';
    const comparison = slot(e, 'fields.comparison');
    expect(citationProblems(text, ['F.administration', 'F.government'], comparison.scope, [], e).join(' ')).not.toMatch(/compares fields/);
    const timing = slot(e, 'timing.antardasha');
    expect(citationProblems(text, timing.mustCite, timing.scope, timing.mustCite, e).join(' ')).toMatch(/outside this paragraph's evidence; describe only which fields the period emphasises/);
  });

  it('combining two planets on one citation is refused; a single-fact paragraph on one citation passes the citation rule', () => {
    const one = e.ledger.planets.Jupiter.d1!;
    const single = 'Jupiter is debilitated in Capricorn, which weakens what it can carry for you at work, so roles that lean on its themes of guidance and judgement may need more support and slower build-up than you would like.';
    const joined = `${single} Whereas Saturn steadies it.`;
    expect(checkCitedText(single, [one], 'paragraph', [one], [], e).problems.join(' ')).not.toMatch(/cites one item/);
    expect(checkCitedText(joined, [one], 'paragraph', [one], [], e).problems.join(' ')).toMatch(/combines or compares evidence but cites one item/);
  });

  it('never writes an id into the prose', () => {
    expect(check(`${body} See F.business and E12.`, ['F.business'])).toMatch(/evidence id in the prose/);
  });

  it('judges a strength claim in the chart the sentence names', () => {
    const r = slot(e, 'd1d10.1');
    // Venus: exalted in D1, enemy's sign in the D10.
    const venus = [e.ledger.planets.Venus.d1!, e.ledger.planets.Venus.d10Dignity!, e.ledger.planets.Venus.d10House!];
    const facts = factsOf(e, venus);
    expect(slotCheck('In the birth chart Venus is strong, which may lend polish and ease with people to the way you present your work to colleagues and clients.', 'paragraph', facts, e).problems.join(' ')).not.toMatch(/overstates/);
    expect(slotCheck('In the D10 Venus is strong, which may lend polish and ease with people to the way you present your work to colleagues and clients.', 'paragraph', facts, e).problems.join(' ')).toMatch(/overstates Venus's strength \(enemy's sign in the D10\)/);
    void r;
  });
});

describe('coverage and correction', () => {
  it('corrects all four reported out-of-scope field comparisons without another call or broader evidence', async () => {
    const k = delhi(); const e = facts(k);
    const affected = new Set(['summary.now', 'timing.mahadasha', 'timing.antardasha', 'timing.next']);
    const request = spy(e, (r, _s, attempt) => {
      if (attempt !== 1) return;
      for (const id of affected) if (r.slots[id]) r.slots[id].text += ' Administration ranks ahead of government during this period.';
    });
    const report = await generateDeterministicCareer(k, ASOF, request);
    expect(report.sections).toHaveLength(9);
    expect(targets(e, request).slice(5).sort()).toEqual(['overview:summary.now', 'timing:timing.mahadasha,timing.antardasha,timing.next']);
    const corrections = request.mock.calls.slice(5).map((call) => call[0]);
    expect(corrections.every((prompt) => prompt.includes("outside this paragraph's evidence"))).toBe(true);
    expect(corrections.every((prompt) => prompt.includes('remove the support/rank comparison'))).toBe(true);
    expect(request).toHaveBeenCalledTimes(7);
  });

  it('corrects only the failed paragraph, keeping every accepted one', async () => {
    const k = delhi(); const e = facts(k);
    const request = spy(e, (r, s, attempt) => { if (s.key === 'timing' && attempt === 1) r.slots['timing.antardasha'].text += ' It ends in 2031.'; });
    const report = await generateDeterministicCareer(k, ASOF, request);
    expect(targets(e, request).slice(5)).toEqual(['timing:timing.antardasha']);
    expect(request.mock.calls[5][0]).toContain('mentions 2031');
    expect(report.sections.find((s) => s.heading === 'Career Timing')!.body).not.toContain('2031');
  });

  it('a missing paragraph is requested again', async () => {
    const k = delhi(); const e = facts(k);
    const request = spy(e, (r, s, attempt) => { if (s.key === 'fields' && attempt === 1) delete r.slots['field.finance']; });
    await generateDeterministicCareer(k, ASOF, request);
    expect(targets(e, request).slice(5)).toEqual(['fields:field.finance']);
  });

  it('fails, and refunds through the order path, when a paragraph is still invalid after both rounds; the reason carries no chart fact', async () => {
    const k = delhi(); const e = facts(k);
    const bad = (r: any, s: any) => { if (s.key === 'chart' && r.slots.strengths) r.slots.strengths.text += ' Libra shapes this house.'; };
    const request = spy(e, bad);
    delivery.failAndRefundReportOrder.mockResolvedValue({ refunded: 299 }); delivery.createNotification.mockResolvedValue({});
    await fulfilReportOrder({ id: 'test-only', userId: 'test-user' } as any, 'Career', () => generateDeterministicCareer(k, ASOF, request));
    expect(request).toHaveBeenCalledTimes(7);
    expect(delivery.setReportOrderContent).not.toHaveBeenCalled(); expect(delivery.failAndRefundReportOrder).toHaveBeenCalledTimes(1);
    const err = await generateDeterministicCareer(k, ASOF, spy(e, bad)).catch((x) => x as Error);
    expect(err.message).toMatch(/after 2 correction rounds\. Strengths and Challenges \+ D1 and D10 Analysis: strengths names/);
    expect(err.message).not.toMatch(/Libra/);
  });

  it('requires at least three valid next steps, one acting on a best-supported field', async () => {
    const k = delhi(); const e = facts(k);
    const request = spy(e, (r, s, attempt) => { if (s.key === 'strategy' && attempt === 1) { r.steps[0].cites = ['E9999']; r.steps[1].cites = []; } });
    const report = await generateDeterministicCareer(k, ASOF, request);
    expect(targets(e, request).slice(5)).toEqual(['strategy:steps']);
    expect(report.sections.find((s) => s.heading === 'Career Strategy')!.body.match(/^\d\. /gm)).toHaveLength(3);
    const strategy = part(e, 'strategy');
    const weakOnly = { slots: {}, steps: [0, 1, 2].map(() => ({ cites: ['T.timing'], text: 'Within the next month, list the commitments that end with the running sub-period and decide which of them to finish before the next one begins.' })) };
    expect(checkSectionReply(strategy, weakOnly, e, ['steps']).required.get('steps')!.join(' ')).toMatch(/no valid next step acts on a well-supported field/);
  });

  it('retries a truncated or malformed response before judging it, and fails if it stays unreadable', async () => {
    const k = delhi(); const e = facts(k); let n = 0;
    const base = mockedRequester(e);
    const request = vi.fn(async (p: string) => { const r = await base(p); if (promptTarget(e, p).section.key === 'overview' && n++ === 0) r.choices[0].finish_reason = 'length'; return r; });
    const report = await generateDeterministicCareer(k, ASOF, request);
    expect(report.sections.length).toBeGreaterThanOrEqual(8); expect(targets(e, request).slice(5)).toEqual(['overview']);
    const broken = vi.fn(async (p: string) => { const r = await base(p); if (promptTarget(e, p).section.key === 'overview') r.choices[0].message.content = '{'; return r; });
    await expect(generateDeterministicCareer(k, ASOF, broken)).rejects.toThrow(/Executive Career Summary \+ Professional Identity: response invalid-json/);
    expect(broken).toHaveBeenCalledTimes(10);
  });

  it('removes a sentence repeated in a later section, correcting it when the paragraph is required', async () => {
    const k = delhi(); const e = facts(k);
    const copied = 'Plan your larger commitments around the steadier phases and use the harder ones to strengthen your footing.';
    const request = spy(e, (r, s, attempt) => { if (attempt === 1 && s.key === 'overview') r.slots['identity.arrangement'].text += ` ${copied}`; if (attempt === 1 && s.key === 'timing') r.slots['timing.shift'].text += ` ${copied}`; });
    const report = await generateDeterministicCareer(k, ASOF, request);
    expect(report.sections.filter((x) => x.body.includes(copied))).toHaveLength(1);
    expect(targets(e, request).slice(5)).toEqual(['timing:timing.shift']);
  });

  it('recognises a close paraphrase of the same planet-specific interpretation', () => {
    expect(repeatsCareerInterpretation(
      'Saturn asks for patience, discipline and steady perseverance when professional progress is slow.',
      'When professional progress is slow, Saturn calls for steady discipline, patience and perseverance in your work.',
    )).toBe(true);
    expect(repeatsCareerInterpretation(
      'Saturn asks for patience, discipline and steady perseverance when professional progress is slow.',
      'Venus asks for patience, discipline and steady perseverance when professional progress is slow.',
    )).toBe(false);
  });
});

describe('the shared text checks still apply to every paragraph', () => {
  const e = facts();
  const timing = factsOf(e, [...slot(e, 'timing.antardasha').scope, ...slot(e, 'timing.next').scope]);
  it('a running period is never "upcoming"', () => {
    expect(slotProblems('The upcoming Saturn period may ask for steadier routines and careful records, so finish open projects and keep your commitments realistic while it lasts.', 'paragraph', timing, e).join(' ')).toMatch(/calls the Saturn Antardasha upcoming, but it is running now/);
  });
  it('tendencies, not certainties; no remedies; no stock phrases; no generic advice', () => {
    const base = 'The Saturn sub-period can reward careful, well-documented work, which suggests building a record of finished tasks before asking for wider responsibility.';
    expect(slotProblems(`${base} You will be promoted within the year.`, 'paragraph', timing, e).join(' ')).toMatch(/as certain/);
    expect(slotProblems(`${base} Wearing a blue sapphire would help.`, 'paragraph', timing, e).join(' ')).toMatch(/remedy/);
    expect(slotProblems(`${base} Unlock your full potential.`, 'paragraph', timing, e).join(' ')).toMatch(/stock phrase/);
    expect(slotProblems(`${base} Stay adaptable.`, 'paragraph', timing, e).join(' ')).toMatch(/generic advice/);
    expect(slotProblems(base + ' You will need to plan the change carefully, building skills first.', 'paragraph', timing, e).join(' ')).not.toMatch(/as certain/);
  });
  it('the work-style conclusion and the weakly supported fields hold in every paragraph', () => {
    const k = fixtureChart(...SYNTHETIC_CHARTS.kolkata); const kol = facts(k);
    expect(kol.workStyle).toBe('unresolved'); expect(kol.weakFields).toContain('advisory');
    const any = factsOf(kol, [kol.synthesis.theses.fields, kol.synthesis.theses.arrangement]);
    expect(slotProblems('Your chart favours employment within an organisation, so a salaried role is the natural base, and the evidence for it is steadier than anything else in the reading here.', 'paragraph', any, kol).join(' ')).toMatch(/contradicts the work-style conclusion/);
    expect(slotProblems('Advisory and consulting roles are an ideal choice for you, and you can pursue them through a defined client project with clear terms and measured results over a full season.', 'paragraph', any, kol).join(' ')).toMatch(/recommends advisory and consulting roles, which is weakly supported/);
  });
});

describe('limits and delivery (unchanged)', () => {
  it('fails closed on a transport error and refunds through the existing path', async () => {
    const request = vi.fn(async () => { throw new Error('test connection failure'); });
    delivery.failAndRefundReportOrder.mockResolvedValue({ refunded: 299 }); delivery.createNotification.mockResolvedValue({});
    await fulfilReportOrder({ id: 'test-only', userId: 'test-user' } as any, 'Career', () => generateDeterministicCareer(delhi(), ASOF, request));
    expect(delivery.setReportOrderContent).not.toHaveBeenCalled(); expect(delivery.failAndRefundReportOrder).toHaveBeenCalledTimes(1);
  });
  it('delivers a validated report through the existing path', async () => {
    delivery.setReportOrderContent.mockResolvedValue({ id: 'test-only' });
    await fulfilReportOrder({ id: 'test-only', userId: 'test-user' } as any, 'Career', () => generateDeterministicCareer(delhi(), ASOF, mockedRequester(facts())));
    const content = delivery.setReportOrderContent.mock.calls[0][1];
    expect(content.sections.map((s: any) => s.heading).slice(0, 8)).toEqual([...CAREER_HEADINGS, CAREER_APPENDIX_HEADING]); expect(content.dashaTimeline.length).toBeGreaterThan(0);
    expect(delivery.failAndRefundReportOrder).not.toHaveBeenCalled();
  });
  it('aborts at six minutes even if transport never settles', async () => {
    vi.useFakeTimers(); const signals: AbortSignal[] = [];
    const request = vi.fn((_p: string, o: any) => { signals.push(o.signal); return new Promise<CareerCompletion>(() => {}); });
    const result = generateDeterministicCareer(delhi(), ASOF, request); const assertion = expect(result).rejects.toThrow(/deadline/);
    await vi.advanceTimersByTimeAsync(CAREER_DEADLINE_MS); await assertion;
    expect(request).toHaveBeenCalledTimes(5); expect(signals.every((s) => s.aborted)).toBe(true);
  });
  it.each(NAMES)('stays under $0.25 with every part re-requested whole and no usage reported (%s)', async (name) => {
    const k = fixtureChart(...SYNTHETIC_CHARTS[name]); const e = facts(k); const ledger = new CareerSpending();
    const base = mockedRequester(e); const seen = new Set<string>();
    const request = vi.fn(async (p: string) => { const r = await base(p); const key = promptTarget(e, p).section.key; if (!seen.has(key)) { seen.add(key); r.choices[0].finish_reason = 'length'; } delete r.usage; return r; });
    const report = await generateDeterministicCareer(k, ASOF, request, { ledger });
    expect(report.sections.length).toBeGreaterThanOrEqual(8); expect(request).toHaveBeenCalledTimes(10);
    expect(ledger.spent).toBeLessThanOrEqual(CAREER_BUDGET_MICRO_USD); expect(ledger.reserved).toBe(0);
  });
  // Every retry and correction path, charged at its reservation (no usage reported): never above the ceiling,
  // nothing left reserved; what the ceiling cannot admit fails closed (and is refunded by the order path).
  it.each([
    ['one transport retry per part', { transport: 1 }, true],
    ['every paragraph invalid once', { invalid: 1 }, true],
    ['two transport retries and a format retry per part', { transport: 2, truncate: 1 }, false],
    ['every paragraph invalid twice', { invalid: 2 }, false],
    ['every reply truncated', { truncate: 99 }, false],
    ['every request failing with 503', { transport: 99 }, false],
  ] as const)('spending under failure: %s', async (_label, mode: { transport?: number; truncate?: number; invalid?: number }, completes) => {
    const k = delhi(); const e = facts(k); const ledger = new CareerSpending(); const tries = new Map<string, number>();
    const base = mockedRequester(e, (r, _s, attempt) => { if (attempt <= (mode.invalid ?? 0)) for (const v of Object.values(r.slots)) v.text += ' This changes in 2091.'; });
    const request = vi.fn(async (p: string) => {
      const key = promptTarget(e, p).section.key; const n = (tries.get(key) ?? 0) + 1; tries.set(key, n);
      if (n <= (mode.transport ?? 0)) throw Object.assign(new Error('test 503'), { status: 503 });
      const r = await base(p); if (n - (mode.transport ?? 0) <= (mode.truncate ?? 0)) r.choices[0].finish_reason = 'length';
      delete r.usage; return r;
    });
    const ok = await generateDeterministicCareer(k, ASOF, request, { ledger, retryDelaysMs: [0, 0] }).then(() => true, (err) => { expect(String(err.message)).toMatch(/ceiling|transport/); return false; });
    expect(ok).toBe(completes);
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
  it('asks each part for no more output than its paragraphs can need, never above the ceiling', async () => {
    const e = facts(); const sizes: number[] = [];
    await generateDeterministicCareer(delhi(), ASOF, async (p, o) => { sizes.push(o.maxTokens); return mockedRequester(e)(p); });
    expect(sizes.sort((a, b) => a - b)).toEqual(e.sections.map((s) => partTokens(s)).sort((a, b) => a - b));
    for (const s of e.sections) expect(partTokens(s)).toBeLessThanOrEqual(CAREER_OUTPUT_TOKENS);
    expect(partTokens(part(e, 'fields'))).toBe(CAREER_OUTPUT_TOKENS);
  });
  it('uses explicit output limits and disables hidden SDK retries', async () => {
    const create = vi.fn(async () => ({})); await careerRequester({ chat: { completions: { create } } } as any)('prompt', { signal: new AbortController().signal, maxTokens: CAREER_OUTPUT_TOKENS });
    expect(create.mock.calls[0][0].max_tokens).toBe(CAREER_OUTPUT_TOKENS); expect(create.mock.calls[0][1]).toMatchObject({ maxRetries: 0, timeout: 120000 });
  });
  it('reports each part attempt to the evaluation hook, which the order path never passes', async () => {
    const attempts: any[] = []; const e = facts();
    await generateDeterministicCareer(delhi(), ASOF, mockedRequester(e), { onSection: (a) => attempts.push(a) });
    expect(attempts).toHaveLength(5); expect(attempts.every((a) => a.accepted && a.content)).toBe(true);
    expect(readFileSync(new URL('../../server/aiAstrologerService.ts', import.meta.url), 'utf8')).not.toMatch(/onSection/);
  });
});

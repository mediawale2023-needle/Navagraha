import { afterEach, describe, expect, it, vi } from 'vitest';
import { CareerSpending, CAREER_DEADLINE_MS, careerRuleCode, generateDeterministicCareer, type CareerMetrics } from '../../server/careerReportGeneration';
import { buildCareerReportFacts, CAREER_HEADINGS, type CareerReportFacts } from '../../server/careerReportEvidence';
import { ASOF, fixtureChart } from '../fixtures/career-chart';
import { promptTarget, realisticRequester } from '../fixtures/career-replies';

// Invented chart (no personal birth details); the same one the pipeline tests use.
const BIRTH = ['1985-03-22', '06:15', 28.6139, 77.209] as const;
const delhi = () => fixtureChart(...BIRTH);
const facts = (): CareerReportFacts => buildCareerReportFacts(delhi(), ASOF);
const NO_WAIT = { retryDelaysMs: [0, 0] } as const;
const keys = (e: CareerReportFacts, request: { mock: { calls: any[][] } }) => request.mock.calls.map((c) => promptTarget(e, c[0]).section.key);
const count = (list: string[], key: string) => list.filter((k) => k === key).length;
const metricsOf = (m: ReturnType<typeof vi.fn>) => m.mock.calls[0][0] as CareerMetrics;
/** The base requester with one change on the overview's first request. */
const firstOverview = (e: CareerReportFacts, change: (r: any) => void | never) => {
  const base = realisticRequester(e); let seen = false;
  return vi.fn(async (p: string) => {
    if (promptTarget(e, p).section.key === 'overview' && !seen) { seen = true; const r = await base(p); change(r); return r; }
    return base(p);
  });
};

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

describe('facts-first Career report: transport and format faults are retried, not judged', () => {
  it('a transient API failure followed by success completes the report', async () => {
    const e = facts(); const base = realisticRequester(e); let failed = false;
    const request = vi.fn(async (p: string) => {
      if (promptTarget(e, p).section.key === 'overview' && !failed) { failed = true; throw Object.assign(new Error('test 503'), { status: 503 }); }
      return base(p);
    });
    const metrics = vi.fn();
    const report = await generateDeterministicCareer(delhi(), ASOF, request, { ...NO_WAIT, onMetrics: metrics });
    expect(report.sections.map((s) => s.heading)).toEqual(CAREER_HEADINGS);
    const m = metricsOf(metrics);
    expect(m).toMatchObject({ outcome: 'completed', transportRetries: 1, formatRetries: 0, corrections: 0, correctionRounds: 0 });
    expect(m.attempts.filter((a) => a.category === 'transport')).toEqual([expect.objectContaining({ section: 'Career Overview', phase: 'first', attempt: 1, rules: ['http-503'] })]);
    expect(count(keys(e, request), 'overview')).toBe(2);
  });

  it('a non-retryable API error (400) fails at once, without retries', async () => {
    const request = vi.fn(async () => { throw Object.assign(new Error('test 400'), { status: 400 }); });
    const metrics = vi.fn();
    await expect(generateDeterministicCareer(delhi(), ASOF, request, { ...NO_WAIT, onMetrics: metrics })).rejects.toThrow(/transport failed/);
    expect(metricsOf(metrics)).toMatchObject({ outcome: 'failed', failureCategory: 'transport', transportRetries: 0 });
  });

  it('a truncated response (finish_reason "length") followed by success is not a content failure', async () => {
    const e = facts(); const request = firstOverview(e, (r) => { r.choices[0].finish_reason = 'length'; });
    const metrics = vi.fn();
    const report = await generateDeterministicCareer(delhi(), ASOF, request, { ...NO_WAIT, onMetrics: metrics });
    expect(report.sections).toHaveLength(5);
    const m = metricsOf(metrics);
    expect(m).toMatchObject({ outcome: 'completed', formatRetries: 1, corrections: 0, correctionRounds: 0, firstPassAccepted: 5 });
    expect(m.attempts.find((a) => a.category === 'truncated')).toMatchObject({ section: 'Career Overview', attempt: 1 });
    expect(request).toHaveBeenCalledTimes(6);
  });

  it('invalid JSON followed by success is not a content failure', async () => {
    const e = facts(); const request = firstOverview(e, (r) => { r.choices[0].message.content = '{"explanations": '; });
    const metrics = vi.fn();
    const report = await generateDeterministicCareer(delhi(), ASOF, request, { ...NO_WAIT, onMetrics: metrics });
    expect(report.sections).toHaveLength(5);
    expect(metricsOf(metrics)).toMatchObject({ outcome: 'completed', formatRetries: 1, corrections: 0, firstPassAccepted: 5 });
    expect(metricsOf(metrics).attempts.find((a) => a.category === 'malformed')?.rules).toEqual(['response:invalid-json']);
  });
});

describe('facts-first Career report: targeted correction rounds', () => {
  const venus = (upTo: number) => (r: any, s: any, attempt: number) => {
    if (s.key === 'chart' && attempt <= upTo && r.explanations['chart.tenth']) r.explanations['chart.tenth'] += ' Venus shapes this house.';
  };

  it('a required slot corrected on the second round completes the report', async () => {
    const e = facts(); const request = vi.fn(realisticRequester(e, venus(2))); const metrics = vi.fn();
    const report = await generateDeterministicCareer(delhi(), ASOF, request, { ...NO_WAIT, onMetrics: metrics });
    expect(report.sections).toHaveLength(5);
    expect(request).toHaveBeenCalledTimes(7);
    const m = metricsOf(metrics);
    expect(m).toMatchObject({ outcome: 'completed', correctionRounds: 2, corrections: 2, firstPassAccepted: 4 });
    expect(m.attempts.filter((a) => a.section === 'Your Birth Chart').map((a) => [a.phase, a.category])).toEqual([
      ['first', 'validation'], ['correction-1', 'validation'], ['correction-2', 'accepted'],
    ]);
    // Correction prompts ask for the failed slot only.
    for (const call of request.mock.calls.slice(5)) expect(promptTarget(e, call[0]).correction).toEqual(['chart.tenth']);
  });

  it('a persistent factual error fails the order after two rounds, with rule codes only', async () => {
    const e = facts(); const request = vi.fn(realisticRequester(e, venus(99))); const metrics = vi.fn();
    const err = await generateDeterministicCareer(delhi(), ASOF, request, { ...NO_WAIT, onMetrics: metrics }).catch((x) => x as Error);
    expect(err.message).toMatch(/after 2 correction rounds\. Your Birth Chart: chart\.tenth names/);
    expect(err.message).not.toMatch(/Venus/);
    expect(request).toHaveBeenCalledTimes(7);
    expect(metricsOf(metrics)).toMatchObject({ outcome: 'failed', failureCategory: 'quality', correctionRounds: 2 });
  });

  it('never requests an accepted section again: only the failing section is corrected', async () => {
    const e = facts(); const request = vi.fn(realisticRequester(e, venus(1)));
    const report = await generateDeterministicCareer(delhi(), ASOF, request, NO_WAIT);
    const k = keys(e, request);
    for (const key of ['overview', 'periods', 'current', 'guidance']) expect(count(k, key)).toBe(1);
    expect(count(k, 'chart')).toBe(2);
    expect(report.sections).toHaveLength(5);
  });
});

describe('facts-first Career report: the deadline and the spending ceiling still bound every retry', () => {
  it('fails at the deadline when transient errors keep the report from finishing', async () => {
    vi.useFakeTimers();
    const request = vi.fn(async () => { throw Object.assign(new Error('test 503'), { status: 503 }); });
    const metrics = vi.fn();
    const result = generateDeterministicCareer(delhi(), ASOF, request, { retryDelaysMs: [CAREER_DEADLINE_MS * 2], onMetrics: metrics });
    const assertion = expect(result).rejects.toThrow(/deadline/);
    await vi.advanceTimersByTimeAsync(CAREER_DEADLINE_MS); await assertion;
    expect(request).toHaveBeenCalledTimes(5);
    expect(metricsOf(metrics)).toMatchObject({ outcome: 'failed', failureCategory: 'deadline' });
  });

  it('fails at the spending ceiling when unreadable replies keep being retried, never overspending', async () => {
    const e = facts(); const base = realisticRequester(e); const ledger = new CareerSpending(); const metrics = vi.fn();
    const request = vi.fn(async (p: string) => { const r = await base(p); r.choices[0].finish_reason = 'length'; delete r.usage; return r; });
    await expect(generateDeterministicCareer(delhi(), ASOF, request, { ...NO_WAIT, ledger, onMetrics: metrics })).rejects.toThrow(/ceiling/);
    expect(ledger.spent).toBeLessThanOrEqual(ledger.limit); expect(ledger.reserved).toBe(0);
    const m = metricsOf(metrics);
    expect(m).toMatchObject({ outcome: 'failed', failureCategory: 'budget' });
    expect(m.attempts.some((a) => a.category === 'budget')).toBe(true);
  });
});

describe('facts-first Career report: diagnostics carry no birth details or report text', () => {
  it('records section, category, rule, attempt, tokens, cost and duration, and nothing personal', async () => {
    const e = facts(); const metrics = vi.fn();
    const request = vi.fn(realisticRequester(e, (r, s, attempt) => { if (s.key === 'chart' && attempt === 1 && r.explanations['chart.tenth']) r.explanations['chart.tenth'] += ' Venus shapes this house.'; }));
    await generateDeterministicCareer(delhi(), ASOF, request, { ...NO_WAIT, onMetrics: metrics });
    const m = metricsOf(metrics);
    for (const a of m.attempts) {
      expect(Object.keys(a).sort()).toEqual(['attempt', 'category', 'completionTokens', 'costMicroUsd', 'durationMs', 'phase', 'promptTokens', 'rules', 'section']);
      expect(CAREER_HEADINGS).toContain(a.section);
    }
    expect(m.durationMs).toBeGreaterThanOrEqual(0); expect(m.costMicroUsd).toBeGreaterThan(0);
    const logged = JSON.stringify(m);
    for (const secret of [BIRTH[0], BIRTH[1], String(BIRTH[2]), String(BIRTH[3]), 'shapes this house', 'Venus']) expect(logged).not.toContain(secret);
  });

  it('reduces a validator problem to its rule', () => {
    expect(careerRuleCode('calls the Mercury Antardasha upcoming, but it is running now')).toBe('calls the antardasha upcoming but it is running');
    expect(careerRuleCode('overstates Mercury\'s strength (debilitated in the birth chart)')).toBe('overstates strength');
    expect(careerRuleCode('names Venus, which is not in this fact ("Venus shapes this house")')).not.toMatch(/venus|shapes/);
    expect(careerRuleCode('places Saturn in the 7th house')).toBe('places in the house');
    expect(careerRuleCode('invalid-json')).toBe('invalid-json');
  });
});

describe('facts-first Career report: per-attempt cost', () => {
  it('each attempt records its own charge, and the attempts add up to the ledger total', async () => {
    const e = facts(); const metrics = vi.fn(); const ledger = new CareerSpending();
    await generateDeterministicCareer(delhi(), ASOF, vi.fn(realisticRequester(e)), { ...NO_WAIT, ledger, onMetrics: metrics });
    const m = metricsOf(metrics);
    expect(m.attempts.reduce((n, a) => n + a.costMicroUsd, 0)).toBe(ledger.spent);
    for (const a of m.attempts) expect(a.costMicroUsd).toBe(Math.ceil((a.promptTokens ?? 0) * 2.5 + (a.completionTokens ?? 0) * 10));
  });
});

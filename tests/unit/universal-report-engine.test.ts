import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getKundli } from '../../server/astroEngine';
import { generateUniversalReport } from '../../server/reportEngine/engine';
import { UNIVERSAL_REPORT_REGISTRY, universalReportConfig } from '../../server/reportEngine/registry';
import { REPORT_BUDGET_MICRO_USD, ReportRuntime, ReportSpending, type ReportRequester } from '../../server/reportEngine/runtime';
import { useUniversalReportEngine, universalReportAllowlist } from '../../server/reportEngine/feature';
import { buildUniversalBlueprint } from '../../server/reportEngine/blueprint';
import { reportRemedies } from '../../server/reportEngine/remedies';
import { reportEditorialWarnings, signChangeProblems, validateNarrative, withoutSuppliedTransits } from '../../server/reportEngine/validation';

const NEUTRAL = 'The verified evidence describes tendencies rather than certainties and shows a mixed balance that deserves a measured response. The supporting factors explain where momentum may arise, while the limiting factors show where care, preparation and realistic expectations matter. This interpretation stays within the calculated chart and turns that balance into practical guidance without promising a fixed outcome. ';

const requested = (prompt: string) => JSON.parse(prompt.match(/SECTIONS: (\[.*\])\nEVIDENCE:/s)![1]) as Array<{ heading: string; citableEvidenceIds: string[] }>;
const replyFor = (prompt: string, edit?: (section: { heading: string; citableEvidenceIds: string[] }, body: string) => string) => {
  const sections = requested(prompt);
  return JSON.stringify({
    summary: NEUTRAL.repeat(2),
    summaryEvidenceIds: sections[0]?.citableEvidenceIds.slice(0, 1) ?? [],
    sections: sections.map((s) => ({
      heading: s.heading, body: edit?.(s, NEUTRAL.repeat(3)) ?? NEUTRAL.repeat(3), evidenceIds: s.citableEvidenceIds.slice(0, 1),
      evidenceLinks: s.citableEvidenceIds.slice(0, 1).map((evidenceId) => ({ evidenceId, conclusion: 'Choose measured practical action', explanation: 'This verified factor supports a measured response because it identifies both the available strength and its stated limitation.' })),
    })),
    remedies: [],
  });
};
const requester = (edit?: Parameters<typeof replyFor>[1]): ReportRequester => vi.fn(async (prompt) => ({ choices: [{ finish_reason: 'stop', message: { content: replyFor(prompt, edit) } }], usage: { prompt_tokens: 700, completion_tokens: 900 } }));

let exact: any;
let approximate: any;
beforeEach(async () => {
  const e = await getKundli('1990-08-15', '06:30', 12.9716, 77.5946, { timeAccuracy: 'exact' });
  exact = { ...e, name: 'Synthetic Exact Chart', dateOfBirth: new Date('1990-08-15'), timeOfBirth: '06:30', placeOfBirth: 'Bengaluru' };
  const a = await getKundli('1988-02-14', '06:00', 12.9716, 77.5946, { timeAccuracy: 'approximate' });
  approximate = { ...a, name: 'Synthetic Approximate Chart', dateOfBirth: new Date('1988-02-14'), timeOfBirth: '06:00', placeOfBirth: 'Bengaluru' };
});
afterEach(() => vi.unstubAllEnvs());

describe('universal report registry', () => {
  it('covers every offered report category with strict product-specific configuration', () => {
    expect(Object.keys(UNIVERSAL_REPORT_REGISTRY).sort()).toEqual(['career', 'finance', 'life', 'life_complete', 'marriage', 'year_ahead']);
    for (const config of Object.values(UNIVERSAL_REPORT_REGISTRY)) {
      expect(config.requiredSections).toEqual(config.reportSections.filter((s) => s.required).map((s) => s.id));
      expect(new Set(config.reportSections.map((s) => s.id)).size).toBe(config.reportSections.length);
      expect(config.deliveryPolicy).toBe('persist-before-notify');
    }
    expect(universalReportConfig('life_complete').reportSections).toHaveLength(46);
  });
});

describe('shared generation, validation and budget', () => {
  it.each(['marriage', 'finance', 'year_ahead', 'life'] as const)('%s uses two bounded structured calls and returns every configured section', async (category) => {
    const request = requester();
    const report: any = await generateUniversalReport(category, exact, { requester: request, asOf: new Date('2026-10-18T00:00:00Z') });
    expect(report.sections.map((s: any) => s.heading)).toEqual(universalReportConfig(category).reportSections.map((s) => s.heading));
    expect(report.generationMetrics).toMatchObject({ calls: 2, correctionCalls: 0, costMicroUsd: 21500 });
  });

  it('Complete Life uses bounded batches, covers all 46 sections and remains below $0.25', async () => {
    const request = requester();
    const report: any = await generateUniversalReport('life_complete', exact, { requester: request, asOf: new Date('2026-10-18T00:00:00Z') });
    expect(report.sections).toHaveLength(46);
    expect(report.generationMetrics.calls).toBe(6);
    expect(report.generationMetrics.costMicroUsd).toBeLessThanOrEqual(REPORT_BUDGET_MICRO_USD);
  });

  it('corrects only a factually invalid section and keeps accepted sections', async () => {
    let first = true;
    const request: ReportRequester = vi.fn(async (prompt) => {
      const output = replyFor(prompt, (s, body) => first && s.heading === 'Financial Overview' ? `Your Lagna is Pisces. ${body}` : body);
      first = false;
      return { choices: [{ finish_reason: 'stop', message: { content: output } }], usage: { prompt_tokens: 600, completion_tokens: 700 } };
    });
    const report: any = await generateUniversalReport('finance', exact, { requester: request });
    expect(report.sections).toHaveLength(universalReportConfig('finance').reportSections.length);
    expect(report.generationMetrics).toMatchObject({ calls: 3, correctionCalls: 1 });
    expect(requested((request as any).mock.calls[1][0]).map((s) => s.heading)).toEqual(['Financial Overview']);
  });

  it('targets a section whose evidence reference is unsupported or lacks a reasoning link', async () => {
    let first = true;
    const request: ReportRequester = vi.fn(async (prompt) => {
      const parsed = JSON.parse(replyFor(prompt));
      if (first) {
        first = false;
        const target = parsed.sections.find((s: any) => s.heading === 'Income Sources');
        target.evidenceIds = ['invented:evidence'];
        target.evidenceLinks = [];
      }
      return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(parsed) } }], usage: { prompt_tokens: 600, completion_tokens: 700 } };
    });
    const report: any = await generateUniversalReport('finance', exact, { requester: request });
    expect(report.sections).toHaveLength(universalReportConfig('finance').reportSections.length);
    expect(requested((request as any).mock.calls[1][0]).map((s) => s.heading)).toEqual(['Income Sources']);
    expect(report.generationMetrics).toMatchObject({ calls: 3, correctionCalls: 1 });
  });

  it('discards model-authored remedies and keeps only deterministic chart remedies', async () => {
    const request: ReportRequester = vi.fn(async (prompt) => {
      const parsed = JSON.parse(replyFor(prompt));
      parsed.remedies = ['Buy an expensive invented gemstone'];
      return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(parsed) } }], usage: { prompt_tokens: 600, completion_tokens: 700 } };
    });
    const report: any = await generateUniversalReport('marriage', exact, { requester: request });
    expect(report.remedies).not.toContain('Buy an expensive invented gemstone');
  });

  it('editorial warnings do not reject a complete factually safe report', async () => {
    const report: any = await generateUniversalReport('marriage', exact, { requester: requester() });
    expect(report.generationMetrics.correctionCalls).toBe(0);
    expect(report.generationMetrics.editorialWarnings).toBeGreaterThan(0);
  });

  it('fails before a call when exact birth time is required, while Life uses only stable facts', async () => {
    const blocked = requester();
    await expect(generateUniversalReport('marriage', approximate, { requester: blocked })).rejects.toThrow(/exact birth time/);
    expect(blocked).not.toHaveBeenCalled();
    const life: any = await generateUniversalReport('life', approximate, { requester: requester() });
    expect(life.disclosure).toMatch(/approximate/);
    expect(life.dashaTimeline).toEqual([]);
  });

  it('hard-refuses reservations beyond the shared $0.25 ceiling', () => {
    const budget = new ReportSpending();
    expect(() => budget.reserve('x', 6000)).not.toThrow();
    expect(() => budget.reserve('x'.repeat(100_000), 6000)).toThrow(/spending ceiling/);
  });

  it('keeps dispatched generation and correction usage within $0.25 under worst-case valid token usage', async () => {
    let dispatchedCostMicroUsd = 0;
    const request: ReportRequester = vi.fn(async (prompt, { maxTokens }) => {
      const promptTokens = Buffer.byteLength(prompt, 'utf8'); // deliberately conservative: one token per byte
      dispatchedCostMicroUsd += Math.ceil(promptTokens * 2.5 + maxTokens * 10);
      const parsed = JSON.parse(replyFor(prompt));
      for (const section of parsed.sections) section.evidenceLinks = []; // force targeted correction
      return {
        choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(parsed) } }],
        usage: { prompt_tokens: promptTokens, completion_tokens: maxTokens },
      };
    });
    await expect(generateUniversalReport('life_complete', exact, { requester: request })).rejects.toThrow(/spending ceiling|failed validation/);
    expect(request).toHaveBeenCalled();
    expect(dispatchedCostMicroUsd).toBeLessThanOrEqual(REPORT_BUDGET_MICRO_USD);
  });

  it('uses one bounded format correction for malformed structured output', async () => {
    let malformed = true;
    const request: ReportRequester = vi.fn(async (prompt) => ({ choices: [{ finish_reason: 'stop', message: { content: malformed ? (malformed = false, '{bad') : replyFor(prompt) } }], usage: { prompt_tokens: 500, completion_tokens: 600 } }));
    const report: any = await generateUniversalReport('marriage', exact, { requester: request });
    expect(report.generationMetrics).toMatchObject({ calls: 3, formatRetries: 1 });
  });

  it('retries a transient provider error but rejects truncated output', async () => {
    let transient = true;
    const request: ReportRequester = vi.fn(async (prompt) => {
      if (transient) { transient = false; throw Object.assign(new Error('temporary'), { status: 503 }); }
      return { choices: [{ finish_reason: 'stop', message: { content: replyFor(prompt) } }], usage: { prompt_tokens: 500, completion_tokens: 600 } };
    });
    const report: any = await generateUniversalReport('finance', exact, { requester: request });
    expect(report.generationMetrics.transportRetries).toBe(1);
    const truncated: ReportRequester = vi.fn(async (prompt) => ({ choices: [{ finish_reason: 'length', message: { content: replyFor(prompt) } }], usage: { prompt_tokens: 500, completion_tokens: 600 } }));
    await expect(generateUniversalReport('finance', exact, { requester: truncated })).rejects.toThrow(/truncated or refused/);
  });

  it('fails safely after the configured targeted correction remains incomplete', async () => {
    const request: ReportRequester = vi.fn(async (prompt) => {
      const parsed = JSON.parse(replyFor(prompt));
      parsed.sections[0].evidenceLinks = [];
      return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(parsed) } }], usage: { prompt_tokens: 500, completion_tokens: 600 } };
    });
    await expect(generateUniversalReport('finance', exact, { requester: request })).rejects.toThrow(/failed validation/);
    expect(request).toHaveBeenCalledTimes(3); // first pass + two targeted correction rounds, then no further calls
  });

  it('sends internal evidence ids written into the prose back for correction', async () => {
    let first = true;
    const request: ReportRequester = vi.fn(async (prompt) => {
      const output = replyFor(prompt, (s, body) => first && s.heading === 'Income Sources' ? `${body} ["conclusion:wealth"]` : body);
      first = false;
      return { choices: [{ finish_reason: 'stop', message: { content: output } }], usage: { prompt_tokens: 600, completion_tokens: 700 } };
    });
    const report: any = await generateUniversalReport('finance', exact, { requester: request });
    expect(requested((request as any).mock.calls[1][0]).map((s) => s.heading)).toEqual(['Income Sources']);
    expect(report.sections.every((s: any) => !/conclusion:wealth/.test(s.body))).toBe(true);
  });

  it('delivers plain prose without Markdown emphasis or stray indentation', async () => {
    const report: any = await generateUniversalReport('life', exact, { requester: requester((_s, body) => `### November 2026\n\n**Measured** progress.\n\n  ${body}`), asOf: new Date('2026-10-18T00:00:00Z') });
    for (const s of report.sections) expect(s.body).not.toMatch(/\*\*|^[ \t]|^#/m);
  });

  it('gives every timing section the Vimshottari dates and running periods', () => {
    for (const category of ['marriage', 'finance', 'year_ahead'] as const) {
      const plan = buildUniversalBlueprint(universalReportConfig(category), exact, new Date('2026-10-18T00:00:00Z'));
      const timing = plan.sections.find((s) => s.id === 'timing')!;
      expect(timing.evidenceIds.filter((id) => id.startsWith('dasha:')).length).toBe(exact.dashas.length);
      expect(timing.evidenceIds.some((id) => id.startsWith('period:'))).toBe(true);
    }
  });

  it('gives Year Ahead dated month evidence only in Key Months Ahead, and none to the natal sections', () => {
    const plan = buildUniversalBlueprint(universalReportConfig('year_ahead'), exact, new Date('2026-10-18T00:00:00Z'));
    const dated = plan.evidence.filter((e) => e.source === 'dated-transit' || e.source === 'dated-period');
    expect(dated.length).toBeGreaterThan(0);
    for (const e of dated) expect(Date.parse(e.text.match(/\d{4}-\d{2}-\d{2}/)![0])).toBeLessThanOrEqual(Date.parse('2027-10-19'));
    const months = plan.sections.find((x) => x.id === 'months')!;
    expect(months.heading).toBe('Key Months Ahead');
    expect(months.evidenceIds.filter((id) => id.startsWith('dated-')).length).toBe(dated.length);
    for (const other of plan.sections.filter((x) => x.id !== 'months')) expect(other.evidenceIds.some((id) => id.startsWith('dated-'))).toBe(false);
    expect(buildUniversalBlueprint(universalReportConfig('marriage'), exact, new Date('2026-10-18T00:00:00Z')).evidence.some((e) => e.source.startsWith('dated'))).toBe(false);
  });

  it('lets a section the engine finds evidence-thin be shorter and say so, instead of padding it', () => {
    const plan = buildUniversalBlueprint(universalReportConfig('marriage'), exact, new Date('2026-10-18T00:00:00Z'));
    // This chart's relationships verdict is "Insufficient evidence".
    const partner = plan.sections.find((x) => x.id === 'partner-traits')!;
    expect(partner.minWords).toBe(60);
    expect(partner.limitations[0]).toMatch(/too little reliable evidence/);
    expect(plan.sections.find((x) => x.id === 'timing')!.minWords).toBe(85);
  });

  it('tells later call groups which evidence earlier sections already explained', async () => {
    const request: ReportRequester = vi.fn(async (prompt) => {
      const parsed = JSON.parse(replyFor(prompt));
      for (const [i, section] of parsed.sections.entries()) {
        const ids = requested(prompt)[i].citableEvidenceIds.slice(0, 3);
        section.evidenceIds = ids;
        section.evidenceLinks = ids.map((evidenceId: string) => ({ evidenceId, conclusion: 'Choose measured practical action', explanation: 'This verified factor supports a measured response because it identifies both the available strength and its stated limitation.' }));
      }
      return { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(parsed) } }], usage: { prompt_tokens: 700, completion_tokens: 900 } };
    });
    await generateUniversalReport('marriage', exact, { requester: request, asOf: new Date('2026-10-18T00:00:00Z') });
    const prompts = (request as any).mock.calls.map((c: any[]) => c[0] as string);
    expect(prompts[0]).not.toMatch(/^ALREADY EXPLAINED IN EARLIER SECTIONS: \[/m);
    expect(prompts[1]).toMatch(/^ALREADY EXPLAINED IN EARLIER SECTIONS: \["/m);
  });

  it('offers remedies only for planets tied to the report, without gemstones, and none from lordship for an approximate time', () => {
    const asOf = new Date('2026-10-18T00:00:00Z');
    const marriage = reportRemedies('marriage', exact, asOf), finance = reportRemedies('finance', exact, asOf), life = reportRemedies('life', exact, asOf);
    expect(marriage.join(' ')).toMatch(/^Saturn, ruler of your 7th house/); // Leo Lagna: Saturn rules the 7th
    expect(finance).toEqual([]); // neither the 2nd/11th lord (Mercury) nor Jupiter carries a functional remedy here
    expect(life.some((x) => /Ascendant lord/.test(x))).toBe(true);
    expect(life.some((x) => /Om Chandraya Namah/.test(x))).toBe(true);
    expect(marriage.some((x) => /Om Chandraya Namah/.test(x))).toBe(false);
    for (const r of [...marriage, ...life]) expect(r).not.toMatch(/ruby|coral|pearl|emerald|sapphire|diamond|gemstone/i);
    expect(reportRemedies('life', approximate, asOf).some((x) => /Ascendant lord|ruler of/.test(x))).toBe(false);
    expect(reportRemedies('career', exact, asOf)).toEqual([]);
    // Birth-star practices reach the Life Reading without their gemstone.
    const withGem = { ...exact, remedies: [...exact.remedies, { title: 'Gemstone', description: 'Ruby — birth-star gemstone', type: 'gemstone' }] };
    expect(reportRemedies('life', withGem, asOf).some((x) => /gemstone|ruby/i.test(x))).toBe(false);
  });

  it('accepts a dated sign change only when the engine supplied it', () => {
    const facts = 'Around 2026-11-13, Mars moves into Leo, the 4th from the Moon sign; by the classical Gochara rule this is demanding.';
    expect(signChangeProblems('In mid-November Mars moves into Leo, the 4th from your Moon.', facts)).toEqual([]);
    expect(signChangeProblems('Mars enters Virgo in July.', facts)).toEqual(['says Mars moves into Virgo, which no supplied dated change shows']);
    expect(signChangeProblems("Jupiter's move into Cancer brings relief.", facts)).toHaveLength(1);
  });

  it('reads a dated planet-in-sign claim as a transit only when that dated change was supplied', () => {
    const facts = 'Around 2026-11-13, Mars moves into Leo, the 5th from the Moon sign.';
    expect(withoutSuppliedTransits('From mid-November 2026, with Mars in Leo, effort pays off.', facts)).not.toMatch(/Mars|Leo/);
    expect(withoutSuppliedTransits('In March 2027, Mars in Virgo helps.', facts)).toMatch(/Mars in Virgo/);
    expect(withoutSuppliedTransits('Your Mars in Leo gives drive.', facts)).toMatch(/Mars in Leo/); // no date: a birth-chart claim
  });

  it('flags citation markers but not numbered list items', () => {
    const config = universalReportConfig('finance');
    const plan = buildUniversalBlueprint(config, exact, new Date('2026-10-18T00:00:00Z'));
    const section = plan.sections.find((x) => x.id === 'management')!;
    const guard = { chart: exact.chartData.canonical, factsText: '', asOf: new Date('2026-10-18T00:00:00Z') };
    const run = (body: string) => validateNarrative(config, [section], { summary: '', summaryEvidenceIds: [], remedies: [], sections: [{ heading: section.heading, body, evidenceIds: [], evidenceLinks: [] }] } as any, guard as any)[0].completeness.join(' ');
    expect(run('Savings can grow steadily (19). Keep a buffer.')).toMatch(/internal evidence ids/);
    expect(run('(1) Build a cash buffer first. (2) Then review fixed costs each quarter.')).not.toMatch(/internal evidence ids/);
  });

  it('measures repetition across sections and chart-free paragraphs without blocking', () => {
    const repeated = 'Jupiter exalted in Cancer supports steady growth of savings over the long run.';
    const generic = 'Life brings many opportunities and challenges, and staying positive and open will help you navigate whatever comes your way with grace and patience over the many years ahead of you.';
    expect(reportEditorialWarnings([repeated, `${repeated} More.`, generic])).toEqual(['repeats a sentence from another section', 'has a paragraph that names no chart fact']);
  });

  it('builds time-specific transit evidence and scoped Complete Life evidence from multiple synthetic charts', async () => {
    const second = await getKundli('1972-01-03', '21:10', 28.6139, 77.209, { timeAccuracy: 'exact' });
    const firstPlan = buildUniversalBlueprint(universalReportConfig('life_complete'), exact, new Date('2026-10-18T00:00:00Z'));
    const secondPlan = buildUniversalBlueprint(universalReportConfig('life_complete'), second, new Date('2026-10-18T00:00:00Z'));
    expect(firstPlan.evidence.some((e) => e.source === 'calculated-transit')).toBe(true);
    expect(firstPlan.sections.find((s) => s.heading.startsWith('Sun'))?.evidenceIds).toContain('planet:Sun');
    expect(firstPlan.sections.find((s) => s.heading.startsWith('1st House'))?.evidenceIds).toContain('house:1');
    expect(firstPlan.chartFacts).not.toBe(secondPlan.chartFacts);
  });

  it('enforces the deadline even when a requester ignores its abort signal', async () => {
    const runtime = new ReportRuntime(() => new Promise(() => {}), { deadlineMs: 5 });
    await expect(runtime.complete('bounded request', 10)).rejects.toThrow(/deadline exceeded/);
    runtime.close();
  });
});

describe('off-by-default rollout gate', () => {
  const verified = { email: 'pilot@example.com', emailVerifiedAt: new Date() };
  it('requires both the exact true flag and a verified canonical allow-listed address', () => {
    expect(useUniversalReportEngine(verified, 'marriage')).toBe(false);
    expect(universalReportAllowlist().size).toBe(0);
    vi.stubEnv('FEATURE_UNIVERSAL_REPORT_ENGINE', 'true');
    vi.stubEnv('UNIVERSAL_REPORT_ENGINE_ALLOWLIST', 'pilot@example.com');
    for (const category of ['career', 'marriage', 'finance', 'year_ahead', 'life']) expect(useUniversalReportEngine(verified, category)).toBe(true);
    expect(useUniversalReportEngine({ email: 'Pilot@example.com', emailVerifiedAt: new Date() }, 'marriage')).toBe(false);
    expect(useUniversalReportEngine({ email: 'pilot@example.com', emailVerifiedAt: null }, 'marriage')).toBe(false);
  });

  it('never releases Complete Life (or an unknown category) to the universal engine, even for an allow-listed account', () => {
    vi.stubEnv('FEATURE_UNIVERSAL_REPORT_ENGINE', 'true');
    vi.stubEnv('UNIVERSAL_REPORT_ENGINE_ALLOWLIST', 'pilot@example.com');
    for (const category of ['life_complete', 'health', '', null, undefined]) expect(useUniversalReportEngine(verified, category)).toBe(false);
  });
});

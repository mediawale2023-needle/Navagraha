import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getKundli } from '../../server/astroEngine';
import { generateUniversalReport } from '../../server/reportEngine/engine';
import { UNIVERSAL_REPORT_REGISTRY, universalReportConfig } from '../../server/reportEngine/registry';
import { REPORT_BUDGET_MICRO_USD, ReportRuntime, ReportSpending, type ReportRequester } from '../../server/reportEngine/runtime';
import { useUniversalReportEngine, universalReportAllowlist } from '../../server/reportEngine/feature';
import { buildUniversalBlueprint } from '../../server/reportEngine/blueprint';

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
  it.each(['marriage', 'finance', 'year_ahead', 'life'] as const)('%s uses one shared structured call and returns every configured section', async (category) => {
    const request = requester();
    const report: any = await generateUniversalReport(category, exact, { requester: request, asOf: new Date('2026-10-18T00:00:00Z') });
    expect(report.sections.map((s: any) => s.heading)).toEqual(universalReportConfig(category).reportSections.map((s) => s.heading));
    expect(report.generationMetrics).toMatchObject({ calls: 1, correctionCalls: 0, costMicroUsd: 10750 });
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
    expect(report.generationMetrics).toMatchObject({ calls: 2, correctionCalls: 1 });
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
    expect(report.generationMetrics).toMatchObject({ calls: 2, correctionCalls: 1 });
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

  it('uses one bounded format correction for malformed structured output', async () => {
    let malformed = true;
    const request: ReportRequester = vi.fn(async (prompt) => ({ choices: [{ finish_reason: 'stop', message: { content: malformed ? (malformed = false, '{bad') : replyFor(prompt) } }], usage: { prompt_tokens: 500, completion_tokens: 600 } }));
    const report: any = await generateUniversalReport('marriage', exact, { requester: request });
    expect(report.generationMetrics).toMatchObject({ calls: 2, formatRetries: 1 });
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
    expect(request).toHaveBeenCalledTimes(2);
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
    expect(useUniversalReportEngine(verified)).toBe(false);
    expect(universalReportAllowlist().size).toBe(0);
    vi.stubEnv('FEATURE_UNIVERSAL_REPORT_ENGINE', 'true');
    vi.stubEnv('UNIVERSAL_REPORT_ENGINE_ALLOWLIST', 'pilot@example.com');
    expect(useUniversalReportEngine(verified)).toBe(true);
    expect(useUniversalReportEngine({ email: 'Pilot@example.com', emailVerifiedAt: new Date() })).toBe(false);
    expect(useUniversalReportEngine({ email: 'pilot@example.com', emailVerifiedAt: null })).toBe(false);
  });
});

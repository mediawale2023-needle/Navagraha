import type { Kundli } from '@shared/schema';
import { isCurrentCanonicalChart } from '@shared/v3/canonical';
import { createOpenAI } from '../ai/metering';
import { deriveStructured, type GeneratedReport } from '../aiAstrologerService';
import { careerRequester, generateDeterministicCareer, type CareerMetrics } from '../careerReportGeneration';
import { ReportGenerationError, factualProblems, type ReportGuard } from '../reportQuality';
import { buildUniversalBlueprint } from './blueprint';
import { transitSummary, transitsForChart } from '../astroEngine';
import { narrativePrompt } from './prompt';
import { universalReportConfig } from './registry';
import { NarrativeReplySchema, type BlueprintSection, type NarrativeReply, type ReportGenerationMetrics, type UniversalReportCategory } from './types';
import { ReportRuntime, openAiReportRequester, type ReportRequester } from './runtime';
import { blockingProblems, editorialWarnings, reportEditorialWarnings, validateNarrative } from './validation';
import { reportRemedies } from './remedies';

export interface UniversalEngineOptions {
  requester?: ReportRequester;
  asOf?: Date;
  onMetrics?: (metrics: ReportGenerationMetrics) => void;
}

const chunks = <T>(items: readonly T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const parseReply = (raw: string): NarrativeReply => NarrativeReplySchema.parse(JSON.parse(raw));
// The PDF and reader print text as written: drop Markdown headings, emphasis and stray indentation the model adds.
const plainProse = (body: string) => body.replace(/^[ \t]*#{1,6}[ \t]+/gm, '').replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/__([^_\n]+)__/g, '$1').replace(/^[ \t]+/gm, '').trim();

function guardFor(kundli: Partial<Kundli>, blueprint: ReturnType<typeof buildUniversalBlueprint>, asOf: Date): ReportGuard {
  const chart = (kundli as any).chartData?.canonical;
  if (!isCurrentCanonicalChart(chart)) throw new ReportGenerationError('chart is not a verified V3 calculation');
  return {
    chart,
    factsText: `${blueprint.chartFacts}\n${blueprint.evidence.map((e) => `${e.id}: ${e.text}`).join('\n')}`,
    transits: transitSummary(transitsForChart(chart, (kundli as any).chartData?.ashtakavarga?.sav, asOf)),
    asOf,
  };
}

async function completeParsed(runtime: ReportRuntime, prompt: string, maxTokens: number): Promise<NarrativeReply> {
  let raw = await runtime.complete(prompt, maxTokens);
  try { return parseReply(raw); }
  catch {
    if (runtime.formatRetries >= 1) throw new ReportGenerationError('Report response was not valid structured JSON');
    runtime.formatRetries++;
    raw = await runtime.complete(`${prompt}\n\nFORMAT CORRECTION: The previous response was invalid JSON. Return only the requested JSON object.`, maxTokens);
    try { return parseReply(raw); } catch { throw new ReportGenerationError('Report response was not valid structured JSON'); }
  }
}

async function generateConfigured(category: Exclude<UniversalReportCategory, 'career'>, kundli: Partial<Kundli>, options: UniversalEngineOptions): Promise<GeneratedReport & { generationMetrics: ReportGenerationMetrics }> {
  const config = universalReportConfig(category);
  const asOf = options.asOf ?? new Date();
  const blueprint = buildUniversalBlueprint(config, kundli, asOf);
  const guard = guardFor(kundli, blueprint, asOf);
  const request = options.requester ?? openAiReportRequester(createOpenAI(process.env.OPENAI_API_KEY!));
  const runtime = new ReportRuntime(request);
  const accepted = new Map<string, { heading: string; body: string }>();
  let summary = '';
  let summaryEvidenceIds: string[] = [];
  let editorialCount = 0;
  // Evidence earlier groups already explained: later sections refer back to it instead of explaining it again.
  const covered = new Set<string>();
  const cover = (v: { generated?: { evidenceIds: string[] } }) => v.generated?.evidenceIds.forEach((id) => { if (!id.startsWith('conclusion:')) covered.add(id); });
  try {
    for (const group of chunks(blueprint.sections, config.promptConfiguration.maxSectionsPerCall)) {
      const explained = Array.from(covered);
      const first = await completeParsed(runtime, narrativePrompt(config, blueprint, group, undefined, explained), config.promptConfiguration.maxOutputTokens);
      if (!summary && first.summary.trim()) { summary = first.summary.trim(); summaryEvidenceIds = first.summaryEvidenceIds; }
      let validations = validateNarrative(config, group, first, guard);
      for (const v of validations) editorialCount += v.editorial.length;
      for (const v of validations) if (!blockingProblems(v).length && v.generated) { accepted.set(v.section.id, { heading: v.section.heading, body: plainProse(v.generated.body) }); cover(v); }
      let failed = validations.filter((v) => blockingProblems(v).length);
      for (let round = 0; failed.length && round < config.validationPolicy.correctionRounds; round++) {
        runtime.correctionCalls++;
        const correctionSections = failed.map((v) => v.section);
        const problems = Object.fromEntries(failed.map((v) => [v.section.id, blockingProblems(v)]));
        const corrected = await completeParsed(runtime, narrativePrompt(config, blueprint, correctionSections, problems, explained), Math.min(config.promptConfiguration.maxOutputTokens, 2800));
        validations = validateNarrative(config, correctionSections, corrected, guard);
        for (const v of validations) editorialCount += v.editorial.length;
        for (const v of validations) if (!blockingProblems(v).length && v.generated) { accepted.set(v.section.id, { heading: v.section.heading, body: plainProse(v.generated.body) }); cover(v); }
        failed = validations.filter((v) => blockingProblems(v).length);
      }
      if (failed.some((v) => v.section.required)) throw new ReportGenerationError(`Required report content failed validation: ${failed.map((v) => `${v.section.heading}: ${blockingProblems(v).join('; ')}`).join(' | ')}`);
    }
    if (!summary) summary = accepted.get(config.requiredSections[0])?.body ?? '';
    const validSummaryIds = summaryEvidenceIds.filter((id) => blueprint.evidence.some((e) => e.id === id));
    if (summary.split(/\s+/).length < 40 || factualProblems(summary, guard).length || !validSummaryIds.length) {
      // A verified section is preferable to another whole-report call; this is deterministic selection, not thin fallback.
      summary = accepted.get(config.requiredSections[0])?.body ?? summary;
    }
    const missing = config.requiredSections.filter((id) => !accepted.has(id));
    if (missing.length) throw new ReportGenerationError(`Required report sections missing: ${missing.join(', ')}`);
    const sections = config.reportSections.flatMap((s) => accepted.get(s.id) ?? []);
    const metrics: ReportGenerationMetrics = {
      engine: 'universal-report-engine', version: 1, calls: runtime.spending.calls, transportRetries: runtime.transportRetries,
      formatRetries: runtime.formatRetries, correctionCalls: runtime.correctionCalls, costMicroUsd: runtime.spending.spent,
      durationMs: Date.now() - runtime.startedAt, editorialWarnings: editorialCount + editorialWarnings(summary).length + reportEditorialWarnings(sections.map((x) => x.body)).length,
    };
    options.onMetrics?.(metrics);
    return {
      title: config.reportName, summary, sections,
      // Remedies are copied only from deterministic chart output; model-authored remedies are never delivered.
      remedies: reportRemedies(category, kundli, asOf),
      ...deriveStructured(kundli), generatedAt: asOf.toISOString(), generationMetrics: metrics,
    };
  } finally { runtime.close(); }
}

/** One entry point for every paid report. Product configuration changes content, never order/payment semantics. */
export async function generateUniversalReport(category: string, kundli: Partial<Kundli>, options: UniversalEngineOptions = {}): Promise<GeneratedReport & { generationMetrics?: ReportGenerationMetrics }> {
  const config = universalReportConfig(category);
  if (!process.env.OPENAI_API_KEY && !options.requester) throw new ReportGenerationError('AI report generation is not configured');
  const asOf = options.asOf ?? new Date();
  if (config.reportId === 'career') {
    if (options.requester) throw new ReportGenerationError('Use the Career requester adapter for offline Career generation');
    // Career retains its richer deterministic D1/D10 synthesis and premium PDF adapter while entering through the
    // same registry and order lifecycle. Its ledger has the identical hard $0.25 ceiling and six-minute deadline.
    let careerMetrics: CareerMetrics | undefined;
    const report = await generateDeterministicCareer(kundli, asOf, careerRequester(createOpenAI(process.env.OPENAI_API_KEY!)), { onMetrics: (metrics) => { careerMetrics = metrics; } });
    const metrics: ReportGenerationMetrics = {
      engine: 'universal-report-engine', version: 1, calls: careerMetrics?.calls ?? 0,
      transportRetries: careerMetrics?.transportRetries ?? 0, formatRetries: careerMetrics?.formatRetries ?? 0,
      correctionCalls: careerMetrics?.corrections ?? 0, costMicroUsd: careerMetrics?.costMicroUsd ?? 0,
      durationMs: careerMetrics?.durationMs ?? 0, editorialWarnings: careerMetrics?.advisories ?? 0,
    };
    options.onMetrics?.(metrics);
    return { ...report, generationMetrics: metrics };
  }
  return generateConfigured(config.reportId, kundli, options);
}

import type OpenAI from 'openai';
import { ReportGenerationError, textProblems } from './reportQuality';
import { careerReportProblems } from './careerReport';
import { buildCareerEvidence, type CareerPacket } from './careerReportEvidence';
import { careerDraftPrompt, draftProse, renderCareerSection, careerMetadata, careerSummary, validateCareerDraft, type CareerDraft } from './careerReportRendering';

export const CAREER_BUDGET_MICRO_USD = 250_000;
export const CAREER_DEADLINE_MS = 6 * 60_000;
export const MAX_CAREER_CORRECTIONS = 2;
export const CAREER_OUTPUT_TOKENS = 1400;
export type CareerUsage = { prompt_tokens: number; completion_tokens: number };
export interface CareerCompletion { choices: Array<{ finish_reason?: string | null; message: { content?: string | null } }>; usage?: CareerUsage | null }
export type CareerRequester = (prompt: string, options: { signal: AbortSignal; maxTokens: number }) => Promise<CareerCompletion>;

/** One shared ledger per report; reserve() has no await, making admission atomic across workers. */
export class CareerSpending {
  spent = 0;
  reserved = 0;
  calls = 0;
  private tickets = new Map<number, number>();
  constructor(readonly limit = CAREER_BUDGET_MICRO_USD) {
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > CAREER_BUDGET_MICRO_USD) throw new ReportGenerationError('Invalid Career spending limit');
  }
  reserve(prompt: string, maxTokens: number): number {
    if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > CAREER_OUTPUT_TOKENS) throw new ReportGenerationError('Invalid Career output allowance');
    // UTF-8 bytes conservatively bound byte-BPE input tokens; add chat framing overhead.
    const cost = Math.ceil((Buffer.byteLength(prompt, 'utf8') + 128) * 2.5 + maxTokens * 10);
    if (this.spent + this.reserved + cost > this.limit) throw new ReportGenerationError('Career spending ceiling reached');
    const id = ++this.calls;
    this.tickets.set(id, cost); this.reserved += cost;
    return id;
  }
  settle(id: number, usage?: CareerUsage | null) {
    const reservation = this.tickets.get(id);
    if (reservation === undefined) return;
    this.tickets.delete(id); this.reserved -= reservation;
    const valid = usage && Number.isFinite(usage.prompt_tokens) && usage.prompt_tokens >= 0 && Number.isFinite(usage.completion_tokens) && usage.completion_tokens >= 0;
    this.spent += valid ? Math.ceil(usage.prompt_tokens * 2.5 + usage.completion_tokens * 10) : reservation;
  }
}

export function careerRequester(client: OpenAI): CareerRequester {
  return (prompt, { signal, maxTokens }) => client.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, max_tokens: maxTokens }, { signal, maxRetries: 0, timeout: 60_000 });
}

/** Abort even if a transport adapter ignores its signal; never leave the report pending forever. */
async function boundedRequest(request: CareerRequester, prompt: string, signal: AbortSignal): Promise<CareerCompletion> {
  if (signal.aborted) throw new ReportGenerationError('Career deadline exceeded');
  let abort!: () => void;
  const interrupted = new Promise<never>((_, reject) => { abort = () => reject(new ReportGenerationError('Career deadline exceeded')); signal.addEventListener('abort', abort, { once: true }); });
  try { return await Promise.race([request(prompt, { signal, maxTokens: CAREER_OUTPUT_TOKENS }), interrupted]); }
  finally { signal.removeEventListener('abort', abort); }
}

export async function generateDeterministicCareer(kundli: unknown, asOf: Date, request: CareerRequester, options: { ledger?: CareerSpending; onMetrics?: (m: { calls: number; corrections: number; costMicroUsd: number; firstPassAccepted: number }) => void } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CAREER_DEADLINE_MS);
  const ledger = options.ledger ?? new CareerSpending();
  const accepted = new Map<number, CareerDraft>();
  const errors = new Map<number, string[]>();
  let corrections = 0, firstPassAccepted = 0;
  try {
    const evidence = buildCareerEvidence(kundli, asOf);
    const run = async (packet: CareerPacket, correction: string[] = []) => {
      if (controller.signal.aborted) throw new ReportGenerationError('Career deadline exceeded');
      const prompt = careerDraftPrompt(packet, correction);
      const ticket = ledger.reserve(prompt, CAREER_OUTPUT_TOKENS);
      let result: CareerCompletion;
      try { result = await boundedRequest(request, prompt, controller.signal); }
      catch (err) { ledger.settle(ticket); errors.set(packet.id, [controller.signal.aborted ? 'deadline' : 'transport-error']); return; }
      ledger.settle(ticket, result.usage);
      if (result.choices[0]?.finish_reason !== 'stop') { errors.set(packet.id, ['incomplete-response: output truncated or refused']); return; }
      let parsed: unknown;
      try { parsed = JSON.parse(result.choices[0]?.message.content ?? ''); }
      catch { errors.set(packet.id, ['invalid-json']); return; }
      const checked = validateCareerDraft(packet, parsed);
      if (checked.draft) checked.problems.push(...textProblems(draftProse(checked.draft), { chart: evidence.chart, factsText: packet.facts.map((f) => f.text).join('\n'), asOf: evidence.asOf }, 0));
      if (checked.problems.length) errors.set(packet.id, checked.problems);
      else { accepted.set(packet.id, checked.draft!); errors.delete(packet.id); }
    };
    let cursor = 0;
    // Three workers share both the reservation ledger and cancellation signal.
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (cursor < evidence.packets.length) { const packet = evidence.packets[cursor++]; await run(packet); }
    }));
    const crossCheck = () => {
      const findings = careerReportProblems(evidence.packets.filter((p) => accepted.has(p.id)).map((p) => ({ heading: p.heading, body: draftProse(accepted.get(p.id)!) })));
      for (const [heading, problems] of Array.from(findings)) {
        const packet = evidence.packets.find((p) => p.heading === heading)!;
        errors.set(packet.id, problems.map(() => 'cross-section-repetition-or-contradiction: explain this section without reusing earlier conclusions'));
        accepted.delete(packet.id);
      }
    };
    crossCheck(); firstPassAccepted = accepted.size;
    // Broad systematic failure is explicit; do not hide it behind more calls.
    if (errors.size > MAX_CAREER_CORRECTIONS) throw new ReportGenerationError(`Career quality check: first pass rejected ${errors.size} sections; correction allowance is ${MAX_CAREER_CORRECTIONS}; ${Array.from(errors).map(([id, reasons]) => `${evidence.packets[id].heading}: ${reasons.map((r) => r.split(':')[0]).join(', ')}`).join(' | ')}`);
    for (const [id, problems] of Array.from(errors)) { corrections++; await run(evidence.packets[id], problems); }
    crossCheck();
    if (errors.size || accepted.size !== evidence.packets.length) throw new ReportGenerationError(`Career quality failure: ${Array.from(errors).map(([id, p]) => `${id}:${p.join('; ')}`).join(' | ')}`);
    if (controller.signal.aborted) throw new ReportGenerationError('Career deadline exceeded');
    const sections = evidence.packets.map((p) => ({ heading: p.heading, body: renderCareerSection(p, accepted.get(p.id)!) }));
    return { title: 'Career & Profession Report', summary: careerSummary(evidence), sections, remedies: [] as string[], ...careerMetadata(evidence, kundli), generatedAt: asOf.toISOString() };
  } finally {
    controller.abort(); clearTimeout(timer);
    options.onMetrics?.({ calls: ledger.calls, corrections, costMicroUsd: ledger.spent + ledger.reserved, firstPassAccepted });
  }
}

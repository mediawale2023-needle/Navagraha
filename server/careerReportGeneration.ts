import type OpenAI from 'openai';
import { z } from 'zod';
import { ReportGenerationError } from './reportQuality';
import { buildFiveCareerEvidence, type CareerPacket } from './careerReportEvidence';
import { fiveCareerPrompt, draftProse, renderCareerSection, careerMetadata, careerSummary, validateFiveCareerDraft, type CareerDraft } from './careerReportRendering';

export const CAREER_BUDGET_MICRO_USD = 250_000;
export const CAREER_DEADLINE_MS = 6 * 60_000;
export const MAX_CAREER_CORRECTIONS = 2;
export const CAREER_OUTPUT_TOKENS = 6000;
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
  return (prompt, { signal, maxTokens }) => client.chat.completions.create({ model: 'gpt-4o', messages: [{ role: 'user', content: prompt }], response_format: { type: 'json_object' }, max_tokens: maxTokens }, { signal, maxRetries: 0, timeout: 120_000 });
}

/** Abort even if a transport adapter ignores its signal; never leave the report pending forever. */
async function boundedRequest(request: CareerRequester, prompt: string, signal: AbortSignal, maxTokens: number): Promise<CareerCompletion> {
  if (signal.aborted) throw new ReportGenerationError('Career deadline exceeded');
  let abort!: () => void;
  const interrupted = new Promise<never>((_, reject) => { abort = () => reject(new ReportGenerationError('Career deadline exceeded')); signal.addEventListener('abort', abort, { once: true }); });
  try { return await Promise.race([request(prompt, { signal, maxTokens }), interrupted]); }
  finally { signal.removeEventListener('abort', abort); }
}

// Echoed keys (e.g. a section heading) are dropped, not fatal: one coordinated call has no retry.
const envelope = z.object({ workStyle: z.enum(['employment', 'entrepreneurship', 'mixed']), sections: z.array(z.object({ id: z.number().int(), draft: z.unknown() })).max(5) });

export async function generateDeterministicCareer(kundli: unknown, asOf: Date, request: CareerRequester, options: { ledger?: CareerSpending; onMetrics?: (m: { calls: number; corrections: number; costMicroUsd: number; firstPassAccepted: number }) => void } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CAREER_DEADLINE_MS);
  const ledger = options.ledger ?? new CareerSpending();
  const accepted = new Map<number, CareerDraft>();
  const errors = new Map<number, string[]>();
  let corrections = 0, firstPassAccepted = 0;
  let workStyle: 'employment' | 'entrepreneurship' | 'mixed' | undefined;
  try {
    const evidence = buildFiveCareerEvidence(kundli, asOf);
    const run = async (packets: CareerPacket[], correcting = false) => {
      if (controller.signal.aborted) throw new ReportGenerationError('Career deadline exceeded');
      const prompt = fiveCareerPrompt(evidence, packets, correcting ? { workStyle: workStyle!, reasons: packets.map((p) => ({ id: p.id, problems: errors.get(p.id)! })) } : undefined);
      const maxTokens = correcting ? 1800 : CAREER_OUTPUT_TOKENS;
      const ticket = ledger.reserve(prompt, maxTokens);
      let result: CareerCompletion;
      try { result = await boundedRequest(request, prompt, controller.signal, maxTokens); }
      catch { ledger.settle(ticket); throw new ReportGenerationError(controller.signal.aborted ? 'Career deadline exceeded' : 'Career transport failed; reservation retained'); }
      ledger.settle(ticket, result.usage);
      if (result.choices[0]?.finish_reason !== 'stop') throw new ReportGenerationError('Career quality check: incomplete or refused response');
      let raw: unknown;
      try { raw = JSON.parse(result.choices[0]?.message.content ?? ''); }
      catch { throw new ReportGenerationError('Career quality check: invalid JSON'); }
      const parsed = envelope.safeParse(raw);
      if (!parsed.success) throw new ReportGenerationError('Career quality check: malformed coordinated output');
      if (workStyle && workStyle !== parsed.data.workStyle) throw new ReportGenerationError('Career correction changed the common work-style conclusion');
      workStyle = parsed.data.workStyle;
      const ids = parsed.data.sections.map((s) => s.id);
      if (new Set(ids).size !== ids.length || ids.some((id) => !packets.some((p) => p.id === id))) throw new ReportGenerationError('Career quality check: duplicate or unexpected section');
      for (const packet of packets) {
        const checked = validateFiveCareerDraft(packet, parsed.data.sections.find((s) => s.id === packet.id)?.draft, evidence);
        if (checked.draft) {
          const text = draftProse(checked.draft);
          const job = /\b(?:favou?rs?|recommend\w*|better suited to)\s+(?:structured\s+|salaried\s+)?(?:employment|service|a job)\b/i.test(text);
          const business = /\b(?:favou?rs?|recommend\w*|better suited to)\s+(?:independent\s+)?(?:business|entrepreneurship|self-employment)\b/i.test(text);
          if ((workStyle === 'employment' && business) || (workStyle === 'entrepreneurship' && job) || (workStyle === 'mixed' && (job !== business))) checked.problems.push('contradicts the common employment-versus-business conclusion');
        }
        if (checked.problems.length) errors.set(packet.id, checked.problems);
        else { accepted.set(packet.id, checked.draft!); errors.delete(packet.id); }
      }
    };
    const crossCheck = () => {
      const seen = new Set<string>();
      // Shared indicators are legitimate; identical interpretation paragraphs add no value.
      for (const packet of evidence.packets) {
        const draft = accepted.get(packet.id);
        if (!draft) continue;
        for (const b of Object.values(draft)) {
          const key = b.text.toLowerCase().replace(/\s+/g, ' ').trim();
          if (seen.has(key)) { errors.set(packet.id, ['repeated interpretation paragraph']); accepted.delete(packet.id); }
          else seen.add(key);
        }
      }
    };
    await run(evidence.packets);
    crossCheck(); firstPassAccepted = accepted.size;
    if (errors.size > MAX_CAREER_CORRECTIONS) throw new ReportGenerationError('Career quality check: systematic first-pass failure; no additional calls');
    for (const [id] of Array.from(errors)) { corrections++; await run([evidence.packets[id]], true); }
    crossCheck();
    if (errors.size || accepted.size !== 5) throw new ReportGenerationError('Career quality check: sections remain invalid after bounded correction');
    if (controller.signal.aborted) throw new ReportGenerationError('Career deadline exceeded');
    return { title: 'Career & Profession Report', summary: careerSummary(evidence), sections: evidence.packets.map((p) => ({ heading: p.heading, body: renderCareerSection(p, accepted.get(p.id)!) })), remedies: [] as string[], ...careerMetadata(evidence, kundli), generatedAt: asOf.toISOString() };
  } finally {
    controller.abort(); clearTimeout(timer);
    options.onMetrics?.({ calls: ledger.calls, corrections, costMicroUsd: ledger.spent + ledger.reserved, firstPassAccepted });
  }
}

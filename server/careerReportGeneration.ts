import type OpenAI from 'openai';
import { z } from 'zod';
import { ReportGenerationError } from './reportQuality';
import { buildFiveCareerEvidence, type CareerPacket } from './careerReportEvidence';
import { fiveCareerPrompt, draftProse, renderCareerSection, careerMetadata, careerSummary, validateFiveCareerDraft, schemaIssues, type CareerDraft } from './careerReportRendering';

export const CAREER_BUDGET_MICRO_USD = 250_000;
export const CAREER_DEADLINE_MS = 6 * 60_000;
export const MAX_CAREER_CORRECTIONS = 2;
/** Per section: about 330 words plus JSON and citations used ~530 tokens live; 1200 keeps seven worst-case reservations under $0.25. */
export const CAREER_OUTPUT_TOKENS = 1200;
export type CareerUsage = { prompt_tokens: number; completion_tokens: number };
export interface CareerCompletion { choices: Array<{ finish_reason?: string | null; message: { content?: string | null } }>; usage?: CareerUsage | null }
/** Evaluation only (synthetic charts): the order path never passes `onSection`, so model text is never logged. */
export interface CareerSectionAttempt { heading: string; correcting: boolean; accepted: boolean; problems: string[]; content: string | null }
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

// Echoed keys (e.g. a section heading) are dropped, not rejected.
// A section may carry its blocks directly, mirroring the SECTIONS list the prompt shows.
const envelope = z.object({
  workStyle: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.enum(['employment', 'entrepreneurship', 'mixed'])),
  sections: z.array(z.object({ id: z.union([z.number(), z.string().regex(/^\d+$/)]).pipe(z.coerce.number().int()), draft: z.unknown().optional() }).passthrough()
    .transform(({ id, draft, ...rest }) => ({ id, draft: draft ?? ('supporting' in rest || 'limiting' in rest || 'conclusion' in rest ? rest : undefined) }))).max(5),
});

export async function generateDeterministicCareer(kundli: unknown, asOf: Date, request: CareerRequester, options: { ledger?: CareerSpending; onMetrics?: (m: { calls: number; corrections: number; costMicroUsd: number; firstPassAccepted: number }) => void; onSection?: (attempt: CareerSectionAttempt) => void } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CAREER_DEADLINE_MS);
  const ledger = options.ledger ?? new CareerSpending();
  const accepted = new Map<number, CareerDraft>();
  const errors = new Map<number, string[]>();
  let corrections = 0, firstPassAccepted = 0;
  let workStyle: 'employment' | 'entrepreneurship' | 'mixed' | undefined;
  try {
    const evidence = buildFiveCareerEvidence(kundli, asOf);
    const reject = (packet: CareerPacket, problems: string[], content: string | null = null, correcting = false) => {
      errors.set(packet.id, problems); accepted.delete(packet.id);
      options.onSection?.({ heading: packet.heading, correcting, accepted: false, problems, content });
      if (process.env.NAVAGRAHA_CAREER_EVAL_DIAGNOSTICS === '1') console.error('[career-eval]', JSON.stringify({ section: packet.heading, problems }));
    };
    // One section per request. A bad response costs only its own section, which the
    // correction allowance can redo; a transport failure still ends the report.
    const run = async (packet: CareerPacket, correcting = false) => {
      if (controller.signal.aborted) throw new ReportGenerationError('Career deadline exceeded');
      const prompt = fiveCareerPrompt(evidence, [packet], { workStyle, reasons: correcting ? [{ id: packet.id, problems: errors.get(packet.id)!.slice(0, 8).map((p) => p.slice(0, 200)) }] : undefined });
      const ticket = ledger.reserve(prompt, CAREER_OUTPUT_TOKENS);
      let result: CareerCompletion;
      try { result = await boundedRequest(request, prompt, controller.signal, CAREER_OUTPUT_TOKENS); }
      catch { ledger.settle(ticket); throw new ReportGenerationError(controller.signal.aborted ? 'Career deadline exceeded' : 'Career transport failed; reservation retained'); }
      ledger.settle(ticket, result.usage);
      const content = result.choices[0]?.message.content ?? null;
      if (result.choices[0]?.finish_reason !== 'stop') return reject(packet, ['incomplete-response: output truncated or refused'], content, correcting);
      let raw: unknown;
      try { raw = JSON.parse(result.choices[0]?.message.content ?? ''); }
      catch { return reject(packet, ['invalid-json'], content, correcting); }
      const parsed = envelope.safeParse(raw);
      if (!parsed.success) return reject(packet, [`malformed output (${schemaIssues(parsed.error)})`], content, correcting);
      if (workStyle && workStyle !== parsed.data.workStyle) return reject(packet, [`changed the established work-style conclusion (${workStyle})`], content, correcting);
      workStyle = parsed.data.workStyle;
      const ids = parsed.data.sections.map((s) => s.id);
      if (new Set(ids).size !== ids.length || ids.some((id) => id !== packet.id)) return reject(packet, ['duplicate or unexpected section id'], content, correcting);
      const checked = validateFiveCareerDraft(packet, parsed.data.sections[0]?.draft, evidence);
      if (checked.draft) {
        const text = draftProse(checked.draft);
        const job = /\b(?:favou?rs?|recommend\w*|better suited to)\s+(?:structured\s+|salaried\s+)?(?:employment|service|a job)\b/i.test(text);
        const business = /\b(?:favou?rs?|recommend\w*|better suited to)\s+(?:independent\s+)?(?:business|entrepreneurship|self-employment)\b/i.test(text);
        if ((workStyle === 'employment' && business) || (workStyle === 'entrepreneurship' && job) || (workStyle === 'mixed' && (job !== business))) checked.problems.push('contradicts the common employment-versus-business conclusion');
      }
      if (checked.problems.length) reject(packet, checked.problems, content, correcting);
      else { accepted.set(packet.id, checked.draft!); errors.delete(packet.id); options.onSection?.({ heading: packet.heading, correcting, accepted: true, problems: [], content }); }
    };
    // Rule messages name chart facts and field paths, never the model's prose.
    const failureSummary = () => Array.from(errors).map(([id, problems]) => `${evidence.packets[id].heading}: ${problems.slice(0, 3).map((p) => p.slice(0, 160)).join('; ')}`).join(' | ');
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
    // Career Overview settles the work-style conclusion the other four sections are written to.
    const [overview, ...rest] = evidence.packets;
    await run(overview);
    if (!workStyle) throw new ReportGenerationError(`Career quality check: Career Overview gave no usable work-style conclusion; no additional calls. ${failureSummary()}`);
    await Promise.all(rest.map((packet) => run(packet)));
    crossCheck(); firstPassAccepted = accepted.size;
    if (errors.size > MAX_CAREER_CORRECTIONS) throw new ReportGenerationError(`Career quality check: systematic first-pass failure; no additional calls. ${failureSummary()}`);
    const rejected = Array.from(errors.keys());
    corrections = rejected.length;
    await Promise.all(rejected.map((id) => run(evidence.packets[id], true)));
    crossCheck();
    if (errors.size || accepted.size !== 5) throw new ReportGenerationError(`Career quality check: sections remain invalid after bounded correction. ${failureSummary()}`);
    if (controller.signal.aborted) throw new ReportGenerationError('Career deadline exceeded');
    return { title: 'Career & Profession Report', summary: careerSummary(evidence), sections: evidence.packets.map((p) => ({ heading: p.heading, body: renderCareerSection(p, accepted.get(p.id)!) })), remedies: [] as string[], ...careerMetadata(evidence, kundli), generatedAt: asOf.toISOString() };
  } finally {
    controller.abort(); clearTimeout(timer);
    options.onMetrics?.({ calls: ledger.calls, corrections, costMicroUsd: ledger.spent + ledger.reserved, firstPassAccepted });
  }
}

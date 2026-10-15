import type OpenAI from 'openai';
import { ReportGenerationError } from './reportQuality';
import { buildCareerReportFacts, type CareerSectionFacts } from './careerReportEvidence';
import { careerSectionPrompt, checkSectionReply, parseSectionReply, renderCareerSection, careerMetadata, careerSummary, MIN_STEPS, SYNTHESIS, type SectionText } from './careerReportRendering';

export const CAREER_BUDGET_MICRO_USD = 250_000;
export const CAREER_DEADLINE_MS = 6 * 60_000;
/** A first pass writes a whole section (at most 11 explanations, a synthesis, steps); a correction only its failed slots. With no usage reported, 5 whole sections and 5 whole re-requests stay under $0.25. */
export const CAREER_OUTPUT_TOKENS = 1400;
export const CAREER_CORRECTION_TOKENS = 900;
export type CareerUsage = { prompt_tokens: number; completion_tokens: number };
export interface CareerCompletion { choices: Array<{ finish_reason?: string | null; message: { content?: string | null } }>; usage?: CareerUsage | null }
/** Evaluation only (synthetic charts): the order path never passes `onSection`, so model text is never logged. */
export interface CareerSectionAttempt { heading: string; correcting: boolean; accepted: boolean; problems: string[]; dropped: string[]; content: string | null }
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

const WHOLE = 'response';
const sentenceKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

export async function generateDeterministicCareer(kundli: unknown, asOf: Date, request: CareerRequester, options: { ledger?: CareerSpending; onMetrics?: (m: { calls: number; corrections: number; costMicroUsd: number; firstPassAccepted: number; optionalDropped: number }) => void; onSection?: (attempt: CareerSectionAttempt) => void } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CAREER_DEADLINE_MS);
  const ledger = options.ledger ?? new CareerSpending();
  const text = new Map<string, SectionText>();
  const failing = new Map<string, Map<string, string[]>>();
  const dropped = new Map<string, Map<string, string[]>>();
  let corrections = 0, firstPassAccepted = 0;
  try {
    const evidence = buildCareerReportFacts(kundli, asOf);
    for (const s of evidence.sections) { text.set(s.key, new Map()); failing.set(s.key, new Map()); dropped.set(s.key, new Map()); }

    // One request per section, all in parallel: the work style is the code's, so no section waits on another.
    // A correction asks only for the failed slots; a whole failed response is asked for again whole.
    const run = async (section: CareerSectionFacts, only?: Map<string, string[]>) => {
      if (controller.signal.aborted) throw new ReportGenerationError('Career deadline exceeded');
      const correcting = !!only;
      const prompt = careerSectionPrompt(evidence, section, only);
      const maxTokens = only ? CAREER_CORRECTION_TOKENS : CAREER_OUTPUT_TOKENS;
      const ticket = ledger.reserve(prompt, maxTokens);
      let result: CareerCompletion;
      try { result = await boundedRequest(request, prompt, controller.signal, maxTokens); }
      catch { ledger.settle(ticket); throw new ReportGenerationError(controller.signal.aborted ? 'Career deadline exceeded' : 'Career transport failed; reservation retained'); }
      ledger.settle(ticket, result.usage);
      const content = result.choices[0]?.message.content ?? null;
      const fail = failing.get(section.key)!, drop = dropped.get(section.key)!, accepted = text.get(section.key)!;
      // A whole-section request replaces everything the section had; a correction replaces only its slots.
      if (!only) { fail.clear(); drop.clear(); accepted.clear(); }
      const parsed = result.choices[0]?.finish_reason !== 'stop' ? { problem: 'incomplete-response: output truncated or refused' } : parseSectionReply(content);
      if (!parsed.reply) fail.set(WHOLE, [parsed.problem!]);
      else {
        const checked = checkSectionReply(section, parsed.reply, evidence, only ? Array.from(only.keys()).filter((k) => k !== WHOLE) : undefined);
        fail.delete(WHOLE);
        for (const id of only ? Array.from(only.keys()) : []) fail.delete(id);
        if (checked.accepted.size && (!only || only.has('steps'))) for (const id of Array.from(accepted.keys())) if (id.startsWith('step.') && Array.from(checked.accepted.keys()).some((k) => k.startsWith('step.'))) accepted.delete(id);
        checked.accepted.forEach((v, k) => accepted.set(k, v));
        checked.required.forEach((v, k) => fail.set(k, v));
        checked.dropped.forEach((v, k) => drop.set(k, v));
      }
      const problems = Array.from(fail).map(([id, p]) => `${id}: ${p.join('; ')}`);
      options.onSection?.({ heading: section.heading, correcting, accepted: !fail.size, problems, dropped: Array.from(drop).map(([id, p]) => `${id}: ${p.join('; ')}`), content });
      if (process.env.NAVAGRAHA_CAREER_EVAL_DIAGNOSTICS === '1' && (fail.size || drop.size)) console.error('[career-eval]', JSON.stringify({ section: section.heading, correcting, required: problems, dropped: Array.from(drop.keys()) }));
    };

    // The same sentence in two places adds nothing: the later copy is dropped, or corrected when required.
    const repetition = () => {
      const seen = new Map<string, string>();
      for (const section of evidence.sections) {
        for (const [id, slot] of Array.from(text.get(section.key)!)) {
          const repeated = slot.text.split(/(?<=[.!?])\s+/).map(sentenceKey).find((k) => k.split(' ').length >= 8 && seen.has(k) && seen.get(k) !== `${section.key}/${id}`);
          if (repeated) {
            text.get(section.key)!.delete(id);
            const required = id === SYNTHESIS || id.startsWith('step.') || section.facts.find((f) => f.id === id)?.required;
            (required ? failing : dropped).get(section.key)!.set(id.startsWith('step.') ? 'steps' : id, [`repeats a sentence from ${evidence.sections.find((s) => s.key === seen.get(repeated)!.split('/')[0])!.heading}`]);
          } else for (const s of slot.text.split(/(?<=[.!?])\s+/).map(sentenceKey)) if (s.split(' ').length >= 8 && !seen.has(s)) seen.set(s, `${section.key}/${id}`);
        }
      }
    };
    // Every required explanation, the synthesis and (Guidance) the minimum of steps must be present.
    const complete = (section: CareerSectionFacts) => {
      const t = text.get(section.key)!, fail = failing.get(section.key)!;
      for (const f of section.facts) if (f.required && f.explain && !t.has(f.id) && !fail.has(f.id)) fail.set(f.id, ['missing']);
      if (!t.has(SYNTHESIS) && !fail.has(SYNTHESIS)) fail.set(SYNTHESIS, ['missing']);
      if (section.steps && Array.from(t.keys()).filter((k) => k.startsWith('step.')).length < MIN_STEPS && !fail.has('steps')) fail.set('steps', ['too few next steps']);
      return !fail.size;
    };
    const summary = () => evidence.sections.filter((s) => failing.get(s.key)!.size).map((s) => `${s.heading}: ${Array.from(failing.get(s.key)!).slice(0, 3).map(([id, p]) => `${id} ${p[0]}`.slice(0, 160)).join('; ')}`).join(' | ');

    await Promise.all(evidence.sections.map((s) => run(s)));
    repetition();
    firstPassAccepted = evidence.sections.filter(complete).length;
    const toCorrect = evidence.sections.filter((s) => failing.get(s.key)!.size);
    corrections = toCorrect.length;
    // One correction round, in parallel; anything still failing fails the order (refunded by the order path).
    await Promise.all(toCorrect.map((s) => { const f = failing.get(s.key)!; return f.has(WHOLE) ? run(s) : run(s, new Map(f)); }));
    if (toCorrect.length) repetition();
    if (!evidence.sections.every(complete)) throw new ReportGenerationError(`Career quality check: required explanations still invalid after one correction round. ${summary()}`);
    if (controller.signal.aborted) throw new ReportGenerationError('Career deadline exceeded');
    return { title: 'Career & Profession Report', summary: careerSummary(evidence), sections: evidence.sections.map((s) => ({ heading: s.heading, body: renderCareerSection(s, text.get(s.key)!) })), remedies: [] as string[], ...careerMetadata(evidence, kundli), generatedAt: asOf.toISOString() };
  } finally {
    controller.abort(); clearTimeout(timer);
    options.onMetrics?.({ calls: ledger.calls, corrections, costMicroUsd: ledger.spent + ledger.reserved, firstPassAccepted, optionalDropped: Array.from(dropped.values()).reduce((n, m) => n + m.size, 0) });
  }
}

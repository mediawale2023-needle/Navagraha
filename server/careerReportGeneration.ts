import type OpenAI from 'openai';
import { GRAHAS, SIGN_NAMES } from '@shared/v3/canonical';
import { ReportGenerationError } from './reportQuality';
import { buildCareerReportFacts, type CareerSectionFacts } from './careerReportEvidence';
import { careerSectionPrompt, checkSectionReply, parseSectionReply, renderCareerSection, careerGlossarySection, careerMetadata, careerSummary, MIN_STEPS, SYNTHESIS, type SectionText } from './careerReportRendering';

export const CAREER_BUDGET_MICRO_USD = 250_000;
export const CAREER_DEADLINE_MS = 6 * 60_000;
/** A first pass writes a whole section (at most 11 explanations, a synthesis, steps); a correction only its failed slots. With no usage reported, 5 whole sections and 5 whole re-requests stay under $0.25. */
export const CAREER_OUTPUT_TOKENS = 1400;
export const CAREER_CORRECTION_TOKENS = 900;
export type CareerUsage = { prompt_tokens: number; completion_tokens: number };
export interface CareerCompletion { choices: Array<{ finish_reason?: string | null; message: { content?: string | null } }>; usage?: CareerUsage | null }
/** Evaluation only (synthetic charts): the order path never passes `onSection`, so model text is never logged. */
export interface CareerSectionAttempt { heading: string; correcting: boolean; accepted: boolean; problems: string[]; dropped: string[]; advisories: string[]; content: string | null }
export type CareerRequester = (prompt: string, options: { signal: AbortSignal; maxTokens: number }) => Promise<CareerCompletion>;

/** Extra attempts for a transient transport error (no status, 408, 409, 429, 5xx); other errors fail at once. */
export const CAREER_TRANSPORT_RETRIES = 2;
/** Extra attempts for a truncated, refused or unparseable reply: a formatting fault, not an astrological one. */
export const CAREER_FORMAT_RETRIES = 1;
/** Rounds of targeted correction for required slots that fail validation. */
export const CAREER_CORRECTION_ROUNDS = 2;
export const CAREER_RETRY_DELAYS_MS = [1_000, 3_000] as const;

export type CareerAttemptCategory = 'accepted' | 'validation' | 'truncated' | 'malformed' | 'transport' | 'deadline' | 'budget';
/** One request's outcome. Rule codes carry no chart facts, birth details or model text (`careerRuleCode`). */
export interface CareerAttemptDiagnostic {
  section: string;
  phase: 'first' | `correction-${number}`;
  attempt: number;
  category: CareerAttemptCategory;
  rules: string[];
  promptTokens: number | null;
  completionTokens: number | null;
  costMicroUsd: number;
  durationMs: number;
}
export interface CareerMetrics {
  calls: number; corrections: number; costMicroUsd: number; firstPassAccepted: number; optionalDropped: number; advisories: number;
  correctionRounds: number; transportRetries: number; formatRetries: number; durationMs: number;
  outcome: 'completed' | 'failed'; failureCategory: CareerAttemptCategory | 'quality' | null;
  attempts: CareerAttemptDiagnostic[];
}

const NAMED = new RegExp(`\\b(?:${[...GRAHAS, ...SIGN_NAMES].join('|')})(?:'s)?\\b`, 'gi');
/** A validator problem reduced to its rule: quotes, parentheses, planet and sign names and numbers removed. */
export function careerRuleCode(problem: string): string {
  return problem.replace(/"[^"]*"|“[^”]*”|‘[^’]*’/g, ' ').replace(/\([^)]*\)/g, ' ').replace(NAMED, ' ').replace(/\d+(?:st|nd|rd|th)?/gi, ' ')
    .toLowerCase().replace(/[^a-z\- ]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 8).join(' ') || 'unspecified';
}

/** Retry only what a later attempt can fix; an HTTP status the request itself caused (400, 401, 403, 404) cannot be. */
function transientError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status !== 'number' || status === 408 || status === 409 || status === 429 || status >= 500;
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new ReportGenerationError('Career deadline exceeded'));
    const onAbort = () => { clearTimeout(timer); reject(new ReportGenerationError('Career deadline exceeded')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

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
  /** Settles a reservation and returns what it cost (0 if already settled). */
  settle(id: number, usage?: CareerUsage | null): number {
    const reservation = this.tickets.get(id);
    if (reservation === undefined) return 0;
    this.tickets.delete(id); this.reserved -= reservation;
    const valid = usage && Number.isFinite(usage.prompt_tokens) && usage.prompt_tokens >= 0 && Number.isFinite(usage.completion_tokens) && usage.completion_tokens >= 0;
    const cost = valid ? Math.ceil(usage.prompt_tokens * 2.5 + usage.completion_tokens * 10) : reservation;
    this.spent += cost;
    return cost;
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
const REPETITION_STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'because', 'but', 'by', 'can', 'for', 'from', 'in', 'is', 'it', 'may', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'with', 'you', 'your']);
const repetitionWords = (sentence: string) => sentenceKey(sentence).split(' ').filter((word) => word.length > 2 && !REPETITION_STOP_WORDS.has(word));
const repetitionThemes = (sentence: string) => {
  const themes = [
    /\b(disciplin\w*|patien\w*|persever\w*|endurance|steady effort)\b/i.test(sentence) && 'endurance',
    /\b(adapt\w*|flexib\w*)\b/i.test(sentence) && 'adaptability',
    /\b(debilitat\w*|weak\w*|challeng\w*|obstacle\w*|delay\w*)\b/i.test(sentence) && 'challenge',
  ].filter(Boolean) as string[];
  const planets = GRAHAS.filter((planet) => new RegExp(`\\b${planet}\\b`, 'i').test(sentence));
  return new Set(planets.flatMap((planet) => themes.map((theme) => `${planet}:${theme}`)));
};

/** Catch close paraphrases as well as verbatim copies, without treating a shared planet name as repetition. */
export function repeatsCareerInterpretation(first: string, second: string): boolean {
  const a = new Set(repetitionWords(first)), b = new Set(repetitionWords(second));
  if (a.size < 7 || b.size < 7) return false;
  const shared = Array.from(a).filter((word) => b.has(word)).length;
  const similarity = shared / new Set(Array.from(a).concat(Array.from(b))).size;
  // A very close lexical frame is repetitive even when it changes the subject. Looser matches are rejected
  // only when they repeat the same planet-specific theme, avoiding false positives from ordinary career terms.
  if (shared >= 12 && similarity >= 0.62) return true;
  const firstThemes = repetitionThemes(first), secondThemes = repetitionThemes(second);
  return Array.from(firstThemes).some((theme) => secondThemes.has(theme)) && shared >= 6 && similarity >= 0.55;
}

export async function generateDeterministicCareer(kundli: unknown, asOf: Date, request: CareerRequester, options: { ledger?: CareerSpending; onMetrics?: (m: CareerMetrics) => void; onSection?: (attempt: CareerSectionAttempt) => void; retryDelaysMs?: readonly number[] } = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CAREER_DEADLINE_MS);
  const ledger = options.ledger ?? new CareerSpending();
  const delays = options.retryDelaysMs ?? CAREER_RETRY_DELAYS_MS;
  const text = new Map<string, SectionText>();
  const failing = new Map<string, Map<string, string[]>>();
  const dropped = new Map<string, Map<string, string[]>>();
  const attempts: CareerAttemptDiagnostic[] = [];
  const attemptNo = new Map<string, number>();
  let corrections = 0, firstPassAccepted = 0, advisoryCount = 0, correctionRounds = 0, transportRetries = 0, formatRetries = 0;
  let outcome: CareerMetrics['outcome'] = 'failed', failureCategory: CareerMetrics['failureCategory'] = null;
  const rulesOf = (m: Map<string, string[]>) => Array.from(m).map(([id, p]) => `${id}:${careerRuleCode(p[0] ?? '')}`);
  try {
    const evidence = buildCareerReportFacts(kundli, asOf);
    for (const s of evidence.sections) { text.set(s.key, new Map()); failing.set(s.key, new Map()); dropped.set(s.key, new Map()); }

    // One request per section, all in parallel: the work style is the code's, so no section waits on another.
    // A correction asks only for the failed slots; a whole failed response is asked for again whole.
    // Transport faults and unreadable replies are retried here, within the deadline and the ledger, before the
    // reply is judged; only a readable reply's astrology can fail a section.
    const run = async (section: CareerSectionFacts, only: Map<string, string[]> | undefined, phase: CareerAttemptDiagnostic['phase']) => {
      const correcting = !!only;
      const prompt = careerSectionPrompt(evidence, section, only);
      const maxTokens = only ? CAREER_CORRECTION_TOKENS : CAREER_OUTPUT_TOKENS;
      let transportTries = 0, formatTries = 0;
      const record = (category: CareerAttemptCategory, rules: string[], t0: number, usage: CareerUsage | null | undefined, cost: number) => {
        const attempt = (attemptNo.get(section.key) ?? 0) + 1; attemptNo.set(section.key, attempt);
        attempts.push({ section: section.heading, phase, attempt, category, rules, promptTokens: usage?.prompt_tokens ?? null, completionTokens: usage?.completion_tokens ?? null, costMicroUsd: cost, durationMs: Date.now() - t0 });
      };
      for (;;) {
        if (controller.signal.aborted) throw new ReportGenerationError('Career deadline exceeded');
        const t0 = Date.now();
        let ticket: number;
        try { ticket = ledger.reserve(prompt, maxTokens); }
        catch (err) { record('budget', [], t0, null, 0); throw err; }
        let result: CareerCompletion;
        try { result = await boundedRequest(request, prompt, controller.signal, maxTokens); }
        catch (err) {
          const charged = ledger.settle(ticket);
          if (controller.signal.aborted) { record('deadline', [], t0, null, charged); throw new ReportGenerationError('Career deadline exceeded'); }
          const status = (err as { status?: unknown } | null)?.status;
          record('transport', [typeof status === 'number' ? `http-${status}` : 'no-status'], t0, null, charged);
          if (transportTries < CAREER_TRANSPORT_RETRIES && transientError(err)) {
            transportTries++; transportRetries++;
            await pause(delays[Math.min(transportTries, delays.length) - 1] ?? 0, controller.signal);
            continue;
          }
          throw new ReportGenerationError('Career transport failed; reservation retained');
        }
        // This attempt's own charge: parallel sections settle concurrently, so a ledger difference would include theirs.
        const cost = ledger.settle(ticket, result.usage);
        const finish = result.choices[0]?.finish_reason;
        const content = result.choices[0]?.message.content ?? null;
        const parsed = finish !== 'stop' ? { problem: 'incomplete-response: output truncated or refused' } : parseSectionReply(content);
        if (!parsed.reply && formatTries < CAREER_FORMAT_RETRIES) {
          formatTries++; formatRetries++;
          record(finish !== 'stop' ? 'truncated' : 'malformed', [`${WHOLE}:${careerRuleCode(parsed.problem!)}`], t0, result.usage, cost);
          continue;
        }
        processReply(section, only, correcting, content, parsed, (category, rules) => record(category, rules, t0, result.usage, cost), finish);
        return;
      }
    };
    const processReply = (section: CareerSectionFacts, only: Map<string, string[]> | undefined, correcting: boolean, content: string | null, parsed: ReturnType<typeof parseSectionReply>, done: (category: CareerAttemptCategory, rules: string[]) => void, finish: string | null | undefined) => {
      const fail = failing.get(section.key)!, drop = dropped.get(section.key)!, accepted = text.get(section.key)!;
      // A whole-section request replaces everything the section had; a correction replaces only its slots.
      if (!only) { fail.clear(); drop.clear(); accepted.clear(); }
      let advisories: string[] = [];
      if (!parsed.reply) fail.set(WHOLE, [parsed.problem!]);
      else {
        const checked = checkSectionReply(section, parsed.reply, evidence, only ? Array.from(only.keys()).filter((k) => k !== WHOLE) : undefined);
        fail.delete(WHOLE);
        for (const id of only ? Array.from(only.keys()) : []) fail.delete(id);
        if (checked.accepted.size && (!only || only.has('steps'))) for (const id of Array.from(accepted.keys())) if (id.startsWith('step.') && Array.from(checked.accepted.keys()).some((k) => k.startsWith('step.'))) accepted.delete(id);
        checked.accepted.forEach((v, k) => accepted.set(k, v));
        checked.required.forEach((v, k) => fail.set(k, v));
        checked.dropped.forEach((v, k) => drop.set(k, v));
        advisoryCount += checked.advisories.size;
        advisories = Array.from(checked.advisories).map(([id, a]) => `${id}: ${a.join('; ')}`);
      }
      const problems = Array.from(fail).map(([id, p]) => `${id}: ${p.join('; ')}`);
      options.onSection?.({ heading: section.heading, correcting, accepted: !fail.size, problems, dropped: Array.from(drop).map(([id, p]) => `${id}: ${p.join('; ')}`), advisories, content });
      if (process.env.NAVAGRAHA_CAREER_EVAL_DIAGNOSTICS === '1' && (fail.size || drop.size)) console.error('[career-eval]', JSON.stringify({ section: section.heading, correcting, required: problems, dropped: Array.from(drop.keys()) }));
      done(!parsed.reply ? (finish !== 'stop' ? 'truncated' : 'malformed') : fail.size ? 'validation' : 'accepted', rulesOf(fail));
    };

    // The same sentence in two places adds nothing: the later copy is dropped, or corrected when required.
    const repetition = () => {
      const seen = new Map<string, { location: string; sentence: string }>();
      for (const section of evidence.sections) {
        for (const [id, slot] of Array.from(text.get(section.key)!)) {
          const sentences = slot.text.split(/(?<=[.!?])\s+/).filter((s) => repetitionWords(s).length >= 7);
          const repeated = sentences.map((sentence) => {
            const exact = seen.get(sentenceKey(sentence));
            if (exact && exact.location !== `${section.key}/${id}`) return exact;
            return Array.from(seen.values()).find((prior) => prior.location !== `${section.key}/${id}` && repeatsCareerInterpretation(prior.sentence, sentence));
          }).find(Boolean);
          if (repeated) {
            text.get(section.key)!.delete(id);
            const required = id === SYNTHESIS || id.startsWith('step.') || section.facts.find((f) => f.id === id)?.required;
            const source = evidence.sections.find((s) => s.key === repeated.location.split('/')[0])!.heading;
            (required ? failing : dropped).get(section.key)!.set(id.startsWith('step.') ? 'steps' : id, [`repeats an interpretation from ${source}; explain this fact with distinct reasoning`]);
          } else for (const sentence of sentences) {
            const key = sentenceKey(sentence);
            if (!seen.has(key)) seen.set(key, { location: `${section.key}/${id}`, sentence });
          }
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
    // Rule codes only: the failure reason is stored and logged, so it names no chart fact or model text.
    const summary = () => evidence.sections.filter((s) => failing.get(s.key)!.size).map((s) => `${s.heading}: ${Array.from(failing.get(s.key)!).slice(0, 3).map(([id, p]) => `${id} ${careerRuleCode(p[0] ?? '')}`).join('; ')}`).join(' | ');

    await Promise.all(evidence.sections.map((s) => run(s, undefined, 'first')));
    repetition();
    firstPassAccepted = evidence.sections.filter(complete).length;
    // Up to CAREER_CORRECTION_ROUNDS targeted rounds, in parallel; an accepted section is never requested again
    // (unless a later section's correction makes it repeat itself). Anything still failing fails the order
    // (refunded by the order path).
    for (let round = 1; round <= CAREER_CORRECTION_ROUNDS; round++) {
      const toCorrect = evidence.sections.filter((s) => failing.get(s.key)!.size);
      if (!toCorrect.length) break;
      correctionRounds = round; corrections += toCorrect.length;
      await Promise.all(toCorrect.map((s) => { const f = failing.get(s.key)!; return f.has(WHOLE) ? run(s, undefined, `correction-${round}`) : run(s, new Map(f), `correction-${round}`); }));
      repetition();
      evidence.sections.forEach(complete);
    }
    if (!evidence.sections.every(complete)) {
      failureCategory = 'quality';
      throw new ReportGenerationError(`Career quality check: required explanations still invalid after ${correctionRounds} correction round${correctionRounds === 1 ? '' : 's'}. ${summary()}`);
    }
    if (controller.signal.aborted) throw new ReportGenerationError('Career deadline exceeded');
    outcome = 'completed';
    const sections = evidence.sections.map((s) => ({ heading: s.heading, body: renderCareerSection(s, text.get(s.key)!) }));
    const glossary = careerGlossarySection(sections);
    return { title: 'Career & Profession Report', summary: careerSummary(evidence), sections: glossary ? [...sections, glossary] : sections, remedies: [] as string[], ...careerMetadata(evidence, kundli), generatedAt: asOf.toISOString() };
  } catch (err) {
    if (!failureCategory) {
      const message = String((err as Error)?.message ?? '');
      failureCategory = /deadline/i.test(message) ? 'deadline' : /ceiling/i.test(message) ? 'budget' : /transport/i.test(message) ? 'transport' : null;
    }
    throw err;
  } finally {
    controller.abort(); clearTimeout(timer);
    options.onMetrics?.({
      calls: ledger.calls, corrections, costMicroUsd: ledger.spent + ledger.reserved, firstPassAccepted,
      optionalDropped: Array.from(dropped.values()).reduce((n, m) => n + m.size, 0), advisories: advisoryCount,
      correctionRounds, transportRetries, formatRetries, durationMs: Date.now() - started, outcome, failureCategory, attempts,
    });
  }
}

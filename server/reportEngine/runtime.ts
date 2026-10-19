import type OpenAI from 'openai';
import { ReportGenerationError } from '../reportQuality';

export const REPORT_BUDGET_MICRO_USD = 250_000;
export const REPORT_DEADLINE_MS = 6 * 60_000;
export const REPORT_TRANSPORT_RETRIES = 2;
export const REPORT_FORMAT_RETRIES = 1;

export type ReportUsage = { prompt_tokens: number; completion_tokens: number };
export interface ReportCompletion { choices: Array<{ finish_reason?: string | null; message: { content?: string | null } }>; usage?: ReportUsage | null }
export type ReportRequester = (prompt: string, options: { signal: AbortSignal; maxTokens: number }) => Promise<ReportCompletion>;

/** Shared reservation ledger. Reservations make parallel admission atomic and conservatively charge missing usage. */
export class ReportSpending {
  spent = 0;
  reserved = 0;
  calls = 0;
  private tickets = new Map<number, number>();

  constructor(readonly limit = REPORT_BUDGET_MICRO_USD) {
    if (!Number.isSafeInteger(limit) || limit < 0 || limit > REPORT_BUDGET_MICRO_USD) throw new ReportGenerationError('Invalid report spending limit');
  }

  reserve(prompt: string, maxTokens: number): number {
    if (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 6000) throw new ReportGenerationError('Invalid report output allowance');
    // GPT-4o: micro-dollars; UTF-8 bytes conservatively bound BPE input tokens.
    const cost = Math.ceil((Buffer.byteLength(prompt, 'utf8') + 128) * 2.5 + maxTokens * 10);
    if (this.spent + this.reserved + cost > this.limit) throw new ReportGenerationError('Report spending ceiling reached');
    const id = ++this.calls;
    this.tickets.set(id, cost);
    this.reserved += cost;
    return id;
  }

  settle(id: number, usage?: ReportUsage | null): number {
    const reservation = this.tickets.get(id);
    if (reservation === undefined) return 0;
    this.tickets.delete(id);
    this.reserved -= reservation;
    const valid = usage && Number.isFinite(usage.prompt_tokens) && usage.prompt_tokens >= 0 && Number.isFinite(usage.completion_tokens) && usage.completion_tokens >= 0;
    const cost = valid ? Math.ceil(usage.prompt_tokens * 2.5 + usage.completion_tokens * 10) : reservation;
    this.spent += cost;
    if (this.spent > this.limit) throw new ReportGenerationError('Report spending ceiling exceeded by provider usage');
    return cost;
  }
}

export const openAiReportRequester = (client: OpenAI): ReportRequester => (prompt, { signal, maxTokens }) => client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: prompt }],
  response_format: {
    type: 'json_schema',
    json_schema: {
      name: 'universal_report_sections', strict: true,
      schema: {
        type: 'object', additionalProperties: false,
        required: ['summary', 'summaryEvidenceIds', 'sections', 'remedies'],
        properties: {
          summary: { type: 'string' },
          summaryEvidenceIds: { type: 'array', items: { type: 'string' } },
          sections: {
            type: 'array', items: {
              type: 'object', additionalProperties: false, required: ['heading', 'body', 'evidenceIds', 'evidenceLinks'],
              properties: {
                heading: { type: 'string' }, body: { type: 'string' },
                evidenceIds: { type: 'array', items: { type: 'string' } },
                evidenceLinks: {
                  type: 'array', items: {
                    type: 'object', additionalProperties: false, required: ['evidenceId', 'conclusion', 'explanation'],
                    properties: { evidenceId: { type: 'string' }, conclusion: { type: 'string' }, explanation: { type: 'string' } },
                  },
                },
              },
            },
          },
          remedies: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
  max_tokens: maxTokens,
}, { signal, maxRetries: 0, timeout: 120_000 });

const transient = (err: unknown) => {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status !== 'number' || status === 408 || status === 409 || status === 429 || status >= 500;
};

export class ReportRuntime {
  readonly controller = new AbortController();
  readonly spending: ReportSpending;
  readonly startedAt = Date.now();
  transportRetries = 0;
  formatRetries = 0;
  correctionCalls = 0;
  private timer: NodeJS.Timeout;

  constructor(readonly request: ReportRequester, options: { spending?: ReportSpending; deadlineMs?: number } = {}) {
    this.spending = options.spending ?? new ReportSpending();
    this.timer = setTimeout(() => this.controller.abort(), options.deadlineMs ?? REPORT_DEADLINE_MS);
  }

  async complete(prompt: string, maxTokens: number): Promise<string> {
    for (let attempt = 0;; attempt++) {
      if (this.controller.signal.aborted) throw new ReportGenerationError('Report generation deadline exceeded');
      const ticket = this.spending.reserve(prompt, maxTokens);
      try {
        let abort: (() => void) | undefined;
        const deadline = new Promise<never>((_, reject) => {
          abort = () => reject(new ReportGenerationError('Report generation deadline exceeded'));
          this.controller.signal.addEventListener('abort', abort, { once: true });
        });
        const reply = await Promise.race([this.request(prompt, { signal: this.controller.signal, maxTokens }), deadline])
          .finally(() => { if (abort) this.controller.signal.removeEventListener('abort', abort); });
        this.spending.settle(ticket, reply.usage);
        if (reply.choices[0]?.finish_reason !== 'stop') throw new ReportGenerationError('Model output was truncated or refused');
        return reply.choices[0]?.message.content ?? '';
      } catch (err) {
        this.spending.settle(ticket);
        if (this.controller.signal.aborted) throw new ReportGenerationError('Report generation deadline exceeded');
        if (attempt < REPORT_TRANSPORT_RETRIES && transient(err) && !(err instanceof ReportGenerationError)) {
          this.transportRetries++;
          continue;
        }
        throw err;
      }
    }
  }

  close() { clearTimeout(this.timer); }
}

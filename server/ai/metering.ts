/**
 * Every OpenAI call goes through a client from `createOpenAI()`. It bounds each call (an
 * output-token cap on every request, an input-size ceiling, one SDK retry), and records
 * tokens and estimated cost per subject (user, astrologer, system), day and feature, in the
 * shared database and the audit log. Budgets are checked per request by `aiBudget`.
 *
 * The subject and feature come from the request that caused the call (`aiRequestContext`
 * middleware, AsyncLocalStorage), so background work started by a request is attributed to it.
 */
import OpenAI from "openai";
import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";
import { audit } from "../audit";

export interface AiContext {
  subject: string;
  feature: string;
}

export const aiContext = new AsyncLocalStorage<AiContext>();

// USD per million tokens (input, output). Unknown models are costed as gpt-4o.
const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
};
const priceOf = (model: string) => PRICES[model] ?? PRICES["gpt-4o"];

/** Output cap for a request that sets none, and the ceiling no request may exceed. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 1500;
export const MAX_OUTPUT_TOKENS = 16000;
/** Prompt size ceiling (characters, roughly 100k tokens): larger prompts are refused, not sent. */
export const MAX_INPUT_CHARS = 400_000;
export const SDK_MAX_RETRIES = 1;

export class AiInputTooLargeError extends Error {
  constructor(chars: number) {
    super(`AI prompt too large (${chars} characters)`);
    this.name = "AiInputTooLargeError";
  }
}

export function estimateCostMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceOf(model);
  return Math.round(inputTokens * p.input + outputTokens * p.output);
}

const promptChars = (messages: unknown): number =>
  Array.isArray(messages)
    ? messages.reduce((n, m: any) => n + (typeof m?.content === "string" ? m.content.length : JSON.stringify(m?.content ?? "").length), 0)
    : 0;

/** The request as sent: output capped, prompt size checked. Exported for tests. */
export function boundedParams<T extends { max_tokens?: number | null; messages?: unknown; stream?: boolean | null }>(params: T): T {
  const chars = promptChars(params.messages);
  if (chars > MAX_INPUT_CHARS) throw new AiInputTooLargeError(chars);
  const requested = typeof params.max_tokens === "number" && params.max_tokens > 0 ? params.max_tokens : DEFAULT_MAX_OUTPUT_TOKENS;
  const bounded: any = { ...params, max_tokens: Math.min(requested, MAX_OUTPUT_TOKENS) };
  if (params.stream) bounded.stream_options = { ...(bounded.stream_options ?? {}), include_usage: true };
  return bounded;
}

const today = () => new Date().toISOString().slice(0, 10);

let storageModule: Promise<typeof import("../storage")> | undefined;
const loadStorage = () => (storageModule ??= import("../storage"));

async function record(ctx: AiContext | undefined, model: string, usage: { prompt_tokens?: number; completion_tokens?: number } | undefined | null): Promise<void> {
  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  const costMicroUsd = estimateCostMicroUsd(model, inputTokens, outputTokens);
  const subject = ctx?.subject ?? "system";
  const feature = ctx?.feature ?? "background";
  audit("ai.usage", { subject, feature, model, inputTokens, outputTokens, costUsd: costMicroUsd / 1e6 });
  try {
    const { storage } = await loadStorage();
    if (typeof storage.recordAiUsage === "function") {
      await storage.recordAiUsage({ subject, day: today(), feature, inputTokens, outputTokens, costMicroUsd });
    }
  } catch (err: any) {
    console.error("[ai] usage not recorded:", err?.message ?? err);
  }
}

async function* meteredStream(stream: AsyncIterable<any>, ctx: AiContext | undefined, model: string): AsyncGenerator<any> {
  let usage: any = null;
  try {
    for await (const chunk of stream) {
      if (chunk?.usage) usage = chunk.usage;
      yield chunk;
    }
  } finally {
    await record(ctx, model, usage);
  }
}

/** An OpenAI client whose chat completions are bounded and metered. */
export function createOpenAI(apiKey = process.env.OPENAI_API_KEY): OpenAI {
  const client = new OpenAI({ apiKey, maxRetries: SDK_MAX_RETRIES, timeout: 120_000 });
  const completions: any = client.chat?.completions;
  if (!completions?.create) return client;
  const create = completions.create.bind(completions);
  completions.create = async (params: any, options?: any) => {
    const bounded = boundedParams(params);
    const ctx = aiContext.getStore();
    const res = await create(bounded, options);
    if (bounded.stream) return meteredStream(res, ctx, String(bounded.model));
    void record(ctx, String(bounded.model), res?.usage);
    return res;
  };
  return client;
}

// ─── Per-request attribution and daily budgets ────────────────────────────────

const featureOf = (path: string) =>
  path.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/:id").replace(/\/\d+(?=\/|$)/g, "/:n").slice(0, 80);

/** Attributes model calls made while handling a request to its user or astrologer. */
export function aiRequestContext(req: Request, _res: Response, next: NextFunction): void {
  const userId = (req as any).user?.id;
  const astrologerId = (req as any).session?.astrologerId;
  const subject = userId ? `user:${userId}` : astrologerId ? `astrologer:${astrologerId}` : "anonymous";
  aiContext.run({ subject, feature: featureOf(req.path) }, next);
}

const envNumber = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

/** Daily limits on free (unpaid) AI use per subject; paid report generation is not counted. */
export const aiDailyLimits = () => ({
  user: { calls: envNumber("AI_USER_DAILY_CALLS", 400), costMicroUsd: envNumber("AI_USER_DAILY_COST_USD", 0.5) * 1e6 },
  astrologer: { calls: envNumber("AI_ASTROLOGER_DAILY_CALLS", 300), costMicroUsd: envNumber("AI_ASTROLOGER_DAILY_COST_USD", 5) * 1e6 },
  admin: { calls: envNumber("AI_ADMIN_DAILY_CALLS", 300), costMicroUsd: envNumber("AI_ADMIN_DAILY_COST_USD", 5) * 1e6 },
});

/**
 * Refuses a request with 429 when its subject has used today's AI budget. Shared across
 * instances (database), unlike the in-memory per-IP rate limiters.
 */
export function aiBudget(kind: "user" | "astrologer" | "admin") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const subject = kind === "astrologer" ? `astrologer:${(req as any).session?.astrologerId}` : `user:${(req as any).user?.id}`;
    try {
      const { storage } = await loadStorage();
      const used = await storage.getAiUsageToday(subject, today());
      const limit = aiDailyLimits()[kind];
      if (used.calls >= limit.calls || used.costMicroUsd >= limit.costMicroUsd) {
        audit("ai.budget_refused", { subject, feature: featureOf(req.path), calls: used.calls, costUsd: used.costMicroUsd / 1e6 });
        return res.status(429).json({ code: "ai_daily_limit", message: "You have reached today's limit for AI answers. Please try again tomorrow." });
      }
    } catch (err: any) {
      // The budget is a cost guard, not an access control: an unreadable meter does not block.
      console.error("[ai] budget check failed:", err?.message ?? err);
    }
    next();
  };
}

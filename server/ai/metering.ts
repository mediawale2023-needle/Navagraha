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
  /** Which daily limits apply; null = recorded only (paid report generation, background work). */
  budget: "user" | "astrologer" | "admin" | null;
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

export class AiBudgetExceededError extends Error {
  constructor(public subject: string) {
    super("Daily AI budget reached");
    this.name = "AiBudgetExceededError";
  }
}

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

/**
 * The most a request can cost: every prompt character counted as half a token (generous for
 * English, fair for Devanagari) and the full output cap. Reserved before the call, then
 * corrected to the real cost, so concurrent calls cannot overrun the dollar budget.
 */
export function worstCaseCostMicroUsd(model: string, params: { messages?: unknown; max_tokens?: number | null }): number {
  return estimateCostMicroUsd(model, Math.ceil(promptChars(params.messages) / 2), params.max_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS);
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

interface Reservation { subject: string; day: string; microUsd: number }

/**
 * Takes the request's worst-case cost from its subject's daily budget in one conditional
 * statement (dollar limit first; the call count is only a flood guard set above what the
 * dollar budget allows). Throws AiBudgetExceededError, before anything is sent, when it does
 * not fit. Every model call passes here, whichever endpoint made it.
 */
async function reserveBudget(ctx: AiContext | undefined, model: string, params: any): Promise<Reservation | null> {
  if (!ctx?.budget) return null;
  const limit = aiDailyLimits()[ctx.budget];
  const reservation = { subject: ctx.subject, day: today(), microUsd: worstCaseCostMicroUsd(model, params) };
  const { storage } = await loadStorage();
  if (typeof storage.reserveAiBudget !== "function") return null;
  const ok = await storage.reserveAiBudget({ ...reservation, costLimitMicroUsd: limit.costMicroUsd, callLimit: limit.calls });
  if (!ok) {
    audit("ai.budget_refused", { subject: ctx.subject, feature: ctx.feature, model, at: "call" });
    throw new AiBudgetExceededError(ctx.subject);
  }
  return reservation;
}

async function settleBudget(r: Reservation | null, actualMicroUsd: number): Promise<void> {
  if (!r) return;
  try {
    const { storage } = await loadStorage();
    await storage.settleAiBudget({ subject: r.subject, day: r.day, reservedMicroUsd: r.microUsd, actualMicroUsd });
  } catch (err: any) {
    // Left at the reserved (worst-case) cost: the budget errs on the side of spending less.
    console.error("[ai] budget not settled:", err?.message ?? err);
  }
}

async function record(ctx: AiContext | undefined, model: string, usage: { prompt_tokens?: number; completion_tokens?: number } | undefined | null, reservation: Reservation | null = null): Promise<void> {
  const inputTokens = usage?.prompt_tokens ?? 0;
  const outputTokens = usage?.completion_tokens ?? 0;
  const costMicroUsd = estimateCostMicroUsd(model, inputTokens, outputTokens);
  // A response without usage keeps its worst-case reservation.
  await settleBudget(reservation, usage ? costMicroUsd : reservation?.microUsd ?? 0);
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

async function* meteredStream(stream: AsyncIterable<any>, ctx: AiContext | undefined, model: string, reservation: Reservation | null): AsyncGenerator<any> {
  let usage: any = null;
  try {
    for await (const chunk of stream) {
      if (chunk?.usage) usage = chunk.usage;
      yield chunk;
    }
  } finally {
    await record(ctx, model, usage, reservation);
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
    const model = String(bounded.model);
    const reservation = await reserveBudget(ctx, model, bounded);
    let res: any;
    try {
      res = await create(bounded, options);
    } catch (err) {
      await settleBudget(reservation, 0);
      throw err;
    }
    if (bounded.stream) return meteredStream(res, ctx, model, reservation);
    void record(ctx, model, res?.usage, reservation);
    return res;
  };
  return client;
}

// ─── Per-request attribution and daily budgets ────────────────────────────────

const featureOf = (path: string) =>
  path.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/:id").replace(/\/\d+(?=\/|$)/g, "/:n").slice(0, 80);

/**
 * Attributes model calls made while handling a request (and work it starts) to its user,
 * astrologer or admin, and chooses the budget they draw on. Paid report generation is
 * recorded but not budgeted; unauthenticated requests share one "anonymous" budget.
 */
export function aiContextFor(req: Pick<Request, "path"> & { user?: any; session?: any }): AiContext {
  const userId = req.user?.id;
  const astrologerId = req.session?.astrologerId;
  const feature = featureOf(req.path);
  const lower = req.path.toLowerCase();
  if (lower.startsWith("/api/reports")) return { subject: userId ? `user:${userId}` : "anonymous", feature, budget: null };
  if (userId && lower.startsWith("/api/admin")) return { subject: `admin:${userId}`, feature, budget: "admin" };
  // One browser can hold a user and an astrologer sign-in at once: astrologer routes are the astrologer's.
  if (astrologerId && lower.startsWith("/api/astrologer")) return { subject: `astrologer:${astrologerId}`, feature, budget: "astrologer" };
  if (userId) return { subject: `user:${userId}`, feature, budget: "user" };
  if (astrologerId) return { subject: `astrologer:${astrologerId}`, feature, budget: "astrologer" };
  return { subject: "anonymous", feature, budget: "user" };
}

export function aiRequestContext(req: Request, _res: Response, next: NextFunction): void {
  aiContext.run(aiContextFor(req as any), next);
}

const envNumber = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

/** Daily limits on free (unpaid) AI use per subject; paid report generation is not counted. */
export const aiDailyLimits = () => ({
  // The dollar limit governs; the call caps are flood guards set above what it allows in normal use.
  user: { calls: envNumber("AI_USER_DAILY_CALLS", 2000), costMicroUsd: envNumber("AI_USER_DAILY_COST_USD", 0.5) * 1e6 },
  astrologer: { calls: envNumber("AI_ASTROLOGER_DAILY_CALLS", 300), costMicroUsd: envNumber("AI_ASTROLOGER_DAILY_COST_USD", 5) * 1e6 },
  admin: { calls: envNumber("AI_ADMIN_DAILY_CALLS", 300), costMicroUsd: envNumber("AI_ADMIN_DAILY_COST_USD", 5) * 1e6 },
});

/**
 * Refuses a request with 429 when its subject has used today's AI budget. Shared across
 * instances (database), unlike the in-memory per-IP rate limiters.
 */
export function aiBudget(kind: "user" | "astrologer" | "admin") {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ctx = aiContextFor(req as any);
    try {
      const { storage } = await loadStorage();
      const used = await storage.getAiUsageToday(ctx.subject, today());
      const limit = aiDailyLimits()[ctx.budget ?? kind];
      if (used.costMicroUsd >= limit.costMicroUsd || used.calls >= limit.calls) {
        audit("ai.budget_refused", { subject: ctx.subject, feature: ctx.feature, calls: used.calls, costUsd: used.costMicroUsd / 1e6, at: "request" });
        return res.status(429).json({ code: "ai_daily_limit", message: "You have reached today's limit for AI answers. Please try again tomorrow." });
      }
    } catch (err: any) {
      // An early courtesy check only: every model call is still held to the budget atomically.
      console.error("[ai] budget check failed:", err?.message ?? err);
    }
    next();
  };
}

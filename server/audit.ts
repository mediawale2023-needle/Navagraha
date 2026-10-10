/**
 * Financial and AI audit events. Each event is one JSON log line (prefix `[audit]`) and, when
 * POSTHOG_API_KEY is set, a PostHog event. Only ids, amounts, counts and short codes are
 * recorded: never birth details, messages, answers, payment credentials or signatures.
 */
import { PostHog } from "posthog-node";

export type AuditEvent =
  | "payment.order_created"
  | "payment.settled"
  | "payment.mismatch"
  | "payment.not_captured"
  | "payment.refund_observed"
  | "payment.method_disabled"
  | "wallet.credit"
  | "wallet.debit"
  | "wallet.refund"
  | "promo.coupon_applied"
  | "promo.coupon_void"
  | "promo.referral_rewarded"
  | "ask.reserved"
  | "ask.consumed"
  | "ask.released"
  | "ask.refused"
  | "ask.pack_purchased"
  | "ask.pack_refused"
  | "auth.email_verification_sent"
  | "auth.email_verification_throttled"
  | "auth.email_verified"
  | "ai.usage"
  | "ai.budget_refused";

type Value = string | number | boolean | null | undefined;

const MAX_STRING = 80;

let client: PostHog | null | undefined;
function posthog(): PostHog | null {
  if (client !== undefined) return client;
  const key = process.env.POSTHOG_API_KEY;
  client = key ? new PostHog(key, { host: process.env.POSTHOG_HOST || "https://app.posthog.com", flushAt: 20, flushInterval: 10_000 }) : null;
  return client;
}

/** Keeps only scalar fields and truncates strings, so free text cannot leak into the log. */
export function auditFields(fields: Record<string, Value>): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (typeof v === "string") out[k] = v.length > MAX_STRING ? `${v.slice(0, MAX_STRING)}…` : v;
    else if (typeof v === "number") out[k] = Number.isFinite(v) ? v : null;
    else out[k] = v;
  }
  return out;
}

export function audit(event: AuditEvent, fields: Record<string, Value> & { userId?: string | null; subject?: string }): void {
  const clean = auditFields(fields);
  try {
    console.log(`[audit] ${JSON.stringify({ event, at: new Date().toISOString(), ...clean })}`);
    const distinctId = fields.userId || fields.subject;
    if (distinctId) posthog()?.capture({ distinctId: String(distinctId), event: `audit:${event}`, properties: clean });
  } catch {
    // Auditing never breaks the money path it describes.
  }
}

export async function flushAudit(): Promise<void> {
  await client?.shutdown().catch(() => {});
}

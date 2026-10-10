import crypto from "crypto";
import { features } from "./features";

// Commercial allowances (Release A records them; enforcement is behind FEATURE_ASK_METERING_ENFORCE).
export const ASK_FREE_QUESTIONS = 3;
export const ASK_FREE_FOLLOW_UPS = 1;
export const ASK_PAID_FOLLOW_UPS = 2;

/** The chart a thread is about: follow-ups count only against a question on the same chart. */
export function askChartKey(selection: { kind: string; kundliId?: string; details?: any }, resolvedKundliId?: string | null): string {
  if (selection.kind === "birthDetails" && selection.details) {
    const d = selection.details;
    const basis = [d.dateOfBirth, d.timeOfBirth, Number(d.latitude ?? 0).toFixed(4), Number(d.longitude ?? 0).toFixed(4), d.placeOfBirth ?? ""].join("|");
    return `birth:${crypto.createHash("sha256").update(basis).digest("hex").slice(0, 24)}`;
  }
  const id = selection.kind === "saved" ? selection.kundliId : resolvedKundliId;
  return id ? `kundli:${id}` : "none";
}

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** A client-supplied request id makes retries idempotent; without one each request is new. */
export function askIdempotencyKey(requestId: unknown): string {
  return typeof requestId === "string" && KEY_PATTERN.test(requestId) ? requestId : `srv_${crypto.randomUUID()}`;
}

export function askEnforced(): boolean {
  return features.askMeteringEnforced();
}

/** Releases Ask reservations whose request died (restart mid-answer), restoring paid questions. */
export function startAskReservationSweeper(): void {
  const run = async () => {
    try {
      const { storage } = await import("./storage");
      const released = await storage.releaseStaleAskReservations();
      if (released) console.warn(`[ask] released ${released} reservation(s) that never settled`);
    } catch (err) {
      console.error("[ask] reservation sweep failed:", err);
    }
  };
  run();
  setInterval(run, 10 * 60_000).unref();
}

/**
 * The free allowance is for verified accounts only (an email/password account can be created
 * at will, so its allowance would be unlimited). Unverified accounts are metered with none:
 * unmetered while enforcement is off, refused once it is on.
 */
export function askFreeQuestionsFor(user: { emailVerifiedAt?: Date | string | null } | null | undefined): number {
  return user?.emailVerifiedAt ? ASK_FREE_QUESTIONS : 0;
}

/**
 * Ask question packs, bought from the wallet. Each paid question carries two follow-ups and
 * packs do not expire. Prices are fixed here and never taken from the client.
 */
import { ASK_PAID_FOLLOW_UPS } from "./askMetering";

export interface AskPack { id: string; questions: number; price: number }

export const ASK_PACKS: readonly AskPack[] = [
  { id: "ask_1", questions: 1, price: 29 },
  { id: "ask_5", questions: 5, price: 99 },
  { id: "ask_12", questions: 12, price: 199 },
];

export const ASK_PACK_FOLLOW_UPS = ASK_PAID_FOLLOW_UPS;

export function askPack(id: unknown): AskPack | undefined {
  return typeof id === "string" ? ASK_PACKS.find((p) => p.id === id) : undefined;
}

/** A purchase must carry the client's request id: retries of one tap buy once. */
export function askPackRequestKey(requestId: unknown): string | null {
  return typeof requestId === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(requestId) ? requestId : null;
}

/**
 * Paid report fulfilment. A report is delivered only when generation passes the quality
 * check; anything else (no AI, a failed check, an error, a restart mid-generation) fails the
 * order and refunds what it charged, once, with a notification.
 */
import { storage } from "./storage";
import { sendPushToUser } from "./pushService";
import { audit } from "./audit";
import type { ReportOrder } from "@shared/schema";

/** Report categories that can be generated; a catalogue entry with any other category is not sold. */
export const OFFERED_REPORT_CATEGORIES = ["career", "marriage", "finance", "year_ahead", "life", "life_complete"] as const;
export const isOfferedReportCategory = (category: string | null | undefined) =>
  (OFFERED_REPORT_CATEGORIES as readonly string[]).includes(category ?? "life");

/** True when paid AI reports can be generated at all; ordering is refused otherwise. */
export function reportsAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** Generation runs in-process; an order still processing after this was lost (e.g. a restart). */
export const STALE_REPORT_ORDER_MS = 30 * 60_000;

async function refundAndTell(order: Pick<ReportOrder, "id" | "userId">, reportName: string, reason: string) {
  const result = await storage.failAndRefundReportOrder(order.id, reason);
  if (!result) return null;
  audit("wallet.refund", { userId: order.userId, reason: "report_failed", orderId: order.id, amount: result.refunded });
  const amount = result.refunded > 0 ? `₹${result.refunded.toFixed(0)} has been returned to your wallet.` : "You were not charged.";
  await storage.createNotification({
    userId: order.userId, type: "system", title: "Report could not be prepared",
    body: `We could not prepare your ${reportName} to our standard. ${amount}`,
  }).catch(() => {});
  return result;
}

export async function fulfilReportOrder(order: ReportOrder, reportName: string, generate: () => Promise<object>) {
  try {
    const content = await generate();
    const delivered = await storage.setReportOrderContent(order.id, content);
    if (!delivered) return; // already failed and refunded by the sweeper
    await storage.createNotification({ userId: order.userId, type: "system", title: "Report Ready", body: `Your ${reportName} is ready to view.` });
    sendPushToUser(order.userId, { title: "Report Ready", body: `Your ${reportName} is ready.`, link: "/reports" });
  } catch (err: any) {
    console.error(`[reports] order ${order.id} failed:`, err?.message ?? err);
    await refundAndTell(order, reportName, String(err?.message ?? err)).catch((refundErr) => {
      console.error(`[reports] refund of order ${order.id} failed; the sweeper will retry:`, refundErr);
    });
  }
}

export async function sweepStaleReportOrders(now = new Date()): Promise<number> {
  const stale = await storage.getStaleProcessingReportOrders(new Date(now.getTime() - STALE_REPORT_ORDER_MS));
  let refunded = 0;
  for (const order of stale) {
    const type = await storage.getReportTypeById(order.reportTypeId).catch(() => undefined);
    if (await refundAndTell(order, type?.name ?? "report", "generation did not finish")) refunded++;
  }
  if (refunded) console.warn(`[reports] refunded ${refunded} report order(s) whose generation never finished`);
  return refunded;
}

export function startReportOrderSweeper() {
  const run = () => sweepStaleReportOrders().catch((err) => console.error("[reports] sweep failed:", err));
  run();
  setInterval(run, 10 * 60_000).unref();
}

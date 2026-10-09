import type { Request, Response, NextFunction } from "express";
import { features } from "./features";
import { storage } from "./storage";

export const MARKETPLACE_PAUSED_MESSAGE =
  "Astrologer consultations, live sessions, Pooja and Astromall are paused. Your Kundli, Ask Your Kundli and reports are available.";

// Every route that starts, books or charges for a marketplace service. Reading history
// (past consultations, bookings, orders) and closing something already open stay allowed.
const PAUSED_ROUTES: Array<[method: string, path: RegExp]> = [
  ["POST", /^\/api\/consultations\/start$/],
  ["POST", /^\/api\/chat\/(?!ai-astrologer$)[^/]+$/],
  ["GET", /^\/api\/agora\/token$/],
  ["POST", /^\/api\/schedule$/],
  ["POST", /^\/api\/reviews$/],
  ["POST", /^\/api\/astrologers\/[^/]+\/(follow|waitlist)$/],
  ["POST", /^\/api\/astrologer\/status$/],
  ["POST", /^\/api\/live\/start$/],
  ["POST", /^\/api\/live\/[^/]+\/(join|message|gift)$/],
  ["POST", /^\/api\/poojas\/book$/],
  ["POST", /^\/api\/store\/orders$/],
  ["GET", /^\/api\/ai\/(pre-consult-brief|match-astrologer)$/],
];

export function isPausedMarketplaceRoute(method: string, path: string): boolean {
  // Express routing ignores case and a trailing slash, so the gate must too.
  const normalized = path.toLowerCase().replace(/\/+$/, "");
  return PAUSED_ROUTES.some(([m, re]) => m === method.toUpperCase() && re.test(normalized));
}

/** Refuses new marketplace activity while the marketplace is off. */
export function marketplaceGate(req: Request, res: Response, next: NextFunction) {
  if (features.marketplace() || !isPausedMarketplaceRoute(req.method, req.path)) return next();
  res.status(503).json({ message: MARKETPLACE_PAUSED_MESSAGE, code: "marketplace_paused" });
}

/**
 * Closes marketplace activity left open when the marketplace is switched off: active
 * consultations (their billing stopped with the old process; nothing further is charged),
 * live streams, upcoming bookings (never charged) and waitlists. Paid Pooja bookings, store
 * orders and closed consultations with billed minutes are not changed; they are reported for
 * fulfilment, payout or refund. Idempotent.
 */
export async function closeMarketplaceActivity() {
  const consultationsClosed = await storage.closeActiveConsultations();
  // Nobody can be consulted while paused, and a free first chat that was cut short is given back.
  const astrologersOffline = await storage.setAllAstrologersOffline();
  await storage.restoreFreeChat(consultationsClosed.filter((c) => c.isFree).map((c) => c.userId));
  const liveStreamsEnded = await storage.endActiveLiveStreams();
  const bookingsCancelled = await storage.cancelOpenScheduledCalls();
  const waitlistCancelled = await storage.cancelWaitingQueue();

  for (const c of consultationsClosed) {
    await storage.createNotification({
      userId: c.userId, type: "system", title: "Consultation closed",
      body: "Astrologer consultations are paused, so your open session was closed. No further charges will be made.",
    }).catch(() => {});
  }
  for (const b of bookingsCancelled) {
    await storage.createNotification({
      userId: b.userId, type: "system", title: "Appointment cancelled",
      body: "Astrologer consultations are paused, so your booked appointment was cancelled. You were not charged for it.",
    }).catch(() => {});
  }

  const open = await storage.getOpenPaidMarketplaceItems();
  const summary = {
    consultationsClosed: consultationsClosed.length,
    astrologersOffline,
    liveStreamsEnded,
    bookingsCancelled: bookingsCancelled.length,
    waitlistCancelled,
    openPoojaBookings: open.poojaBookings.length,
    openStoreOrders: open.storeOrders.length,
    billedClosedConsultations: open.billedClosedConsultations.length,
  };
  if (Object.values(summary).some(Boolean)) {
    console.warn("[marketplace] paused; closed open activity:", summary,
      open.poojaBookings.length || open.storeOrders.length || open.billedClosedConsultations.length
        ? "— paid Pooja bookings, store orders and billed closed consultations still need settling or refunding (GET /api/admin/marketplace/open-items)"
        : "");
  }
  return summary;
}

import { storage, type RechargeSettlement } from "./storage";
import { sendPushToUser } from "./pushService";
import { sendPaymentReceipt } from "./emailService";
import {
  fetchOrderPayments, isRazorpayConfigured, REFEREE_REWARD, REFERRER_REWARD, REFERRAL_MIN_RECHARGE,
  REFERRER_MONTHLY_REWARD_CAP, type GatewayPayment,
} from "./paymentService";
import { audit } from "./audit";
import type { Transaction } from "@shared/schema";

type Settled = Extract<RechargeSettlement, { kind: "settled" }>;

/**
 * Side effects of a recharge that has just been credited. Called only by whoever won the
 * settlement (verify, webhook or reconciler), so each runs once per recharge.
 * Returns the payer's balance after any referral bonus.
 */
async function afterRechargeSettled(settled: Settled, paymentId: string): Promise<number> {
  const { transaction, balance, paidRupees } = settled;
  const userId = transaction.userId;
  const credited = parseFloat(transaction.amount);
  let runningBalance = parseFloat(balance);

  audit("payment.settled", {
    userId, transactionId: transaction.id, orderId: transaction.gatewayOrderId, paymentId,
    paidPaise: transaction.gatewayAmountPaise, currency: transaction.gatewayCurrency,
  });
  audit("wallet.credit", {
    userId, transactionId: transaction.id, reason: "recharge", amount: credited,
    packBonus: Number(transaction.packBonus ?? 0), couponBonus: Number(transaction.couponBonus ?? 0),
  });
  if (settled.coupon === "applied") audit("promo.coupon_applied", { userId, transactionId: transaction.id, code: transaction.couponCode, bonus: Number(transaction.couponBonus ?? 0) });
  if (settled.coupon === "void") audit("promo.coupon_void", { userId, transactionId: transaction.id, code: transaction.couponCode, reason: settled.couponVoidReason });

  await storage.createNotification({
    userId, type: 'payment', title: 'Wallet Recharged', body: `₹${credited} added to your wallet successfully.`,
  });
  sendPushToUser(userId, {
    title: 'Wallet Recharged', body: `₹${credited} added to your wallet successfully.`, link: '/wallet', data: { type: 'payment' },
  });

  // Referral reward on the invitee's first qualifying recharge, paid at most once.
  try {
    const referral = await storage.getReferralByReferee(userId);
    if (referral?.status === 'pending' && paidRupees >= REFERRAL_MIN_RECHARGE) {
      const reward = await storage.rewardReferral(referral, REFERRER_REWARD, REFEREE_REWARD, REFERRER_MONTHLY_REWARD_CAP);
      if (reward) {
        runningBalance = parseFloat(reward.refereeBalance);
        audit("promo.referral_rewarded", {
          userId, referralId: referral.id, refereeReward: REFEREE_REWARD, referrerReward: reward.referrerPaid ? REFERRER_REWARD : 0,
          referrerCapped: !reward.referrerPaid,
        });
        await storage.createNotification({
          userId, type: 'payment', title: 'Referral Bonus', body: `You received ₹${REFEREE_REWARD} referral bonus in your wallet.`,
        });
        if (reward.referrerPaid) {
          await storage.createNotification({
            userId: referral.referrerId, type: 'payment', title: 'Referral Reward',
            body: `Your friend recharged! ₹${REFERRER_REWARD} has been added to your wallet.`,
          });
        }
      }
    }
  } catch (refErr) {
    console.error('Referral reward error:', refErr);
  }

  const user = await storage.getUser(userId);
  if (user?.email) {
    sendPaymentReceipt(user.email, {
      userName: user.firstName || 'User', amount: credited, bonus: 0, newBalance: runningBalance, paymentId,
    }).catch(() => {});
  }
  return runningBalance;
}

export type PaymentOutcome =
  | { kind: "settled"; transaction: Transaction; balance: number }
  | { kind: "mismatch"; transaction: Transaction; reason: string }
  | { kind: "not_captured"; status: string }
  | { kind: "none" };

/**
 * Credits a Razorpay payment, as reported by Razorpay, to its pending recharge, once.
 * `userId` restricts the settlement to that user's own order. A payment that is not yet
 * captured credits nothing (the webhook or the reconciler settles it once captured).
 */
export async function settleRazorpayPayment(
  payment: GatewayPayment, opts: { signature?: string; userId?: string } = {},
): Promise<PaymentOutcome> {
  if (payment.status !== "captured") {
    audit("payment.not_captured", { userId: opts.userId, orderId: payment.orderId, paymentId: payment.id, status: payment.status });
    return { kind: "not_captured", status: payment.status };
  }
  const result = await storage.settleRechargeOrder(payment, opts);
  if (result.kind === "none") return result;
  if (result.kind === "mismatch") {
    audit("payment.mismatch", {
      userId: result.transaction.userId, transactionId: result.transaction.id, orderId: payment.orderId, paymentId: payment.id,
      paidPaise: payment.amountPaise, currency: payment.currency, reason: result.reason,
    });
    console.error(`[payment] recharge ${result.transaction.id} held for review: ${result.reason}`);
    return result;
  }
  return { kind: "settled", transaction: result.transaction, balance: await afterRechargeSettled(result, payment.id) };
}

type ReconcileAction = 'settle' | 'fail' | 'error';

export const RECONCILE_AFTER_MS = 10 * 60 * 1000;
export const ABANDON_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Settles pending Razorpay recharges whose confirmation never arrived (tab closed, webhook
 * not configured) by asking Razorpay; one still unpaid after a day is marked failed (and is
 * still credited if Razorpay captures it later). Only recharges created on or after
 * `createdAfter` are touched. With `dryRun` nothing is changed and the result lists what
 * would happen, so historical rows can be reviewed before an admin applies it.
 */
export async function reconcilePendingRecharges(
  now: Date = new Date(),
  fetchPayments: typeof fetchOrderPayments = fetchOrderPayments,
  opts: { createdAfter?: Date; dryRun?: boolean } = {},
): Promise<{ checked: number; settled: number; failed: number; review: number; errors: number; dryRun: boolean; actions: Array<{ transactionId: string; orderId: string; userId: string; amount: string; action: ReconcileAction }> }> {
  const result = { checked: 0, settled: 0, failed: 0, review: 0, errors: 0, dryRun: Boolean(opts.dryRun), actions: [] as Array<{ transactionId: string; orderId: string; userId: string; amount: string; action: ReconcileAction }> };
  const stale = await storage.getStalePendingRecharges(new Date(now.getTime() - RECONCILE_AFTER_MS), opts.createdAfter);
  for (const txn of stale) {
    if (!txn.gatewayOrderId) continue;
    result.checked++;
    const abandoned = Boolean(txn.createdAt) && now.getTime() - new Date(txn.createdAt!).getTime() > ABANDON_AFTER_MS;
    const note = (action: ReconcileAction) =>
      result.actions.push({ transactionId: txn.id, orderId: txn.gatewayOrderId!, userId: txn.userId, amount: txn.amount, action });
    let payments: GatewayPayment[];
    try {
      payments = await fetchPayments(txn.gatewayOrderId);
    } catch (err) {
      result.errors++;
      note('error');
      console.error(`[reconcile] recharge ${txn.id} (order ${txn.gatewayOrderId}) lookup failed:`, err);
      // An order Razorpay cannot answer for a day (e.g. made with other keys) stops
      // blocking the queue; a later capture is still credited by verify or the webhook.
      if (abandoned && !opts.dryRun && await storage.failPendingRecharge(txn.id)) result.failed++;
      continue;
    }
    const captured = payments.find((p) => p.status === 'captured' && p.orderId === txn.gatewayOrderId);
    if (captured) {
      note('settle');
      if (opts.dryRun) result.settled++;
      else {
        const outcome = await settleRazorpayPayment(captured);
        if (outcome.kind === 'settled') result.settled++;
        else if (outcome.kind === 'mismatch') result.review++;
      }
    } else if (payments.some((p) => p.status === 'authorized')) {
      // Paid but not captured: credited only once Razorpay captures it (auto-capture must be on).
      audit("payment.not_captured", { userId: txn.userId, transactionId: txn.id, orderId: txn.gatewayOrderId, status: 'authorized' });
      console.warn(`[reconcile] recharge ${txn.id} (order ${txn.gatewayOrderId}) has an authorized, uncaptured payment`);
    } else if (abandoned) {
      note('fail');
      if (opts.dryRun) result.failed++;
      else if (await storage.failPendingRecharge(txn.id)) result.failed++;
    }
  }
  return result;
}

/**
 * Runs the reconciler periodically when Razorpay is configured; a no-op otherwise. It only
 * touches recharges created from an hour before this process started: older pending rows
 * are left for an admin to review (POST /api/admin/payments/reconcile, dry run by default).
 */
export function startRechargeReconciler(intervalMs = 15 * 60 * 1000): void {
  if (!isRazorpayConfigured()) return;
  const createdAfter = new Date(Date.now() - 60 * 60 * 1000);
  const run = () => reconcilePendingRecharges(new Date(), fetchOrderPayments, { createdAfter })
    .then((r) => { if (r.settled || r.failed || r.review || r.errors) console.log('[reconcile] pending recharges', { ...r, actions: r.actions.length }); })
    .catch((err) => console.error('[reconcile] run failed:', err));
  setInterval(run, intervalMs).unref();
}

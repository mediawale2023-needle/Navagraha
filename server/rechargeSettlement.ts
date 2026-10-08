import { storage } from "./storage";
import { sendPushToUser } from "./pushService";
import { sendPaymentReceipt } from "./emailService";
import { fetchOrderPayments, isRazorpayConfigured, REFEREE_REWARD, REFERRER_REWARD } from "./paymentService";
import type { Transaction } from "@shared/schema";

type Settled = { transaction: Transaction; balance: string };

/**
 * Side effects of a recharge that has just been credited. Called only by whoever won the
 * settlement (verify, webhook or reconciler), so each runs once per recharge.
 * Returns the payer's balance after any referral bonus.
 */
async function afterRechargeSettled({ transaction, balance }: Settled, paymentId: string): Promise<number> {
  const userId = transaction.userId;
  const credited = parseFloat(transaction.amount);
  let runningBalance = parseFloat(balance);

  await storage.createNotification({
    userId, type: 'payment', title: 'Wallet Recharged', body: `₹${credited} added to your wallet successfully.`,
  });
  sendPushToUser(userId, {
    title: 'Wallet Recharged', body: `₹${credited} added to your wallet successfully.`, link: '/wallet', data: { type: 'payment' },
  });

  if (transaction.couponCode) {
    const coupon = await storage.getCouponByCode(transaction.couponCode);
    if (coupon) await storage.incrementCouponUsage(coupon.id);
  }

  // Referral reward on the invitee's first completed recharge, paid at most once.
  try {
    const referral = await storage.getReferralByReferee(userId);
    if (referral?.status === 'pending') {
      const refereeBalance = await storage.rewardReferral(referral, REFERRER_REWARD, REFEREE_REWARD);
      if (refereeBalance !== null) {
        runningBalance = parseFloat(refereeBalance);
        await storage.createNotification({
          userId, type: 'payment', title: 'Referral Bonus', body: `You received ₹${REFEREE_REWARD} referral bonus in your wallet.`,
        });
        await storage.createNotification({
          userId: referral.referrerId, type: 'payment', title: 'Referral Reward',
          body: `Your friend recharged! ₹${REFERRER_REWARD} has been added to your wallet.`,
        });
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

/**
 * Credits a captured Razorpay payment for its order, once. Null when the order has no
 * pending recharge (already settled by another path, or unknown). `userId` restricts the
 * settlement to that user's own order.
 */
export async function settleRazorpayPayment(
  orderId: string, paymentId: string, signature?: string, userId?: string,
): Promise<{ transaction: Transaction; balance: number } | null> {
  const settled = await storage.settleRechargeOrder(orderId, paymentId, signature, userId);
  if (!settled) return null;
  return { transaction: settled.transaction, balance: await afterRechargeSettled(settled, paymentId) };
}

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
): Promise<{ checked: number; settled: number; failed: number; errors: number; dryRun: boolean; actions: Array<{ transactionId: string; orderId: string; userId: string; amount: string; action: 'settle' | 'fail' | 'error' }> }> {
  const result = { checked: 0, settled: 0, failed: 0, errors: 0, dryRun: Boolean(opts.dryRun), actions: [] as Array<{ transactionId: string; orderId: string; userId: string; amount: string; action: 'settle' | 'fail' | 'error' }> };
  const stale = await storage.getStalePendingRecharges(new Date(now.getTime() - RECONCILE_AFTER_MS), opts.createdAfter);
  for (const txn of stale) {
    if (!txn.gatewayOrderId) continue;
    result.checked++;
    const abandoned = Boolean(txn.createdAt) && now.getTime() - new Date(txn.createdAt!).getTime() > ABANDON_AFTER_MS;
    const note = (action: 'settle' | 'fail' | 'error') =>
      result.actions.push({ transactionId: txn.id, orderId: txn.gatewayOrderId!, userId: txn.userId, amount: txn.amount, action });
    let payments: Array<{ id: string; status: string }>;
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
    const captured = payments.find((p) => p.status === 'captured');
    if (captured) {
      note('settle');
      if (opts.dryRun) result.settled++;
      else if (await settleRazorpayPayment(txn.gatewayOrderId, captured.id)) result.settled++;
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
    .then((r) => { if (r.settled || r.failed || r.errors) console.log('[reconcile] pending recharges', { ...r, actions: r.actions.length }); })
    .catch((err) => console.error('[reconcile] run failed:', err));
  setInterval(run, intervalMs).unref();
}

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

  // Referral reward on the invitee's first completed recharge. Claimed atomically first,
  // so two recharges settling at once cannot both pay it.
  try {
    const referral = await storage.getReferralByReferee(userId);
    if (referral?.status === 'pending'
      && await storage.claimReferralReward(referral.id, REFERRER_REWARD.toString(), REFEREE_REWARD.toString())) {
      runningBalance = parseFloat(await storage.creditWallet(userId, REFEREE_REWARD));
      await storage.createTransaction({ userId, amount: REFEREE_REWARD.toString(), type: 'recharge', description: 'Referral bonus', status: 'completed' });
      await storage.createNotification({
        userId, type: 'payment', title: 'Referral Bonus', body: `You received ₹${REFEREE_REWARD} referral bonus in your wallet.`,
      });
      await storage.creditWallet(referral.referrerId, REFERRER_REWARD);
      await storage.createTransaction({
        userId: referral.referrerId, amount: REFERRER_REWARD.toString(), type: 'recharge', description: 'Referral reward', status: 'completed',
      });
      await storage.createNotification({
        userId: referral.referrerId, type: 'payment', title: 'Referral Reward',
        body: `Your friend recharged! ₹${REFERRER_REWARD} has been added to your wallet.`,
      });
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
 * not configured) by asking Razorpay; one still unpaid after a day is marked failed.
 */
export async function reconcilePendingRecharges(
  now: Date = new Date(),
  fetchPayments: typeof fetchOrderPayments = fetchOrderPayments,
): Promise<{ checked: number; settled: number; failed: number; errors: number }> {
  const result = { checked: 0, settled: 0, failed: 0, errors: 0 };
  const stale = await storage.getStalePendingRecharges(new Date(now.getTime() - RECONCILE_AFTER_MS));
  for (const txn of stale) {
    if (!txn.gatewayOrderId) continue;
    result.checked++;
    try {
      const captured = (await fetchPayments(txn.gatewayOrderId)).find((p) => p.status === 'captured');
      if (captured) {
        if (await settleRazorpayPayment(txn.gatewayOrderId, captured.id)) result.settled++;
      } else if (txn.createdAt && now.getTime() - new Date(txn.createdAt).getTime() > ABANDON_AFTER_MS) {
        if (await storage.failPendingRecharge(txn.id)) result.failed++;
      }
    } catch (err) {
      result.errors++;
      console.error(`[reconcile] recharge ${txn.id} (order ${txn.gatewayOrderId}) failed:`, err);
    }
  }
  return result;
}

/** Runs the reconciler periodically when Razorpay is configured; a no-op otherwise. */
export function startRechargeReconciler(intervalMs = 15 * 60 * 1000): void {
  if (!isRazorpayConfigured()) return;
  const run = () => reconcilePendingRecharges()
    .then((r) => { if (r.settled || r.failed || r.errors) console.log('[reconcile] pending recharges', r); })
    .catch((err) => console.error('[reconcile] run failed:', err));
  setInterval(run, intervalMs).unref();
}

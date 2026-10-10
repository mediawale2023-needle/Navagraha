-- Release A historical wallet audit, part 2: consistency checks that need no Razorpay data.
-- READ ONLY: one read-only transaction, rolled back; writes nothing. Uses only columns that
-- exist before the Release A migration, so it runs before deploy. Prefer a read-only role:
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/forensics/wallet-consistency-checks.sql > checks.txt
--
-- Each query prints a labelled result set. Nothing here proves fraud on its own: a flagged
-- row is a lead to compare with the Razorpay export (recharge-forensics.ts) and the audit log.
-- Do not change any wallet, transaction or account from this output without separate authorisation.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

-- 1. Duplicate credits: one gateway payment credited more than once.
SELECT 'duplicate_payment_credit' AS check, gateway_payment_id, count(*) AS credits, sum(amount) AS total_credited,
       array_agg(id ORDER BY created_at) AS transaction_ids
FROM transactions
WHERE type = 'recharge' AND status = 'completed' AND gateway_payment_id IS NOT NULL
GROUP BY gateway_payment_id HAVING count(*) > 1;

-- 2. Duplicate credits: one gateway order completed more than once.
SELECT 'duplicate_order_credit' AS check, gateway_order_id, count(*) AS credits, sum(amount) AS total_credited,
       array_agg(id ORDER BY created_at) AS transaction_ids
FROM transactions
WHERE type = 'recharge' AND status = 'completed' AND gateway_order_id IS NOT NULL
GROUP BY gateway_order_id HAVING count(*) > 1;

-- 3. String-amount pattern (finding 1): "X" + 0 + 0 was stored as "X00" and "X" + 0 + B as "X0B".
--    A credited amount whose text is a shorter amount followed by "00" (or "0" and the staged
--    coupon bonus) on a recharge with no pack bonus in its description is a candidate. Legitimate
--    round amounts (e.g. ₹500) also match "X00": confirm with the captured amount in the export.
SELECT 'string_amount_candidate' AS check, t.id, t.user_id, t.amount AS credited, t.description, t.coupon_code,
       cr.discount_amount AS coupon_bonus, t.gateway_payment_id, t.created_at
FROM transactions t
LEFT JOIN coupon_redemptions cr ON cr.transaction_id = t.id
WHERE t.type = 'recharge' AND t.status = 'completed' AND t.payment_method = 'razorpay'
  AND t.description NOT LIKE '%bonus%'
  AND (
    (t.amount = trunc(t.amount) AND t.amount::bigint::text ~ '^[1-9][0-9]*00$' AND t.amount >= 1000)
    OR (cr.discount_amount IS NOT NULL AND t.amount::bigint::text LIKE '%0' || cr.discount_amount::bigint::text)
  )
ORDER BY t.created_at;

-- 4. Direct Snapmint / LazyPay credits (amount and user taken from the callback; no server order).
SELECT 'direct_bnpl_credit' AS check, id, user_id, amount, payment_method, gateway_order_id, created_at
FROM transactions
WHERE type = 'recharge' AND status = 'completed' AND payment_method IN ('snapmint', 'lazypay')
ORDER BY created_at;

-- 5. Completed Razorpay recharges with no payment id (cannot be matched to a payment).
SELECT 'completed_without_payment_id' AS check, id, user_id, amount, gateway_order_id, created_at
FROM transactions
WHERE type = 'recharge' AND status = 'completed' AND payment_method = 'razorpay' AND gateway_payment_id IS NULL;

-- 6. Coupon recharges with no redemption row, or more than one.
SELECT 'coupon_redemption_mismatch' AS check, t.id, t.user_id, t.coupon_code, t.amount, count(cr.id) AS redemptions
FROM transactions t
LEFT JOIN coupon_redemptions cr ON cr.transaction_id = t.id
WHERE t.type = 'recharge' AND t.status = 'completed' AND t.coupon_code IS NOT NULL
GROUP BY t.id HAVING count(cr.id) <> 1;

-- 7. Coupon use beyond its limits (per user, and in total).
SELECT 'coupon_over_limit' AS check, c.code, c.per_user_limit, cr.user_id, count(*) AS uses
FROM coupon_redemptions cr
JOIN coupons c ON c.id = cr.coupon_id
JOIN transactions t ON t.id = cr.transaction_id AND t.status = 'completed'
GROUP BY c.code, c.per_user_limit, cr.user_id
HAVING c.per_user_limit IS NOT NULL AND count(*) > c.per_user_limit;

-- 8. Referral rewards on a first recharge under ₹100 (the Release A minimum), for context.
SELECT 'referral_on_small_recharge' AS check, r.id AS referral_id, r.referrer_id, r.referee_id, r.rewarded_at,
       (SELECT min(t.amount) FROM transactions t WHERE t.user_id = r.referee_id AND t.type = 'recharge'
          AND t.status = 'completed' AND t.gateway_order_id IS NOT NULL AND t.created_at <= r.rewarded_at) AS first_recharge
FROM referrals r
WHERE r.status = 'rewarded'
  AND coalesce((SELECT min(t.amount) FROM transactions t WHERE t.user_id = r.referee_id AND t.type = 'recharge'
          AND t.status = 'completed' AND t.gateway_order_id IS NOT NULL AND t.created_at <= r.rewarded_at), 0) < 100;

-- 9. Ledger drift: wallet balance vs the sum of its completed transactions (recharges and refunds
--    add; debits and deductions subtract, whatever sign they were stored with). Older rows and
--    admin free-access rows can explain small differences; large positive drift is a lead.
WITH ledger AS (
  SELECT user_id, sum(CASE
           WHEN type IN ('recharge', 'refund') THEN abs(amount)
           WHEN type IN ('debit', 'deduction') THEN -abs(amount)
           ELSE 0 END) AS ledger_balance
  FROM transactions WHERE status = 'completed' GROUP BY user_id
)
SELECT 'ledger_drift' AS check, w.user_id, w.balance AS wallet_balance, coalesce(l.ledger_balance, 0) AS ledger_balance,
       w.balance - coalesce(l.ledger_balance, 0) AS drift
FROM wallets w LEFT JOIN ledger l ON l.user_id = w.user_id
WHERE abs(coalesce(w.balance, 0) - coalesce(l.ledger_balance, 0)) >= 1
ORDER BY abs(coalesce(w.balance, 0) - coalesce(l.ledger_balance, 0)) DESC
LIMIT 500;

ROLLBACK;

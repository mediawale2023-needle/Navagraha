-- Release A recharge forensics: completed Razorpay recharges, for comparison with what
-- Razorpay actually captured (finding 1: a string amount such as "5" was charged ₹5 and
-- credited ₹500). READ ONLY: the transaction is read-only and rolled back; it writes nothing.
-- Uses only columns that exist before the Release A migration, so it can run before deploy.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --csv -f scripts/forensics/recharge-forensics.sql > recharges.csv
--
-- Prefer a read-only database role. Compare the output with a Razorpay payments export using
-- scripts/forensics/recharge-forensics.ts, which flags each recharge credited more than its
-- captured payment plus the bonuses it could justify. Do not change any wallet from this
-- output without separate authorisation.

BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;

SELECT
  t.id                  AS transaction_id,
  t.user_id,
  t.amount              AS credited,
  t.description,
  t.coupon_code,
  coalesce(cr.discount_amount, 0) AS coupon_bonus_staged,
  t.gateway_order_id,
  t.gateway_payment_id,
  t.created_at
FROM transactions t
LEFT JOIN coupon_redemptions cr ON cr.transaction_id = t.id
WHERE t.type = 'recharge'
  AND t.status = 'completed'
  AND t.payment_method = 'razorpay'
ORDER BY t.created_at;

ROLLBACK;

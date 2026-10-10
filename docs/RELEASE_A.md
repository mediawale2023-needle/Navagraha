# Release A — Financial safety, payment security, revenue infrastructure

Release A makes the wallet, payments, offers, Ask Your Kundli and AI spend safe to monetise.
It adds no customer-facing product, price, subscription or paywall. The redesign, the
astrology engine and the marketplace pause are unchanged.

## Findings, verified against `main` at c3468fb

| # | Finding | Status on `main` | Evidence | Release A |
|---|---|---|---|---|
| 1 | **Critical.** Recharge amount accepted as a string. `{"amount":"5"}` created a ₹5 Razorpay order (`Math.round("5"*100)` = 500 paise) and a pending credit of `"5"+0+0` = `"500"`. Settlement credited the row amount. | Open | `routes.ts` order route (`!amount \|\| amount < 1` passes `"5"`); `paymentService.ts` `Math.round(opts.amount * 100)`; `storage.settleRechargeOrder` credited `parseFloat(claimed.amount)` | Fixed |
| 2 | Settlement never compared the paid amount or currency with the order. | Open | `settleRechargeOrder(orderId, paymentId)` took no amount | Fixed |
| 3 | Coupons were checked only at order time. Concurrent pending orders all passed per-user, global and first-recharge limits. `timesUsed` was incremented after settlement, outside any lock. | Open | `getUserCouponRedemptionCount` counted completed redemptions only; `incrementCouponUsage` ran in `afterRechargeSettled` | Fixed |
| 4 | Referral reward paid on any first recharge, ₹1 included, with no cap per inviter. Email sign-up is unverified, so accounts can be farmed. | Open | `afterRechargeSettled` → `rewardReferral` unconditionally | Fixed (₹100 minimum, 20 per inviter per 30 days); email verification remains a prerequisite (below) |
| 5 | Direct Snapmint/LazyPay: no server order. The amount (and, for LazyPay, the user, from `txnid`) came from the callback. | Open | `routes.ts` Snapmint/LazyPay callbacks | Disabled (503). Both remain available inside Razorpay Checkout |
| 6 | Signature comparisons used `===` (not constant-time). | Open | `paymentService.ts` four comparisons | Fixed (`timingSafeEqual`) |
| 7 | Webhook fell back to `JSON.stringify(req.body)` when the raw body was missing. | Open | `rawBody?.toString() \|\| JSON.stringify(req.body)` | Fixed (raw body required) |
| 8 | Ask counter was fake: the client called `GET /api/ai/question-count` (404), and `/api/ai/chat` returned `questionsUsed: 0`, so "3 free questions left" showed forever. | Open | `AIAstrologer.tsx` `3 - questionsUsed`; route returned `questionsUsed: 0` | Fixed (server metering, real endpoint) |
| 9 | `/api/chat/ai-astrologer` answered Ask questions with no metering (no client uses it). | Open | `routes.ts` chat route; exempt from the marketplace pause | Retired (410) |
| 10 | Five OpenAI calls had no `max_tokens`. The SDK retried twice. No usage or cost was recorded anywhere. | Open | `orchestrator.ts`, `aiAstrologerService.ts` (interpretation, brief, follow-up, matching) | Fixed (metered client) |
| 11 | Pro workspace: astrologer registration signs the account in unverified. The Pro gpt-4o AI was open to any registered account. | Open | `POST /api/astrologer/auth/register` sets `req.session.astrologerId`; `isAstrologerAuthenticated` checks the session only | Fixed (verified only) |
| 12 | Pro credits: read-then-write (racy), no refund when generation failed, and every astrologer shared one rate-limit bucket. | Open | `consumeProAiCredit`; `aiLimiter` keys on `req.user` | Fixed |
| 13 | Admin free access: unlimited free gpt-4o reports. | Open | `placeReportOrder` charges ₹0 for admins | Capped (5 per rolling day) |
| 14 | A double-submitted report order charged twice. | Open | No duplicate check in `placeReportOrder` | Fixed |
| 15 | Wallet arithmetic is atomic and conditional; there is no self-credit endpoint. | **Already resolved** | `tryDebitBalance`/`creditWallet`; `wallet-atomicity.db.test.ts` | Unchanged |
| 16 | Recharge settled once across verify, webhook and reconciler. | **Already resolved** | Claim-once UPDATE; unique indexes `transactions_gateway_payment_id_uq`, `transactions_completed_recharge_order_uq` | Kept and strengthened (row lock + per-order lock) |
| 17 | Report charge and order written together; a failed report refunded exactly once; a sweeper refunds orders lost to a restart; order ownership checked. | **Already resolved** | `placeReportOrder`, `failAndRefundReportOrder`, `startReportOrderSweeper`, `report-orders.db.test.ts` | Unchanged (refunds now audited) |
| 18 | Reports refuse to charge without `OPENAI_API_KEY`, for a non-V3 chart, or for the Life Report without an exact time. | **Already resolved** | `routes.ts` report order route | Unchanged |

| 19 | Direct BNPL disablement could be sidestepped by another unverified credit path. | Checked | The only unverified credit function was `settleExternalRecharge` (used by those callbacks) | Removed, with the absolute `updateWalletBalance` setter. `tests/unit/credit-paths.test.ts` pins every wallet write: `creditWallet` only from verified settlement, referral rewards and report refunds; wallet rows only from `createWallet`/`creditWallet`/`tryDebitBalance` |

Not changed, by decision: the Kundli PDF price (₹10; the client prints the page, so the
charge buys nothing a user could not print — a product question, not a security defect);
store, Pooja and gift checkouts (paused with the marketplace).

## How money moves now

**Order** (`POST /api/payment/razorpay/order`)
- `amount` must be a JSON number of whole rupees, from ₹10 to ₹10,000 (`parseRechargeAmount`).
- The Razorpay order is created in integer paise and checked to have that amount, in INR.
- The pending transaction records:
  - `gateway_amount_paise` and `gateway_currency`;
  - `pack_bonus`, fixed from the server's pack table;
  - `coupon_bonus` as quoted;
  - a coupon redemption in status `staged`, in the same DB transaction.
- At most 5 open recharges per user in 30 minutes.

**Settlement** (`storage.settleRechargeOrder`)
- Called from verify, the webhook and the reconciler.
- Only Razorpay's own report of the payment is used:
  - verify fetches the payment by id;
  - the webhook uses the signed entity;
  - the reconciler uses the order's payments.
- Under a per-order lock and a row lock, the payment must be:
  - for this order;
  - `captured`;
  - in INR;
  - for exactly `gateway_amount_paise`.
- Otherwise the recharge becomes `review` with `review_reason`: no credit, and it is never claimable again.
- Coupons are re-evaluated under a row lock on the coupon, with the user's settlements serialised. A coupon still eligible is `applied` and `times_used` is incremented; one that is not is `void`, and the recharge is credited without it.
- Credit = payment + pack bonus + applied coupon bonus. `amount` is rewritten to what was credited.
- **Pending rows created before Release A** (no `gateway_amount_paise`) are credited:
  - the payment, plus the pack bonus that amount justifies, plus a still-eligible coupon;
  - never more than the row's recorded amount. A string-inflated row is credited what was paid.

**Also held for review:**
- a payment with any amount refunded;
- a second captured payment on an order already credited. It is recorded as its own `review` row (never credited) instead of being dropped.

**Coupon timing at settlement:**
- The offer's dates and active flag are judged at order time, so a payment that settles late keeps the bonus it was quoted.
- Usage limits and the first-recharge rule are judged at settlement.
- Order-time eligibility counts redemptions the same way.
- Referral-bonus rows are not "a first recharge".

**After settlement:**
- Referral reward only for a gateway payment of at least ₹100.
- An inviter is paid for at most 20 referrals in 30 days; the invitee is still rewarded.

**Audit events** (`server/audit.ts`):
- one JSON log line each, plus PostHog when `POSTHOG_API_KEY` is set;
- events:
  - `payment.order_created`, `payment.settled`, `payment.mismatch`, `payment.not_captured`, `payment.refund_observed`;
  - `wallet.credit`, `wallet.debit`, `wallet.refund`;
  - `promo.coupon_applied`, `promo.coupon_void`, `promo.referral_rewarded`;
  - `ask.reserved`, `ask.consumed`, `ask.released`, `ask.refused`;
  - `ai.usage`, `ai.budget_refused`;
- ids and amounts only: no birth details, messages, signatures or credentials.

## Ask Your Kundli metering

- **Free questions need a verified email.**
  - `users.email_verified_at` is set when Google signs the account in with that address (Google signs in only verified addresses).
  - Email/password accounts have no verification yet, so they get **no free questions**: they are recorded as `unmetered` while enforcement is off, and refused with 402 `email_verification_required` once it is on.
  - An email verification flow is therefore a mandatory prerequisite for enforcement.
- Each message reserves a row in `ask_usage` before any model call, under a per-user lock.
  - It is a **follow-up** when the same session and chart has a question with follow-up allowance left.
  - Otherwise it is an **independent question**, drawn from, in order:
    1. the three free questions (one follow-up each);
    2. a paid `entitlements` row (follow-ups from `follow_ups_each`, 2 planned);
    3. if neither: `unmetered`, or refused (402) when enforcement is on.
  - Admin accounts are recorded as `admin`.
- Settled as `consumed` when a model answer was delivered. Settled as `released` when generation failed, or when the deterministic fallback answered; a released paid question returns to its entitlement.
- Reservations older than 10 minutes stop counting, and a sweeper releases them.
- Retries with the same `requestId` replay the stored answer. A duplicate in flight gets 409. A retry after a stale attempt first releases that attempt (returning a paid question), then starts afresh.
- `GET /api/ai/question-count[?sessionId&kundliId]` returns the real counts.
- **Enforcement is off** (`FEATURE_ASK_METERING_ENFORCE`): nobody is refused in Release A. The client shows the free count only when enforcement is on.

## AI spend controls

- `createOpenAI()` (`server/ai/metering.ts`) is the only way to get a client. A test fails if any other file constructs one, or if any completion lacks `max_tokens`.
- Each client gets one SDK retry and a 120 s timeout.
- Output is capped at the default 1500, ceiling 16000. Prompts over 400k characters are refused.
- Usage per subject (`user:`, `astrologer:`, `system`), day and feature goes to `ai_usage_daily` with token counts and estimated cost. Prices: gpt-4o-mini $0.15/$0.60, gpt-4o $2.50/$10 per million tokens.
- **The dollar budget is enforced on every model call**, whichever endpoint made it, so no route can bypass it:
  - the call's worst-case cost (prompt characters as half a token each, plus the full output cap) is reserved in `ai_budget_daily` by one conditional upsert, which serialises concurrent calls on the row;
  - a call that would pass the limit is refused before anything is sent (`AiBudgetExceededError`);
  - the reservation is corrected to the real cost afterwards, and returned in full when the call fails.
- The dollar limit governs. The call caps are flood guards set above what the dollar budget allows in normal use (user cap raised to 2,000 for this reason).
- Who is charged:
  - routes under `/api/admin` → `admin:<id>`;
  - `/api/astrologer/*` with an astrologer session → `astrologer:<id>`;
  - otherwise `user:<id>`;
  - unauthenticated requests share one `anonymous` budget;
  - paid report generation is recorded but not budgeted.
- `aiBudget` middleware returns 429 `ai_daily_limit` early, from the same counter. Defaults:

  | Subject | Calls per day | Cost per day |
  |---|---|---|
  | User | 2,000 (flood guard) | $0.50 |
  | Astrologer | 300 | $5 |
  | Admin | 300 | $5 |

- Models are unchanged. The deep council stays off (`FEATURE_AI_COUNCIL`). The answer guard and evidence pipeline are unchanged.

## AI access policy

| Who | AI access | Spend control |
|---|---|---|
| Customers | Ask your Kundli, interpretation, daily card | Server-side metering, plus the per-call dollar budget ($0.50/day). Paid reports are paid for and not budgeted. |
| Administrators | Free reports for testing (no wallet deduction), admin Jyotish reading | Report generation and admin Jyotish reading are logged and drawn from the admin testing budget ($5/day per admin, enforced per call), with at most 5 free reports a day. |
| Astrologers | Pro workspace CRM and charts stay available | **Pro AI is off** (`FEATURE_PRO_AI`, default off) while the marketplace is paused, so it cannot spend. When it is turned on, it is limited to verified astrologers, 80 credits a month, the per-astrologer rate limit, and the $5/day astrologer budget. |

## Migrations

All are additive and idempotent (`server/migrate.ts`, run on boot), and mirrored in `shared/schema.ts`:

- `transactions`: `gateway_amount_paise`, `gateway_currency`, `pack_bonus`, `coupon_bonus`, `review_reason`, `settlement_verified_at`.
- `coupon_redemptions.status`, plus the unique index `coupon_redemptions_transaction_uq`. The index is guarded: duplicates skip it with a warning instead of failing boot.
- `users.email_verified_at`.
- New tables:
  - `ask_usage`, with unique `(user_id, idempotency_key)`;
  - `entitlements`, with `CHECK (used BETWEEN 0 AND quantity)` and unique `source_ref`;
  - `ai_usage_daily`, primary key `(subject, day, feature)`, bigint counters;
  - `ai_budget_daily`, primary key `(subject, day)`.
- **The recharge guard** (trigger `release_a_recharge_guard` on `transactions`, installed on every boot). It enforces three rules in the database, for any code that writes recharges:
  - a new Razorpay recharge order must record `gateway_amount_paise`;
  - a Razorpay recharge becomes `completed` only with `settlement_verified_at`, which only verified settlement sets;
  - direct Snapmint/LazyPay completed recharges are refused.

  Rows that already exist are untouched. Referral bonuses, debits, refunds and review rows are unaffected.

No existing value is rewritten. Balances, transactions and orders are preserved. Older code booting against this schema runs its own migrations without error and leaves the guard in place (verified: `main` was booted against a migrated database).

## Deployment procedure

**The problem to prevent.** While Render swaps instances, the old build (`main`) still serves requests. On `main`:
- order creation records string amounts (finding 1);
- settlement credits without checking the payment;
- the Snapmint/LazyPay callbacks credit what they are told.

**How it is prevented.** The guard is installed by the new build's migrations, before that build serves any payment route. Payment routes answer 503 until migrations finish (`server/index.ts`). From that moment, the database refuses old-code recharge writes:
- **Old order creation fails** (no `gateway_amount_paise`). The Razorpay order it made is never shown to the payer, so nobody pays.
- **Old verify, webhook or reconciler settlement fails**, and its credit rolls back in the same transaction. The recharge stays `pending`:
  - Razorpay retries the webhook (non-2xx responses are retried, with backoff, for up to 24 hours);
  - the new build's reconciler settles it within 15 minutes, for rows created from an hour before it started;
  - for older rows, the admin dry-run reconcile is used.
- **Old direct BNPL settlement fails.**

This was verified by running `main`'s own storage code against a migrated database: all three were refused, the wallet was unchanged, and the recharge stayed pending and was then settled by the new code (`tests/unit/deploy-guard.db.test.ts` keeps the SQL-level checks).

**Steps (operator):**
1. Run the historical audit below, read only, and keep its output.
2. Optional, to keep the transition quiet: set `RECHARGES_PAUSED=true` in the new release's environment. New recharges get a 503 "paused" message. Verify, webhook and reconciler keep settling payments already made.
3. Deploy the release (Render zero-downtime deploy). Wait for `GET /api/health` → `ready: true` on the new instance. That means migrations and the guard are in place.
4. Check the guard is installed:
   ```sql
   SELECT tgname FROM pg_trigger WHERE tgname = 'release_a_recharge_guard';
   ```
   It must return one row.
5. Check pending recharges settle: watch for `[audit] payment.settled` events. Run `POST /api/admin/payments/reconcile` (dry run) and confirm nothing is stuck.
6. Remove `RECHARGES_PAUSED` (redeploy or restart).
7. Confirm with one small **test-mode** payment, in staging, not production.

**Database migration ordering.** Migrations run at boot, before payment routes are served. They are additive. The guard is created after its columns. Re-running is idempotent.

### Rollback

- **A code rollback does not reopen the vulnerability.** After rolling back to `main`, the guard stays installed: `main`'s migrations neither know about it nor drop it. As a result:
  - recharge creation and settlement **fail closed** (a payment error before anyone pays);
  - every other feature works;
  - pending payments wait in `pending` for a roll-forward, and Razorpay keeps retrying the webhook.
- **Never drop the guard as part of a rollback.** Remove it only deliberately, after deploying code that is safe without it:
  ```sql
  DROP TRIGGER IF EXISTS release_a_recharge_guard ON transactions;
  ```
- Recharges in `review` stay uncredited. `void` redemptions count against the old per-user check, which is conservative.
- The schema itself needs no rollback. Optional removal of the new tables and columns, after the code is reverted and only if needed:

```sql
DROP TABLE IF EXISTS ai_usage_daily;
DROP TABLE IF EXISTS ai_budget_daily;
ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at;
DROP TABLE IF EXISTS ask_usage;
-- entitlements is empty in Release A; check before dropping:
SELECT count(*) FROM entitlements;
DROP TABLE IF EXISTS entitlements;
DROP INDEX IF EXISTS coupon_redemptions_transaction_uq;
ALTER TABLE coupon_redemptions DROP COLUMN IF EXISTS status;
-- Keep settlement_verified_at and the guard (see above).
ALTER TABLE transactions
  DROP COLUMN IF EXISTS gateway_amount_paise, DROP COLUMN IF EXISTS gateway_currency,
  DROP COLUMN IF EXISTS pack_bonus, DROP COLUMN IF EXISTS coupon_bonus, DROP COLUMN IF EXISTS review_reason;
```

Note that dropping `gateway_amount_paise` while the guard exists makes recharge creation fail for any code. Leave the columns.

### Recovery

- **Payments held for review:** `GET /api/admin/payments/review` (admin) lists them with the reason. Compare with the Razorpay dashboard and resolve there (refund) or by policy. No endpoint credits a wallet without a verified payment.
- **Pending recharges** are reconciled every 15 minutes. For older rows, use `POST /api/admin/payments/reconcile` (dry run unless `?apply=1`).
- **Stuck Ask reservations** are released by the sweeper (10 minutes).

## Historical wallet audit (read only, before deploying)

**Who runs it.** An authorised operator, with a **read-only** database role and a Razorpay dashboard export. This session had no production access, so it has **not** been run against production.

**Guarantees.**
- Both SQL files run in a `READ ONLY` transaction that is rolled back.
- The comparison script also sets the session read-only, and calls no API.
- They use only pre-migration columns. Both SQL files were verified on a database built by `main`'s migrations.
- Nothing changes a wallet, transaction or account. Corrections need separate authorisation.

1. **Read-only role** (a DBA runs this once; it grants reads only):
   ```sql
   CREATE ROLE navagraha_audit LOGIN PASSWORD '<set by the DBA>';
   GRANT CONNECT ON DATABASE <db> TO navagraha_audit;
   GRANT USAGE ON SCHEMA public TO navagraha_audit;
   GRANT SELECT ON transactions, coupon_redemptions, coupons, referrals, wallets TO navagraha_audit;
   ALTER ROLE navagraha_audit SET default_transaction_read_only = on;
   ```
2. **Consistency checks** (no Razorpay data needed):
   ```
   psql "$AUDIT_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/forensics/wallet-consistency-checks.sql > checks.txt
   ```
   They report:
   - duplicate credits per payment id and per order;
   - string-amount candidates (`X00` / `X0<coupon>` credited amounts without a pack bonus);
   - direct Snapmint/LazyPay credits;
   - completed recharges with no payment id;
   - coupon redemption mismatches and over-limit coupon use;
   - referral rewards on a first recharge under ₹100;
   - wallet-versus-ledger drift.
3. **Reconciliation against Razorpay.** In the Razorpay dashboard: Transactions → Payments, the full date range, exported as CSV with `id`, `amount`, `currency`, `status`, `amount_refunded`. Then run:
   ```
   DATABASE_URL="$AUDIT_DATABASE_URL" npx tsx scripts/forensics/recharge-forensics.ts \
     --payments razorpay-payments.csv --amount-unit rupees --out findings.csv
   ```
   `findings.csv` flags, per completed Razorpay recharge:
   - `over_credited`: credit above captured + pack bonus + staged coupon;
   - `string_amount_pattern`: the finding 1 signature;
   - `under_credited`;
   - `duplicate_payment_credit`;
   - `not_inr`, `not_captured`, `refunded`;
   - `payment_not_in_export`, `no_payment_id`.

   A summary line gives the total over-credit.
4. Bring `checks.txt` and `findings.csv` for review. Decide on corrections separately.

## Razorpay staging verification (test mode)

This needs, all in **test mode**:
- a staging deployment of this branch with its own database (never production);
- Razorpay **test** keys and a test webhook secret on that deployment;
- a webhook from the Razorpay test dashboard to `https://<staging>/api/payment/razorpay/webhook` with event `payment.captured`, plus `payment.failed` and `refund.*` for observation.

This session could not run it: no test keys, and the network policy here refuses `api.razorpay.com`.

Test matrix: run each case as a fresh test user, and note the audit events in the staging logs.

| # | Case | How | Expected |
|---|---|---|---|
| 1 | Successful recharge | ₹100 custom amount; test card `4111 1111 1111 1111`, any future expiry and CVV, OTP as the test page shows | Wallet +₹100. One `payment.settled` and one `wallet.credit`; the row has `gateway_amount_paise=10000` and `settlement_verified_at` set. |
| 2 | Pack bonus | ₹500 pack | Wallet +₹575 (₹500 + ₹75). |
| 3 | Payment failure | Test card failure flow, or a failure on the test page | No credit. The row stays `pending`, then becomes `failed` after a day. |
| 4 | Amount mismatch | Create an order, then pay a **different** test order and replay its webhook with this order's id (signed with the test secret) | No credit; the row becomes `review` (`amount … expected …`). |
| 5 | Currency mismatch | Replay a captured-payment webhook body with `"currency":"USD"`, signed with the test secret | No credit; the row becomes `review`. |
| 6 | Duplicate webhook | Razorpay dashboard → Webhooks → resend the same `payment.captured` | Credited once; the second delivery has no effect. |
| 7 | Delayed webhook | Disable the webhook, pay, close the tab before verify, then re-enable and resend | Credited once, by the webhook or by the reconciler within 15 minutes. |
| 8 | Concurrent settlement | Pay; resend the webhook while verify is in flight (or run a script calling verify twice) | Credited once. |
| 9 | Refund | Refund case 1's payment in the test dashboard | `payment.refund_observed` is logged; the wallet is not debited automatically (policy). A replayed `payment.captured` with `amount_refunded>0` goes to `review`. |
| 10 | Reconciliation | Pay with the webhook disabled and skip verify; wait 15 minutes, or run `POST /api/admin/payments/reconcile?apply=1` | Credited once. |
| 11 | Coupon | WELCOME50 on a ₹200 first recharge | Wallet +₹300; redemption `applied`. Repeat it: the offer is refused at order time. |
| 12 | Paused | `RECHARGES_PAUSED=true` | New orders get 503; a payment already made is still credited. |

**Pass condition:** in every case, the wallet credit equals the verified captured amount plus the permitted pack and coupon bonus, and nothing more.

## Production prerequisites

These need the owner. None were done here.

1. Run the historical wallet audit above, read only, and decide on anything it flags.
2. Run the Razorpay staging matrix above in test mode, and keep the evidence.
3. In Razorpay, turn **auto-capture on** for all payment methods, including late authorisation. Keep **Offers** (instant discounts) and the **customer-fee-bearer** model off, or such payments will go to `review`.
4. Configure the production webhook (`payment.captured`) with `RAZORPAY_WEBHOOK_SECRET`. Activating live keys is a separate owner decision.
5. Deploy with the procedure above.
6. Build email verification for email/password accounts before turning on `FEATURE_ASK_METERING_ENFORCE`.
7. Confirm the direct Snapmint/LazyPay routes were never used (Razorpay, PayU and Snapmint records).
8. Optionally set `POSTHOG_API_KEY` server-side so audit events reach PostHog.

The referral rules (₹100 minimum, 20 per inviter per 30 days) and the AI and admin limits are approved as provisional safeguards.

The in-memory rate limiters are per instance. The shared controls are the database budgets, metering, locks and the guard.

## Verification levels

- **Automated tests** (all green): `npm test`, plus the Postgres suites (`TEST_DATABASE_URL=… npx vitest run --no-file-parallelism tests/unit/*.db.test.ts`). The suites cover payment integrity, wallet atomicity, the deploy guard, Ask metering, AI controls, report orders, consultation end and the marketplace pause.
- **Old-code check (local):** `main`'s storage code was run against a migrated database and refused by the guard; `main`'s migrations left the guard in place.
- **Pre-migration check (local):** both audit SQL files ran on a database built by `main`'s migrations.
- **Mocked providers:** Razorpay and OpenAI are mocked in tests.
- **Not done:** the Razorpay sandbox (staging), the production audit, and any production deployment.

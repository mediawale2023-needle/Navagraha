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

## Migrations

All are additive and idempotent (`server/migrate.ts`, run on boot), and mirrored in `shared/schema.ts`:

- `transactions`: `gateway_amount_paise`, `gateway_currency`, `pack_bonus`, `coupon_bonus`, `review_reason`.
- `coupon_redemptions.status`, plus the unique index `coupon_redemptions_transaction_uq`. The index is guarded: duplicates skip it with a warning instead of failing boot.
- `users.email_verified_at`.
- New tables:
  - `ask_usage`, with unique `(user_id, idempotency_key)`;
  - `entitlements`, with `CHECK (used BETWEEN 0 AND quantity)` and unique `source_ref`;
  - `ai_usage_daily`, primary key `(subject, day, feature)`, bigint counters;
  - `ai_budget_daily`, primary key `(subject, day)`.

No existing value is rewritten. Balances, transactions and orders are preserved.

### Rollback

Reverting the code is safe without touching the schema: the old code ignores the new columns and tables.
- Recharges in `review` stay uncredited: old code claims only `pending`/`failed`.
- `void` redemptions on completed recharges count against the old per-user check, which is conservative.

Optional schema removal, after the code is reverted:

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
ALTER TABLE transactions
  DROP COLUMN IF EXISTS gateway_amount_paise, DROP COLUMN IF EXISTS gateway_currency,
  DROP COLUMN IF EXISTS pack_bonus, DROP COLUMN IF EXISTS coupon_bonus, DROP COLUMN IF EXISTS review_reason;
```

### Recovery

- **Payments held for review:** `GET /api/admin/payments/review` (admin) lists them with the reason. Compare with the Razorpay dashboard and resolve there (refund) or by policy. No endpoint credits a wallet without a verified payment.
- **Pending recharges** are reconciled every 15 minutes, as before. For older rows, use `POST /api/admin/payments/reconcile` (dry run unless `?apply=1`).
- **Forensics for finding 1, before deploying (read only).** Find completed Razorpay recharges credited more than Razorpay captured.
  - The tooling only reads:
    - `scripts/forensics/recharge-forensics.sql` runs in a `READ ONLY` transaction that is rolled back, and uses only columns that exist before this migration;
    - `scripts/forensics/recharge-forensics.ts` also sets the session read-only and makes no Razorpay API calls.
  - Steps:
    1. Export captured payments from the Razorpay dashboard (CSV columns: `id`, `amount`, `currency`, `status`, `amount_refunded`).
    2. With a read-only database role, run:
       ```
       DATABASE_URL=<read-only role> npx tsx scripts/forensics/recharge-forensics.ts \
         --payments razorpay-payments.csv --amount-unit rupees --out findings.csv
       ```
    3. Review `findings.csv`. Each row lists the credited amount, the captured amount, what the payment justified (captured + pack bonus + staged coupon), the excess, and flags: `over_credited`, `payment_not_in_export`, `not_inr`, `not_captured`, `refunded`.
  - **No wallet balance is changed by this tooling.** Correcting any historical balance needs separate authorisation.
- **Stuck Ask reservations** are released by the sweeper (10 minutes).

## Production prerequisites

These were not done here. They need the owner.

0. Run the read-only forensics above against production before deploying.

1. Run the forensics query above against production before deploying. Decide on any accounts it finds.
2. Configure the Razorpay webhook (`payment.captured`) with `RAZORPAY_WEBHOOK_SECRET`. Verify with a **test-mode** payment in staging. No live credentials were used or changed.
3. Email verification for email/password accounts, before turning on `FEATURE_ASK_METERING_ENFORCE`. The free allowance is per account, and unverified email accounts can be created at will.
4. Referral rules (₹100 minimum, 20 per inviter per 30 days) and the AI and admin limits are approved as provisional safeguards. The reward amounts are unchanged.
7. Razorpay **auto-capture must be on** for all payment methods, including late authorisation. The app credits only captured payments, and does not capture authorised ones. The reconciler audits payments stuck in `authorized`.
8. Razorpay Offers (instant discounts) and the customer-fee-bearer model make the captured amount differ from the order, so such payments go to `review`. Keep both off, or extend settlement first.
9. Deploy without old and new instances overlapping. Old code would settle new recharges without the amount check, and would leave coupon redemptions `staged`.
10. Confirm in Razorpay/PayU/Snapmint records that the direct Snapmint/LazyPay routes were never used. The client has no button for them.
5. Decide the AI daily limits (env, above), and set `POSTHOG_API_KEY` server-side if audit events should reach PostHog.
6. The in-memory per-IP and per-user rate limiters are per instance. The shared controls are the database-backed budgets, metering and locks.

## Verification levels

- **Automated tests** (run here, all green):
  - unit and route tests: `npm test`;
  - Postgres suites: `TEST_DATABASE_URL=… npx vitest run --no-file-parallelism tests/unit/*.db.test.ts` — payment integrity, wallet atomicity, Ask metering, AI controls, report orders, consultation end, marketplace pause.
- **Mocked providers:** Razorpay and OpenAI are mocked in tests. No sandbox and no live gateway call was made.
- **Not done:** sandbox payment, live production verification, deployment.

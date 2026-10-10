# Release B — Ask monetisation, email verification, report prices

Builds on Release A's metering (`ask_usage`, `entitlements`, `server/askMetering.ts`) and wallet controls (`tryDebitBalance`, the recharge guard). Nothing in Release B credits a wallet; every new charge is a conditional debit.

**Every new behaviour is behind a flag that defaults off.** With all flags off, a deployed Release B behaves like Release A, except for these:
- Registration's response gains `verificationEmailSent: false`.
- Wallet debits display as `-₹99.00` (they showed `-₹-99.00`).
- A Google sign-in verifies a stored address that differs only in case.
- Retrying a failed Ask reuses its request id.
- A report order states the price it was shown; a different current price returns 409 before any charge. With the flag off, the price is the stored one, unchanged.

## Flags (`server/features.ts`)

| Flag | Off (default) | On |
|---|---|---|
| `FEATURE_EMAIL_VERIFICATION` | No links sent; resend answers 404; registration sends the welcome email | Registration sends a verification link instead of the welcome email; Account and Ask offer "Send confirmation link". Needs `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` and, in production, `APP_URL` (the public site; links are `${APP_URL}/api/auth/verify-email?token=…`). Without them it behaves as off and logs a warning at boot. |
| `FEATURE_ASK_PACKS` | `GET /api/ask/packs` lists no packs (history still shown); purchase answers 404 | Packs offered in Ask (when out of questions, or via "Get more") and on Wallet |
| `FEATURE_RELEASE_B_PRICING` | Report prices are the stored catalogue: Life ₹1499, Marriage ₹349, Career/Finance ₹299, Year Ahead ₹499 | Career/Marriage/Finance ₹299, Year Ahead ₹499, Complete Life ₹999. Applied in code (`server/reportPricing.ts`); no database row changes |
| `FEATURE_ASK_METERING_ENFORCE` (Release A) | Nobody refused; counts not shown | Questions beyond the allowance answer 402 with the way forward; counts and follow-ups shown |

**Rollout order** (each step separately approved):
1. Configure SMTP and `APP_URL`.
2. Turn on `FEATURE_EMAIL_VERIFICATION`.
3. Wait until existing users can verify.
4. Turn on `FEATURE_ASK_PACKS`, which needs recharges working, i.e. Razorpay out of review.
5. Turn on `FEATURE_ASK_METERING_ENFORCE`.

`FEATURE_RELEASE_B_PRICING` is independent of the others. The server warns at boot if enforcement is on without email verification: email/password accounts would get no free questions.

## Free questions (Phase 1)

- **The free allowance:**
  - Three independent questions, each with one follow-up on the same chart and conversation, for accounts with a verified email.
  - Questions and follow-ups are separate `ask_usage` rows (`kind`).
  - Every decision runs under a per-user lock (`reserveAskUsage`).
  - A request id is answered once: a retry of a delivered answer replays it, and one still in flight answers 409.
  - A failed or deterministic-fallback answer releases the question.
- **Retries:** the Ask page now keeps the request id of a question whose answer did not arrive. "Try again" sends that id, so the server answers it once and never takes a second question for it.
- **Admins:** admin accounts stay unlimited (`entitlement 'admin'`).
- **Existing data:** conversations, wallets and existing entitlements are untouched.

## Email verification (Phase 2)

- **Tokens:**
  - A token is 32 random bytes (base64url); `email_verification_tokens` stores only its SHA-256.
  - It is single use and expires after 24 h; a new link ends the previous unused one.
  - Each link is issued for the account's normalised address.
- **Resend** (`POST /api/auth/verify-email/resend`):
  - It needs sign-in and only ever sends to the signed-in account's own address. There is no lookup by address, so nothing can be enumerated.
  - Limits: one a minute and five a day per account, held in the database under a per-user lock, plus a per-user rate limit.
  - It answers 202 sent, 200 `alreadyVerified`, 429 `verification_throttled` with `Retry-After`, 503 `email_unavailable`, or 404 while the flag is off.
- **Link** (`GET /api/auth/verify-email?token=`):
  - It always answers with a 303 redirect to `/verify-email?status=verified|already|expired|invalid|conflict|error`, with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
  - A malformed token never reaches the database, and the token is never logged.
  - It needs no session, and works with the flag off so links already sent still verify.
  - A link for an address the account no longer has verifies nothing. Neither does one for an address another verified account already holds (case variants from before addresses were normalised); that returns `conflict`.
- **Google sign-in** verifies the account's address when Google signs in that mailbox, in any case (`googleVerifiesAccountEmail`). Existing Google users with no `email_verified_at` are verified at their next Google sign-in, or can use resend. There is deliberately no backfill: older Google sign-ins did not check that Google had verified the address.
- **Audit:** `auth.email_verification_sent`, `auth.email_verification_throttled` and `auth.email_verified` record ids only.
- **Known and unchanged:** `POST /api/auth/register` still answers 409 for a taken address, so registration can reveal whether an address has an account. It predates Release B; closing it needs a different sign-up flow.

## Question packs (Phase 3)

- **Catalogue** (`server/askPacks.ts`): ₹29 for 1 question, ₹99 for 5, ₹199 for 12. Two follow-ups per question; no expiry. Price and quantity come only from the server.
- **`storage.purchaseAskPack`:**
  - It runs under a per-user lock, in one transaction: `tryDebitBalance` (never below zero), a `debit` transaction, and an `ask_questions` entitlement whose `transaction_id` points at that debit.
  - A request id buys once (`source_ref = askpack:<user>:<request>`, unique). Reusing a request id for another pack is refused.
  - An insufficient balance writes nothing.
  - Admin accounts are refused (409 `free_access_unlimited`); they already ask without limit.
- **Drawing questions:** free questions first, then the oldest unexpired pack. A released question goes back to its pack.
- **Endpoints:**
  - `GET /api/ask/packs` returns the catalogue, balance, allowance and the user's pack history (price, used, left).
  - `POST /api/ask/packs/purchase {packId, requestId}` answers 201 bought, 200 replay, 400, 402 `insufficient_balance` with `required`, 404 while off, or 409.
- **Audit:** `wallet.debit` (`reason: ask_pack`), `ask.pack_purchased` and `ask.pack_refused`.
- **No refunds** for unused questions. A refund path would add a wallet credit, which `tests/unit/credit-paths.test.ts` deliberately pins.

## Report prices (Phase 4)

- `reportPrice()` prices both the listing (`GET /api/reports/types`) and the order, so a customer is charged what they were shown.
- The client sends `expectedPrice`. A different current price answers 409 `price_changed` before any charge, and the catalogue refreshes.
- Generation, admin free reports (5 a day, admin AI budget) and the report catalogue rows are unchanged.

## Migrations (`server/migrate.ts`, additive and idempotent)

```sql
CREATE TABLE IF NOT EXISTS email_verification_tokens (...);   -- + unique index on token_hash, index on (user_id, created_at)
ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS transaction_id varchar;
```

No existing row is read-modified-written.
- **Checked:** wallets, transactions, report orders, entitlements, Ask usage and users had identical fingerprints before and after migrating twice.
- **Rollback compatibility:** `main` without Release B passes all 74 of its database tests against a database with Release B's migrations, so a code rollback needs no schema change.

**Rollback (deliberate only):**
1. Turn the flags off. This is enough for everything except the always-on changes listed at the top.
2. Redeploy the previous commit.
3. Only if the schema must go:

   ```sql
   DROP TABLE IF EXISTS email_verification_tokens;
   ALTER TABLE entitlements DROP COLUMN IF EXISTS transaction_id;
   ```

   Do not drop `entitlements` rows: bought questions belong to customers.

## Verification levels

| Level | What |
|---|---|
| Automated, no database | Route tests: `email-verification.test.ts`, `ask-packs.test.ts`, `release-b-pricing.test.ts` |
| Automated, real Postgres | `email-verification.db.test.ts` (single use, expiry, throttles, ten concurrent uses of one link, address change, case-variant conflict, unlocks the free questions), `ask-packs.db.test.ts` (atomic debit and grant, ten concurrent replays buy once, concurrent purchases never overdraw, insufficient balance writes nothing, admins refused, follow-ups and release) |
| Browser, local build with every flag on | `scripts/acceptance/release-b.mjs`: 11 checks on desktop and mobile |
| Not verified | Real email delivery (no SMTP here); packs bought with money added by a real Razorpay recharge (Razorpay is in review) |

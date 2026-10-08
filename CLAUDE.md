# CLAUDE.md — Navagraha

Vedic astrology marketplace (Astrotalk-style). Full-stack TypeScript: React + Vite client, Express + Drizzle + Postgres server, shared Zod schema.

> Read this file before making changes. Its main job is to stop features being **rebuilt** or **broken**. If you add/remove a feature, update the Feature Inventory below in the same change.

## Commands

```bash
npm run dev      # dev server (client + server) on :5000
npm run build    # vite build + esbuild server bundle — MUST pass before commit
npm run check    # tsc typecheck (alias: npx tsc) — MUST pass before commit
npm test         # vitest run — MUST pass before commit
# Browser acceptance for the launch UX fixes (against a running build): scripts/acceptance/README.md
npm run db:push  # push schema to DB (drizzle-kit)
```

Before every commit: `npx tsc && npm run build && npm test` must all be green.

## Architecture map

- `client/src/pages/*` — one file per page/route. Routes registered in `client/src/App.tsx`.
- `client/src/components/*` — shared UI (shadcn/ui in `components/ui`). Nav: `TopNav.tsx` (desktop), `BottomNav.tsx` (mobile).
- `client/src/lib/*` — `queryClient.ts` (`apiRequest`), `push.ts` (FCM, lazy), `agora.ts` (SDK loader), `analytics.ts`.
- `server/routes.ts` — ALL API routes (one big file). `server/storage.ts` — ALL DB access (the `IStorage` class). `server/index.ts` — bootstrap.
- `server/migrate.ts` — idempotent raw-SQL migrations + seeds; runs on boot. Keep in sync with `shared/schema.ts`.
- `shared/schema.ts` — Drizzle tables + Zod insert schemas + types. Single source of truth for the data model.
- **V3 calculation pipeline (single source of natal truth)** — birth input → `server/astroEngine/birthResolver.ts` (coordinates → IANA zone via `geo-tz/all` or explicit `timezone`; historical offset from the tz database; DST gaps/folds rejected unless `utcOffset` disambiguates; UTC instant) → `server/astroEngine/canonical/compute.ts` (`computeCanonicalChart`: Swiss Ephemeris/`sweph` Moshier mode, **Lahiri**, mean node, whole-sign houses) → `CanonicalChart` (`shared/v3/canonical.ts`, strict versioned Zod schema; malformed charts throw). Every consumer reads it: `getKundli` (returns the legacy `chartData` shape as a pure projection via `canonical/legacy.ts`, with `chartData.canonical` embedded), transits, matching, Panchang, Prashna (`prashna.ts`), and the professional `jyotishEngine.ts`. **Do not add another astronomy path**; the Keplerian `planets.ts`/`core.ts` and `swissChart.ts` were deleted.
- `server/astroEngine/*` — pure Jyotish rule modules over canonical longitudes: vargas D1/D3/D4/D7/D9/D10/D12/D60 (`vedic.ts`), Vimshottari (birth Mahadasha at its true start) + Yogini (`dasha.ts`), dignity/avastha (`dignity.ts`), bhava/aspects (`bhava.ts`), Ashtakavarga (`ashtakavarga.ts`), yogas (`yogas.ts`), doshas (`doshas.ts`), Jaimini karakas + Chara Dasha (marked unverified), functional remedies (`remedies.ts`), partial Shadbala (`canonical/shadbala.ts` — Uchcha/Dig/Naisargika only, **no total Rupas**). Longitudes are read through `lon.ts` (missing body throws, never 0°).
- **Evidence → Resolution → Timeline** (`server/astroEngine/evidence/*`, types in `shared/v3/evidence.ts`): deterministic per-domain evidence (9 domains; health deliberately excluded) with rule, chart fact, source, provenance and birth-time dependence; qualitative verdicts + confidence (no percentages); Life Timeline from canonical Vimshottari. `buildInsights(chart, asOf)`.
- **Golden-chart suite**: `tests/unit/golden-astronomy.test.ts` (44 charts; expected values from the independent pipeline in `scripts/golden/*`, provenance in `tests/golden/README.md`) and `tests/unit/golden-jyotish-rules.test.ts`. Regenerate fixtures with `npx tsx scripts/golden/generate.ts` only deliberately.
- **Legacy charts**: `canonical/upgrade.ts` (pure) recalculates pre-V3 saved charts on owner access and routes serve that as a **read-only view** via `currentChart()` (single-flight, after the ownership check) — the DB row is NOT written unless `V3_PERSIST_LEGACY_UPGRADES=true`, and then only by compare-and-swap (`storage.persistLegacyUpgrade`) keeping `legacySnapshot` + `legacyColumns` for exact rollback (SQL in `docs/V3_IMPLEMENTATION_REPORT.md`). Charts without coordinates/valid time are `limited`, never guessed. AI context (horoscope, briefs, matching, follow-ups) uses `verifiedChart()` (V3 only); paid report orders return 409 before any debit for a non-V3 chart; reports for an approximate birth time omit Lagna/houses/dasha dates and carry `disclosure`.
- **Feature gates** (`server/features.ts`, all default off): `FEATURE_AI_COUNCIL` (deep questions → council), `FEATURE_CHARA_DASHA` (Chara in pro AI), `V3_PERSIST_LEGACY_UPGRADES`. **Boot self-check** `astroEngine/selfCheck.ts` must pass before routes register (no approximate-astronomy fallback).
- `server/agents/*` — **Ask Your Kundli** (`askKundli.ts`): deterministic router → evidence packet → one explanation call (simple; also deep while `FEATURE_AI_COUNCIL` is off) or the council `runCouncil` (deep, fed only the packet) → **guard v2** (`answerGuard.ts`: sign/house/Lagna, yogas, doshas, running dasha, nakshatra, retrograde, dignity, combustion, years) → regenerate once → deterministic fallback (also used without `OPENAI_API_KEY`). Evidence items are `core` (decide verdicts) or `experimental` (shown, never counted); verdicts include `Insufficient evidence`. `astro-engine-rs/` — Rust service: only `/synastry` (koota scoring on canonical inputs) and `/remediation` are called; `/calculate` (heuristic Shadbala, mixed-frame vargas) and `/prashna` are **retired** — `callAstroEngine` stays fail-closed.
- Services: `paymentService.ts`, `pushService.ts`, `agoraService.ts`, `emailService.ts`, `aiAstrologerService.ts`, `websocketService.ts`.

## Feature Inventory — these ALREADY EXIST. Do not rebuild; extend.

Search `server/routes.ts` + `client/src/pages` before building anything below.

**User**
- Auth: Google OAuth + email/password (`server/auth.ts`). NOT Replit OIDC.
- Kundli **list** (`/kundli`, `MyCharts.tsx` — saved charts + "generate new"; this is the Charts nav target), generate (`/kundli/new`; optional `timezone`/`utcOffset`), view (`/kundli/:id`), matchmaking, numerology, prashna (TypeScript on canonical astronomy, `astroEngine/prashna.ts`), synastry, remedies (`Matchmaking`, `Numerology`, `Prashna`, `Remedies.tsx`).
  - Birth-place fields everywhere use `PlacesAutocomplete` (`lib/placeSearch.ts`): our own combobox over Google **Places API (New)** (`AutocompleteSuggestion` + `Place.fetchFields`). Never reattach the legacy `places.Autocomplete` widget — the production key cannot call the legacy API, and the widget then disables the input mid-typing. Coordinates come only from a picked suggestion; typing clears them.
- Horoscope (`/horoscope`), **Panchang** (`/panchang`, `server/astroEngine/panchang.ts`, `GET /api/panchang?date&lat&lng[&tz&place]` — real Swiss sunrise/sunset, the place's IANA zone and local civil date; disclosed New Delhi default without a location).
  - **Personalised daily horoscope**: `GET /api/horoscope/personal` (`generateDailyHoroscope` in `aiAstrologerService.ts`) derives a per-user daily card from the most recent chart's dasha, cached once/day per user in `dailyHoroscopes`. Shown atop the Horoscope page.
- **Ask Your Kundli** (AI chat, `/ai-astrologer`, `server/agents/askKundli.ts`; deep questions use `runCouncil`; deep links `?q=&kundliId=`) — pick a saved chart **or enter birth details** (computed in-memory, not saved; `birthDetails` on `POST /api/ai/chat`), **per-chart conversation threads** (session per chart in localStorage; prior turns are read from the stored session, never from the client), **multi-language** replies (language directive injected into the council synthesizer/ethicist), life-area quick-question chips. `runCouncil` re-derives the running dasha from today's date and injects it + today as authoritative facts. **Long-term memory**: `extractMemories` pulls durable facts/goals/events from each message into `userMemories`; recent memories are injected into the council so the AI remembers the user across sessions.
- **Kundli V3 experience** (`KundliView.tsx`): headline (Lagna · Moon · Sun, calculation method), **Chart at a Glance** (`components/v3/ChartGlance.tsx`), **Evidence Sheet** (`components/AIInsightSheet.tsx`, domain + planet modes), **Life Timeline** (`components/v3/LifeTimeline.tsx`, Insights tab). APIs: `GET /api/kundli/:id/insights` (owner), `POST /api/kundli/insights` (guest preview; validated canonical, no storage/AI, rate-limited). Home **Active Influences** (`components/v3/ActiveInfluences.tsx`) and **Remedies** read the user's own chart — never hard-code personal astrology.
  - **Never state an unverified placement** (launch UX fixes): `GET /api/kundli` recalculates pre-V3 rows as read-only views and projects them through `listedChart` (`canonical/upgrade.ts`) — approximate time withholds the Ascendant (and the Moon sign when `uncertainty.moonSignStableAcrossBirthDate` is false); a `limited` chart lists no placements. A limited chart's page shows only birth details + **Recreate with birth place** (`lib/recreateChart.ts`, prefills `/kundli/new?name&gender&dob&tob`, never the place). With an approximate time the Chart tab (`lib/approximateChart.ts`) draws a Chandra Lagna chart only when the Moon's sign is stable across the birth date, else a sign-only table; D9/D10/D60, yogas and house bindus are withheld. `?tab=` deep-links a Kundli tab.
  - Running periods anywhere in the UI (Home `RunningPeriodCard`, Active Influences, Ask) go through `selectRunningPeriods` (`lib/runningPeriods.ts`), which honours `insights.timing`. Birth-star gemstones are reconciled with the functional rules (`reconcileBirthStarRemedies`, applied at build and on read in `currentChart`).
  - Chart labels: `lib/chartLabels.ts` (℞, no degrees, keyboard-operable planets).
- Astrologer list/detail, **follow/favourite** (heart), **waitlist** when offline (`/astrologers`, `/api/astrologers/:id/follow`, `/waitlist`).
- Chat (WebSocket), voice/video calls (Agora, `/call/:id`), per-minute billing in `websocketService.ts`.
- Wallet + recharge: Razorpay, Snapmint (BNPL), LazyPay (`Wallet.tsx`, `paymentService.ts`).
- **Offers/coupons** (`/api/coupons`, admin CRUD), **referrals** (`/api/referral`), **first-chat-free** (free minutes in billing loop).
- **Astromall** store (`/store`), **paid reports** (`/reports`, async AI gen), **book a pooja** (`/pooja`) — all wallet checkout via `storage.debitWallet`.
  - Report `content` (JSONB) embeds structured chart data (birthDetails, planetaryPositions, houses, dashaTimeline) alongside AI narrative; `generateReport` in `aiAstrologerService.ts` derives these from the kundli. Client renders the North Indian chart + tables and offers **Download PDF** (`client/src/lib/reportPdf.ts`, lazy `jspdf`).
  - **Complete Life Report** (premium ₹1499, category `life_complete`, seeded idempotently in `migrate.ts`): `generateLifeReport` runs ~11 parallel gpt-4o batches (every planet & house, yogas, doshas + live Saturn-transit Sade Sati, life domains, dasha life-map, remedies) → ~50 sections / 50+ pages. Order route dispatches on `category === 'life_complete'`. PDF adds a Contents page when sections > 12.
- **Live streaming** viewer (`/live`, `/live/:id`) — chat (polling) + paid gifting.
- Reviews, scheduled calls, notifications (in-app + **FCM push** `pushService.ts`).

**Astrologer** (`/astrologer/*`, session via `req.session.astrologerId`, `isAstrologerAuthenticated`)
- Dashboard, online/offline toggle, consultations, schedule, earnings, payouts.
- **KYC** submit + verified badge (`POST /api/astrologer/kyc`).
- **Go Live** broadcaster studio (`/astrologer/live`, `LiveStudio.tsx`).
- **Pro practice workspace** (`/astrologer/pro`, tab on `/astrologer/login`): private client CRM + Swiss chart + Parashar / K.N. Rao / Kamakhya AI co-pilot + session query box. Tenant APIs under `/api/astrologer/pro/*` (profiles scoped by `astrologerId`); Studio soft-caps AI at 80 credits/month (`proAiCreditsUsed`). Shared UI with admin Jyotish Reading via `apiBase` prop. Boot seed: `seedProAstrologer()` creates verified `PRO_ASTROLOGER_EMAIL` / `PRO_ASTROLOGER_PASSWORD` (defaults `pro@navagraha.app` / `ProDemo@2026`).

**Admin** (`isAdmin` via `ADMIN_EMAILS`)
- Dedicated login at `/admin/login` (`AdminLogin.tsx`) — email/password; on success probes `/api/admin/stats` to confirm whitelisting before routing to the dashboard. No separate admin account; admin = a user whose email is in `ADMIN_EMAILS`.
- Bootstrap admin: set `ADMIN_EMAIL` + `ADMIN_PASSWORD` env vars. On boot, `seedAdminUser()` in `server/migrate.ts` creates (or password-syncs) that user, and `getAdminEmails()` treats `ADMIN_EMAIL` as admin — so the single pair both creates a loginable account and grants admin. Admin identity is centralized in `server/adminAccess.ts` (`getAdminEmails`/`isAdminEmail`).
- **Free access for testing**: admin accounts ride free across all paid features. `storage.hasFreeAccess(userId)` (true when the user's email is an admin) bypasses `debitWallet` (records a ₹0 transaction, never decrements) and the per-minute billing loop in `websocketService.ts`.
- Dashboard (stats, astrologers), homepage CMS, **coupons CRUD**, **Operations tab** (orders, pooja bookings, KYC review).

## Data model (tables in `shared/schema.ts`)

users, astrologers, kundlis (`chartData.canonical` = CanonicalChart V3; `legacySnapshot`/`migration` for upgraded charts), wallets, transactions, chatMessages, consultations, reviews, scheduledCalls, notifications, astrologerEarnings, payoutRequests, aiChatMessages, userMemories, predictionFeedbacks, homepageContent, **coupons, couponRedemptions, referrals, pushTokens, products, orders, orderItems, reportTypes, reportOrders, dailyHoroscopes, poojas, poojaBookings, liveStreams, streamMessages, astrologerFollows, consultationQueue**, **jyotishClientProfiles** (admin `createdByUserId` or Pro `astrologerId`), **jyotishReadings**, **jyotishSessionQueries**.

## Conventions

- New DB field → edit `shared/schema.ts` AND add idempotent DDL (`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`) to `server/migrate.ts`. They must match.
- Paid in-app purchases use `storage.debitWallet(userId, cost, desc)` (returns null on insufficient balance). Compute totals server-side; never trust client prices.
- Third-party integrations (Razorpay, Agora, Firebase, OpenAI, Google Maps) must **degrade gracefully** when their env keys are absent — never crash boot.
- Client data fetching: TanStack Query with the URL as `queryKey`; mutations via `apiRequest`. Failures throw `ApiError` (`lib/apiError.ts`: readable `message`, `status`, optional `field`) — branch on `status`, never parse the message; show `field` errors on the form field. Never surface raw response bodies.
- Promotional copy must match what billing does: the free-chat entitlement is `FREE_CHAT_MINUTES` (first chat only), exposed as `freeChatMinutes` in `/api/config`; seeded homepage copy is corrected only by guarded, idempotent UPDATEs (`HOMEPAGE_COPY_FIXES` in `migrate.ts`) that match untouched seed text.
- Keep secrets out of logs and responses (astrologer `passwordHash`/`bankAccountNumber` are stripped from API output).
- Comments: only explain non-obvious "why". No narration.

## Do NOT

- Add a second natal astronomy calculation, or let an LLM state/compute placements; extend `canonical/compute.ts` and the evidence engine instead.
- Re-enable Rust `/calculate` until its frame, ayanamsa, longitude and varga methodology are reconciled and golden-tested.
- Show hard-coded personal astrology, fabricated scripture citations or numeric "confidence" percentages.
- Hand-edit `tests/golden/fixtures.json` or regenerate it from the engine under test.

- Re-add the "Corporate/Boardroom" AI subsystem (removed: it wrote files + ran `git push` via shell = injection risk). No `child_process` git automation.
- Break the per-minute billing loop in `websocketService.ts` or the first-chat-free skip.
- Add a second copy of a route/page that already exists (check the Inventory first).
- Change auth to Replit OIDC (docs once claimed this; it's wrong).

## Known caveats (intentional, not bugs to "fix" blindly)

- Store/report/pooja/gift checkout is wallet-based (no direct per-item gateway yet).
- Live chat uses polling; Agora handles real-time A/V. Stream viewer counts are approximate.
- Natal charts, Panchang and Prashna use the place's historical time zone and real (Swiss) sunrise. With an approximate birth time, Lagna/houses and any dasha period that could differ across the birth date are excluded and disclosed.
- Chara Dasha is lineage-dependent and marked unverified in the canonical chart; consumer evidence/timeline use Vimshottari only.
- Shadbala is partial (Uchcha/Dig/Naisargika); never present a total.

## Dev branch

Work on `claude/product-astrotalk-analysis-nYkTs`. Do not push to `main` without explicit permission.

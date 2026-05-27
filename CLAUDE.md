# CLAUDE.md — Navagraha

Vedic astrology marketplace (Astrotalk-style). Full-stack TypeScript: React + Vite client, Express + Drizzle + Postgres server, shared Zod schema.

> Read this file before making changes. Its main job is to stop features being **rebuilt** or **broken**. If you add/remove a feature, update the Feature Inventory below in the same change.

## Commands

```bash
npm run dev      # dev server (client + server) on :5000
npm run build    # vite build + esbuild server bundle — MUST pass before commit
npm run check    # tsc typecheck (alias: npx tsc) — MUST pass before commit
npm test         # vitest run — MUST pass before commit
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
- `server/astroEngine/*` — native TS astrology engine (kundli, dasha, horoscope, **panchang**). Every chart's `chartData` also carries **D9 Navamsa** (`navamsaSign`/`navamsaDegree` in `vedic.ts`) and **Ashtakavarga** BAV+SAV (`ashtakavarga.ts`, canonical 337-bindu tables) — both deterministic, always-on (no Rust), unit-tested, rendered in KundliView/reports/PDF and fed into the AI chart summary. `server/agents/*` — AI "Super-Astrologer Council" (`runCouncil`) used by the AI astrologer. `astro-engine-rs/` — Rust engine (shadbala/yoga).
- Services: `paymentService.ts`, `pushService.ts`, `agoraService.ts`, `emailService.ts`, `aiAstrologerService.ts`, `websocketService.ts`.

## Feature Inventory — these ALREADY EXIST. Do not rebuild; extend.

Search `server/routes.ts` + `client/src/pages` before building anything below.

**User**
- Auth: Google OAuth + email/password (`server/auth.ts`). NOT Replit OIDC.
- Kundli **list** (`/kundli`, `MyCharts.tsx` — saved charts + "generate new"; this is the Charts nav target), generate (`/kundli/new`), view (`/kundli/:id`), matchmaking, numerology, prashna, synastry, remedies (`Matchmaking`, `Numerology`, `Prashna`, `Remedies.tsx`).
- Horoscope (`/horoscope`), **Panchang** (`/panchang`, `server/astroEngine/panchang.ts`, `GET /api/panchang`).
  - **Personalised daily horoscope**: `GET /api/horoscope/personal` (`generateDailyHoroscope` in `aiAstrologerService.ts`) derives a per-user daily card from the most recent chart's dasha, cached once/day per user in `dailyHoroscopes`. Shown atop the Horoscope page.
- AI Astrologer chat (`/ai-astrologer`, `runCouncil`) — pick a saved chart **or enter birth details** (computed in-memory, not saved; `birthDetails` on `POST /api/ai/chat`), **per-chart conversation threads** (session per chart in localStorage), **multi-language** replies (language directive injected into the council synthesizer/ethicist), life-area quick-question chips. `runCouncil` re-derives the running dasha from today's date and injects it + today as authoritative facts. **Long-term memory**: `extractMemories` pulls durable facts/goals/events from each message into `userMemories`; recent memories are injected into the council so the AI remembers the user across sessions.
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

**Admin** (`isAdmin` via `ADMIN_EMAILS`)
- Dedicated login at `/admin/login` (`AdminLogin.tsx`) — email/password; on success probes `/api/admin/stats` to confirm whitelisting before routing to the dashboard. No separate admin account; admin = a user whose email is in `ADMIN_EMAILS`.
- Bootstrap admin: set `ADMIN_EMAIL` + `ADMIN_PASSWORD` env vars. On boot, `seedAdminUser()` in `server/migrate.ts` creates (or password-syncs) that user, and `getAdminEmails()` treats `ADMIN_EMAIL` as admin — so the single pair both creates a loginable account and grants admin. Admin identity is centralized in `server/adminAccess.ts` (`getAdminEmails`/`isAdminEmail`).
- **Free access for testing**: admin accounts ride free across all paid features. `storage.hasFreeAccess(userId)` (true when the user's email is an admin) bypasses `debitWallet` (records a ₹0 transaction, never decrements) and the per-minute billing loop in `websocketService.ts`.
- Dashboard (stats, astrologers), homepage CMS, **coupons CRUD**, **Operations tab** (orders, pooja bookings, KYC review).

## Data model (tables in `shared/schema.ts`)

users, astrologers, kundlis, wallets, transactions, chatMessages, consultations, reviews, scheduledCalls, notifications, astrologerEarnings, payoutRequests, aiChatMessages, userMemories, predictionFeedbacks, homepageContent, **coupons, couponRedemptions, referrals, pushTokens, products, orders, orderItems, reportTypes, reportOrders, dailyHoroscopes, poojas, poojaBookings, liveStreams, streamMessages, astrologerFollows, consultationQueue**.

## Conventions

- New DB field → edit `shared/schema.ts` AND add idempotent DDL (`ADD COLUMN IF NOT EXISTS` / `CREATE TABLE IF NOT EXISTS`) to `server/migrate.ts`. They must match.
- Paid in-app purchases use `storage.debitWallet(userId, cost, desc)` (returns null on insufficient balance). Compute totals server-side; never trust client prices.
- Third-party integrations (Razorpay, Agora, Firebase, OpenAI, Google Maps) must **degrade gracefully** when their env keys are absent — never crash boot.
- Client data fetching: TanStack Query with the URL as `queryKey`; mutations via `apiRequest`.
- Keep secrets out of logs and responses (astrologer `passwordHash`/`bankAccountNumber` are stripped from API output).
- Comments: only explain non-obvious "why". No narration.

## Do NOT

- Re-add the "Corporate/Boardroom" AI subsystem (removed: it wrote files + ran `git push` via shell = injection risk). No `child_process` git automation.
- Break the per-minute billing loop in `websocketService.ts` or the first-chat-free skip.
- Add a second copy of a route/page that already exists (check the Inventory first).
- Change auth to Replit OIDC (docs once claimed this; it's wrong).

## Known caveats (intentional, not bugs to "fix" blindly)

- Store/report/pooja/gift checkout is wallet-based (no direct per-item gateway yet).
- Live chat uses polling; Agora handles real-time A/V. Stream viewer counts are approximate.
- Timezone is fixed IST; Panchang timings use standard sunrise/sunset tables.

## Dev branch

Work on `claude/product-astrotalk-analysis-nYkTs`. Do not push to `main` without explicit permission.

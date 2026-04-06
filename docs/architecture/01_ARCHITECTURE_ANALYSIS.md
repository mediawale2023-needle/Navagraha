# Navagraha — Architectural Analysis
**Prepared by:** Senior Systems Architect  
**Date:** April 2026  
**Version:** 1.0  
**Branch:** `claude/navagraha-architecture-redesign-ZtOfs`

---

> **Brutally honest. CTO-level thinking. No developer comfort zones.**

---

## 0. FIRST — A CRITICAL CORRECTION

You described this as "Flutter frontend (Riverpod)". **It is not.**

The actual frontend is **React 18 + TypeScript + TanStack Query + Vite**. This is a significant gap between the stated architecture and reality. Before any planning happens, make sure everyone on the team is working from the same accurate picture.

This document analyzes the actual codebase.

---

## 1. WHAT YOU HAVE (HONEST ASSESSMENT)

Navagraha is **more complete than most early-stage startups**, and that's the real risk. You have enough working features to attract users, but the underlying architecture has landmines that will explode at 10K concurrent users — let alone 1M.

### What's genuinely good
- Rust microservice for astronomical calculations (correct instinct — keep this isolated)
- Shared TypeScript schema between frontend and backend (single source of truth)
- Graceful degradation when external APIs are absent
- Drizzle ORM with Zod validation (type-safe all the way down)
- Multi-agent AI council architecture (the right idea, wrong execution)
- Razorpay + signature verification (payment handling is sound)

### What will kill you at scale
Six things. Ranked by severity.

---

## 2. THE SIX ARCHITECTURAL LANDMINES

### Landmine #1 — WebSocket Billing Is a Financial Liability (CRITICAL)

**The Problem:**
Billing runs as a `setInterval` inside a WebSocket connection. If the connection drops — network flap, server restart, client crash — billing stops but the Agora call continues. The user keeps talking, the astrologer keeps working, no money moves.

Worse: you have `Map<consultationId, Timer>` in memory. If the Node.js process restarts mid-consultation (Railway restarts on deploy), **all active billing timers are gone**. Users get free consultations. Astrologers don't get paid. Your platform absorbs the loss.

**This is not a theoretical edge case.** Railway auto-restarts on deploy. Your billing will be wrong every time you ship.

**Severity:** Revenue loss. Potential legal disputes with astrologers.

---

### Landmine #2 — No Redis = No Scaling (CRITICAL)

You have **zero caching infrastructure**. Every single request hits the database or recomputes from scratch:

- Horoscopes for 12 signs are regenerated **on every request** — these don't change for 24 hours
- Kundli interpretations (expensive LLM calls) are not cached — if 500 users view the same birth chart parameters, you make 500 LLM calls
- Sessions are stored in PostgreSQL (`connect-pg-simple`) — the sessions table becomes a write-intensive hot spot at scale
- AI Council runs **5 parallel LLM calls** synchronously per user query — no result caching whatsoever

Without Redis, you cannot:
- Scale WebSocket across multiple Node.js instances (WebSocket state is local to one process)
- Queue AI jobs
- Cache planetary calculations
- Implement proper session management

**Severity:** Hard ceiling at ~500 concurrent users before DB latency cascades.

---

### Landmine #3 — Synchronous AI Council Will Cause Timeouts (HIGH)

The AI Council orchestrator runs 5 LLM agents in `Promise.all()`, then a synthesizer, then an ethicist gate — **all synchronously on the HTTP request**. This is 6-7 sequential/parallel LLM API calls blocking a single Express request.

```
User request → 5 agents (parallel, ~3-5s) → synthesizer (~2s) → ethicist (~1s) = 6-8 seconds
```

At load:
- Express has no built-in request timeout — this blocks the thread
- OpenAI rate limits will cause 429s that aren't gracefully handled
- If one agent call hangs at 30s, the whole council hangs
- Railway has a 60s request timeout — you're living dangerously

No job queue means no retry logic, no dead letter queue, no user feedback while waiting.

**Severity:** Broken UX at >100 concurrent AI users. Total failure at >500.

---

### Landmine #4 — Single-Node WebSocket Cannot Scale Horizontally (HIGH)

Your WebSocket service uses in-memory Maps:
```typescript
Map<userId, WSClient>
Map<astrologerId, WSClient>  
Map<consultationId, Timer>
```

If you run 2 Railway instances (which you must for high availability), a user connected to Instance A cannot receive messages sent by the astrologer connected to Instance B. **Chat breaks. Billing breaks. Presence broadcasts are wrong.**

The fix requires Redis Pub/Sub as a WebSocket backplane — but you have no Redis. You are currently hard-locked to a single instance, which means zero horizontal scaling and zero redundancy.

**Severity:** Outage = total platform down. Cannot achieve >99% uptime without this fix.

---

### Landmine #5 — JSONB Blobs Are a Data Science Dead End (MEDIUM)

Your `kundlis` table stores the entire chart as opaque JSONB:
```sql
chartData   JSONB  -- planetary positions, houses
dashas      JSONB  -- vimshottari timeline
doshas      JSONB  -- mangal, kaal sarp, pitru
remedies    JSONB  -- recommendations
```

This means:
- You cannot query "all users with Mars in 7th house" — the data is buried in a blob
- You cannot train a prediction accuracy model on planetary positions
- You cannot run analytics on dasha patterns vs. consultation topics
- You cannot index planetary positions for search/filtering

Your `predictionFeedbacks` table with Bayesian feedback is brilliant — but it can't reach the underlying chart data to learn from it because it's locked in JSONB. The feedback loop is mathematically incomplete.

**Severity:** Kills your AI accuracy improvement loop. Technical debt compounds over time.

---

### Landmine #6 — The Corporate C-Suite Feature Is Strategic Distraction (MEDIUM)

You have 8 AI "executives" running morning standups and evening check-ins, creating `boardroom_messages`, managing `aiInitiatives`, and executing `aiDirectives` with `proposedChanges` JSON blobs.

This has **nothing to do with Vedic astrology**. It is a separate product accidentally living inside your astrology app. It shares your database, competes for your OpenAI budget, and adds complexity to your deployment.

The tables (`aiCompanies`, `aiEmployees`, `aiInitiatives`, `aiDirectives`, `boardroomMessages`) should be extracted to a separate service or removed entirely until Navagraha hits product-market fit.

**Severity:** Dilutes focus. Wastes token budget. Confuses your data model.

---

## 3. COMPLETE STRUCTURAL WEAKNESS INVENTORY

### Authentication & Sessions
| Issue | Risk |
|-------|------|
| `connect-pg-simple` sessions in Postgres | DB hot spot at scale |
| Session-based auth (not JWT/stateless) | Can't scale horizontally without sticky sessions |
| No refresh token rotation | Security gap |
| Google OAuth only for social login | Limits acquisition (no Apple Sign-In) |
| No MFA support | Security gap for high-value accounts |

### API Layer
| Issue | Risk |
|-------|------|
| Rate limiting is "optional" in code | DDoS and abuse vectors open |
| No API versioning (`/api/v1/`) | Breaking changes affect all clients immediately |
| No request schema validation middleware | Malformed inputs reach business logic |
| No circuit breakers | Cascade failures when OpenAI/Razorpay/Agora go down |
| Swagger docs exist but no contract testing | Docs drift from reality |
| `/api/config` exposes API keys to frontend | Potential key leakage in browser |

### Data Layer
| Issue | Risk |
|-------|------|
| No Redis | No caching, no pub/sub, no job queue |
| JSONB blobs for chart data | Unqueryable, unindexable |
| No database indexing strategy documented | Slow queries at scale |
| No read replicas | All reads hit the primary write DB |
| No soft deletes on `users`, `kundlis` | GDPR deletion requests are destructive |
| No audit log table | Financial/legal compliance gap |
| Astrologer bank details in plain columns | PCI-DSS adjacent risk |

### AI Layer
| Issue | Risk |
|-------|------|
| OpenAI only, no Claude despite planning it | Vendor lock-in, no fallback |
| Synchronous AI calls on HTTP thread | Timeouts, poor UX |
| No AI result caching | Costs spiral with user growth |
| No retry logic with backoff for LLM calls | Brittle under OpenAI rate limits |
| Free tier is 3 questions enforced in-memory? | Bypass possible |
| AI ethicist gate is a single LLM call | Not a real safety layer |
| No prompt versioning | Can't A/B test interpretations |

### Payment & Finance
| Issue | Risk |
|-------|------|
| Billing timers in memory (WebSocket) | Lost on server restart |
| No payment reconciliation job | Webhook failures = uncredited wallets |
| Manual payout approval | Doesn't scale beyond 100 astrologers |
| Platform fee (20%) hardcoded? | Can't A/B test or adjust per tier |
| No refund workflow in code | Disputes handled manually |

### Infrastructure
| Issue | Risk |
|-------|------|
| Static assets served from Railway | Slow globally, no CDN |
| Single Rust engine instance | Advanced calc fails if it crashes |
| No structured logging (only Prometheus) | Can't debug production issues |
| No distributed tracing | Can't trace a request across services |
| Docker build combines frontend + backend | Slow builds, no independent deploys |
| No health check for Rust engine in main app | Silent failures |

---

## 4. SCALABILITY CEILING ANALYSIS

Based on the current architecture, here is the honest capacity ceiling:

| Metric | Current Ceiling | Target (1M users) |
|--------|----------------|-------------------|
| Concurrent WebSocket connections | ~500 (single instance) | ~50,000 |
| AI Council requests/min | ~20 (OpenAI rate limits) | ~5,000 |
| DB reads/sec | ~1,000 (no caching) | ~100,000 |
| DB writes/sec | ~200 | ~10,000 |
| Billing reliability | ~95% (memory timers) | 99.99% |
| API response time (P99) | ~800ms | <200ms |

You are at least **3 major architectural changes** away from handling 1M users.

---

## 5. WHAT THE CODEBASE DOES WELL (KEEP THESE)

1. **Rust astro-engine isolation** — Pure math, stateless, horizontally scalable already. Just add a load balancer in front.
2. **Shared Drizzle schema** — The single-source-of-truth approach is correct. Don't fragment this.
3. **Zod validation** — Keep it. Extend it to all API boundaries.
4. **Predication feedback loop design** — The intent is right (Bayesian accuracy tracking). Fix the data model and this becomes a genuine competitive moat.
5. **Multi-agent council concept** — Right architecture. Wrong execution (needs queuing, not synchronous HTTP). Preserve the agent specialization model.
6. **Graceful degradation matrix** — Excellent defensive design. Document and test it.

---

## 6. MISSING COMPONENTS (FULL LIST)

| Component | Purpose | Priority |
|-----------|---------|----------|
| Redis | Cache, pub/sub, job queue | P0 — blocking |
| BullMQ | Async AI job processing | P0 — blocking |
| Winston + log aggregation | Structured logging | P1 |
| CDN (Cloudflare) | Static assets, DDoS protection | P1 |
| Circuit breakers (opossum) | Resilience for external APIs | P1 |
| API rate limiter (Redis-backed) | Abuse prevention | P1 |
| Push notification service (FCM/APNs) | User re-engagement | P2 |
| Background worker process | Payouts, reconciliation, cleanup | P2 |
| Secrets manager (Railway secrets/Vault) | Proper key management | P2 |
| Distributed tracing (OpenTelemetry) | Cross-service debugging | P2 |
| `planetary_positions` table | Normalized chart data for ML | P2 |
| `predictions` table | AI output tracking | P2 |
| `audit_log` table | Compliance | P2 |
| Feature flags | Safe rollouts | P3 |
| A/B testing framework | Prompt optimization | P3 |
| Mobile app (React Native) | Growth channel | P3 |

---

## 7. THE SINGLE MOST IMPORTANT THING

**Fix WebSocket billing before anything else.**

Every other problem costs you performance. This one costs you money and trust. An astrologer who doesn't get paid twice will leave your platform and tell every other astrologer. That's your supply side gone.

The fix: persist a `billing_checkpoint` timestamp to the database every minute. On reconnect or server restart, reconcile billing from the last checkpoint. This is a one-day fix with massive risk reduction.

---

*Continue to: [02_ARCHITECTURE_REDESIGN.md](./02_ARCHITECTURE_REDESIGN.md)*

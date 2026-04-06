# Navagraha — Redesigned System Architecture
**Prepared by:** Senior Systems Architect  
**Date:** April 2026  
**Version:** 1.0

---

## 1. ARCHITECTURE PHILOSOPHY

Three constraints drive every decision:

1. **Correctness before scale** — Financial and astrological accuracy are non-negotiable. A wrong billing tick or a wrong dasha calculation destroys trust instantly.
2. **Stateless services, stateful data** — All application state lives in Redis or Postgres. Every service instance is disposable.
3. **Async AI, sync data** — LLM calls are always async jobs. Astrological calculations are always synchronous (they're fast and deterministic).

---

## 2. THE REDESIGNED ARCHITECTURE

```
╔══════════════════════════════════════════════════════════════════════╗
║                         CLIENT LAYER                                 ║
║  ┌─────────────────────┐       ┌──────────────────────────────────┐  ║
║  │  React Web App (PWA)│       │  React Native Mobile (Phase 2)   │  ║
║  │  TanStack Query     │       │  Expo + TanStack Query           │  ║
║  └──────────┬──────────┘       └──────────────┬───────────────────┘  ║
╚═════════════╪════════════════════════════════╪════════════════════════╝
              │ HTTPS + WSS                    │
╔═════════════▼════════════════════════════════▼════════════════════════╗
║                     EDGE / API GATEWAY LAYER                          ║
║  Cloudflare (CDN + DDoS + TLS termination + WAF)                      ║
║  ┌─────────────────────────────────────────────────────────────────┐  ║
║  │  Rate Limiting  │  JWT Validation  │  Request Routing           │  ║
║  │  Redis-backed   │  Stateless       │  /api/* → Core API         │  ║
║  │  per-user/IP    │                  │  /ws   → WS Gateway        │  ║
║  └─────────────────────────────────────────────────────────────────┘  ║
╚═════════════════════════════════════════════════════════════════════╝
              │                                │
   ╔══════════▼══════════╗         ╔══════════▼═══════════╗
   ║    CORE API SERVICE  ║         ║  WEBSOCKET GATEWAY   ║
   ║  (Express, stateless)║         ║  (ws, stateless)     ║
   ║  Horizontally scaled ║         ║  Redis pub/sub back  ║
   ║  Multiple instances  ║         ║  Multiple instances  ║
   ╚══════════╤══════════╝         ╚══════════╤═══════════╝
              │                                │
╔═════════════▼════════════════════════════════▼════════════════════════╗
║                        SERVICE LAYER                                   ║
║  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌─────────────┐  ║
║  │ KundliService│ │ConsultService│ │PaymentService│ │ AuthService │  ║
║  │MatchService  │ │HoroscopeSvc  │ │ WalletService│ │ UserService │  ║
║  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └──────┬──────┘  ║
╚═════════╪════════════════╪════════════════╪════════════════╪══════════╝
          │                │                │                │
╔═════════▼════════════════▼════════════════▼════════════════▼══════════╗
║                      AI ORCHESTRATION LAYER                            ║
║  ┌─────────────────────────────────────────────────────────────────┐  ║
║  │                    AI Job Queue (BullMQ + Redis)                 │  ║
║  │  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────┐  │  ║
║  │  │ interpretation  │  │   council-query  │  │  horoscope-gen │  │  ║
║  │  │    queue        │  │     queue        │  │    queue       │  │  ║
║  │  └────────┬────────┘  └────────┬─────────┘  └───────┬────────┘  │  ║
║  └═══════════╪════════════════════╪═══════════════════╪════════════╘  ║
║              │                    │                    │               ║
║  ┌═══════════▼════════════════════▼════════════════════▼═════════════╗ ║
║  ║                    AI WORKER POOL                                 ║ ║
║  ║  ┌──────────────┐  ┌───────────────┐  ┌───────────────────────┐  ║ ║
║  ║  │  Kundli      │  │  Council      │  │  Specialized Agents   │  ║ ║
║  ║  │  Interpreter │  │  Orchestrator │  │  CHRONOS | VARGA      │  ║ ║
║  ║  │  (Claude)    │  │  (Claude)     │  │  ASHTAKA | EVENT      │  ║ ║
║  ║  │              │  │               │  │  DESHA-KAALA          │  ║ ║
║  ║  └──────┬───────┘  └───────┬───────┘  └──────────┬────────────┘  ║ ║
║  ╚═════════╪══════════════════╪═══════════════════════╪══════════════╝ ║
╚═══════════╪══════════════════╪═══════════════════════╪═══════════════╝
            │                  │                        │
╔═══════════▼══════════════════▼════════════════════════▼═══════════════╗
║                      DATA INFRASTRUCTURE                               ║
║  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────────┐  ║
║  │   PostgreSQL     │  │      Redis       │  │    Rust Astro       ║  ║
║  │   Primary        │  │  ┌────────────┐  │  │    Engine           ║  ║
║  │   (writes)       │  │  │ Cache L2   │  │  │  (pool of 2-3)      ║  ║
║  │                  │  │  │ Sessions   │  │  │  stateless, fast    ║  ║
║  │   Read Replica   │  │  │ Job Queue  │  │  │                     ║  ║
║  │   (reads)        │  │  │ Pub/Sub WS │  │  └─────────────────────┘  ║
║  └──────────────────┘  │  └────────────┘  │                           ║
║                         └──────────────────┘                           ║
╚═══════════════════════════════════════════════════════════════════════╝
            │
╔═══════════▼═══════════════════════════════════════════════════════════╗
║                    EXTERNAL SERVICES                                   ║
║  OpenAI / Claude │ Razorpay │ Agora RTC │ Google OAuth │ Nodemailer   ║
╚═══════════════════════════════════════════════════════════════════════╝
```

---

## 3. LAYER-BY-LAYER BREAKDOWN

### Layer 1: Edge / API Gateway

**Technology:** Cloudflare (Free → Pro tier as you scale)

**Responsibilities:**
- TLS termination + HTTP/2
- Global CDN for static assets (React bundle, images)
- WAF rules (block malformed requests, SQLi attempts)
- DDoS protection (automatic)
- Rate limiting rules (IP-based at edge, before your servers see the traffic)
- Routing: `/api/*` → Core API, `/ws` → WebSocket Gateway

**Why not a custom Nginx gateway?**  
Cloudflare gives you this for free until you're at a scale where a custom API gateway is justified. Don't build infrastructure you can buy.

---

### Layer 2: Core API Service (Stateless Express)

**Key changes from current:**

1. **Stateless JWT auth** replacing session cookies
   - Access token: 15 min TTL, verified at gateway
   - Refresh token: 30 days, stored in Redis, rotated on use
   - No more `connect-pg-simple` session table

2. **API versioning** at `/api/v1/`
   - Breaking changes get a new version, not a new endpoint
   - Clients declare their version; old versions supported for 6 months

3. **Request validation middleware** (Zod schemas at route entry)
   - All inputs validated before they touch business logic
   - Standardized error shape: `{code, message, field?}`

4. **Circuit breakers** on all external calls
   - OpenAI down → return cached interpretation or "try again" message
   - Razorpay down → queue the verification job, don't lose the payment
   - Agora token fail → retry 3x with backoff

5. **Structured logging** (Winston → Railway log drain → Datadog/Logtail)
   - Every request logs: `{requestId, userId, route, duration, statusCode}`
   - Every error logs: `{requestId, error, stack, context}`
   - Correlation IDs propagated across services

---

### Layer 3: WebSocket Gateway (Redis Pub/Sub Backplane)

**The architectural fix for horizontal scaling:**

```
User A (Instance 1) ──sends message──→ Instance 1
                                            │
                                   Redis PUBLISH "chat:room:456"
                                            │
                          ┌─────────────────▼─────────────────┐
                          │         Redis Pub/Sub              │
                          └─────────────────┬─────────────────┘
                                            │
                   ┌────────────────────────▼──────────────────┐
                   │                                            │
             Instance 1                                   Instance 2
             (subscriber)                                (subscriber)
                   │                                            │
            (no local match)                     User B connected here
                                                       │
                                              delivers message to B
```

**Billing timer fix (critical):**

```typescript
// CURRENT (broken): in-memory timer
consultationTimers.set(consultationId, setInterval(...))

// REDESIGNED (correct): DB-persisted checkpoints
// Every 60 seconds:
// 1. Deduct from wallet
// 2. UPDATE consultations SET billing_checkpoint_at = NOW(),
//                             billed_seconds = billed_seconds + 60
// 3. If server restarts, find all active consultations where
//    billing_checkpoint_at < NOW() - 90s and reconcile
```

This makes billing crash-safe. A server restart causes at most 60 seconds of unbilled time, which is reconciled on restart.

---

### Layer 4: AI Orchestration Layer (Async Job System)

**This is the most important architectural change.**

Current state: User asks question → HTTP request blocks for 6-8 seconds → response  
Target state: User asks question → job enqueued → SSE/WebSocket streams result back

```
User POST /api/ai/council
    │
    ├── Validate request
    ├── Enqueue job: BullMQ "council-query" queue
    │   └── jobId returned immediately
    └── HTTP 202 Accepted {jobId, statusUrl}

Client polls GET /api/ai/jobs/:jobId/status
    OR subscribes via WebSocket for push notification

BullMQ Worker (separate process):
    ├── Pull job from queue
    ├── Fetch kundli context
    ├── Call Rust astro-engine (synchronous, fast)
    ├── Run 5 agents via Promise.all (3-5s)
    ├── Synthesize result
    ├── Cache result in Redis (TTL: 1 hour for same question+kundli)
    ├── Store in aiChatMessages
    └── Emit WebSocket event: {type: "council_result", jobId, result}
```

**Queue topology:**

| Queue | Workers | Priority | Retry | TTL |
|-------|---------|----------|-------|-----|
| `kundli-interpretation` | 3 | Normal | 3x exp backoff | 5 min |
| `council-query` | 5 | High | 2x | 10 min |
| `horoscope-generation` | 2 | Low | 1x | 30 min |
| `notification-dispatch` | 4 | High | 5x | 1 min |
| `payment-reconciliation` | 1 | Critical | 10x | 24h |
| `payout-processing` | 1 | Normal | 3x | 24h |

**Worker isolation:** AI workers run as a separate process (`npm run worker`), not in the same process as the HTTP server. This means LLM hangs don't block HTTP serving.

---

### Layer 5: Caching Strategy (Three Tiers)

```
Request Flow with Caching:

Request
  │
  ├─→ L1: In-process cache (node-lru-cache, 100MB limit)
  │         TTL: 5 minutes
  │         Keys: planetary calculations for same JD+coords
  │         Hit rate target: ~30% (birth time clustering)
  │
  ├─→ L2: Redis (on L1 miss)
  │         TTL: varies by content type (see table below)
  │         Hit rate target: ~70%
  │
  └─→ L3: PostgreSQL (on L2 miss)
              Full query
              Write result back to L2
```

**Redis TTL Strategy:**

| Cache Key Pattern | TTL | Rationale |
|-------------------|-----|-----------|
| `horoscope:{sign}:{date}` | 24h | Changes daily |
| `kundli:interpretation:{kundliId}` | 7d | Chart doesn't change |
| `council:response:{hash(question+kundliId)}` | 1h | Context-sensitive |
| `astrologer:profile:{id}` | 30min | Relatively static |
| `astrologer:availability:{id}` | 30s | Near real-time needed |
| `user:session:{token}` | 15min | JWT access token TTL |
| `user:refresh:{token}` | 30d | Refresh token store |
| `rate:limit:{userId}:{endpoint}` | 1min | Sliding window |
| `planetary:positions:{jd}:{lat}:{lon}` | 5min | Deterministic but heavy |

**Cache invalidation rules:**
- User updates profile → invalidate `user:*:{userId}`
- Kundli re-generated → invalidate `kundli:interpretation:{id}`
- Astrologer goes online/offline → invalidate `astrologer:availability:{id}` + pub/sub broadcast

---

### Layer 6: Astro Engine Pool

Current: Single Rust service instance. Crash = no Shadbala, no Yoga detection, silent degradation.

Target: Pool of 2-3 stateless Rust instances behind a round-robin load balancer. Since the engine is pure math with no state, this is trivial to scale.

```
Core API ──→ Rust Engine Load Balancer (Nginx upstream)
                    │
            ┌───────┼───────┐
            │       │       │
         Engine1  Engine2  Engine3
         (3001)  (3002)   (3003)
```

Health check every 10s. Remove failed instances automatically.

---

## 4. LLM STRATEGY: CLAUDE AS PRIMARY

You planned Claude integration. Here's how to do it correctly.

### Primary: Anthropic Claude (claude-sonnet-4-6)

Use Claude for:
- **Kundli interpretation** — Long-form, nuanced analysis where Claude's reasoning depth is superior
- **AI Council synthesis** — The Jyotishi Synthesizer and Ethicist Gate (multi-step reasoning)
- **Consultation briefs** — Structured JSON output via Claude's tool use

Why Claude over GPT-4o for this use case:
- Superior instruction-following for complex Vedic astrology prompts
- Better at maintaining persona consistency across multi-turn
- More reliable structured JSON output via tool use (vs. JSON mode)
- Longer context window for full chart + conversation history

### Secondary: OpenAI gpt-4o-mini

Keep for:
- **Daily horoscope generation** — High volume, cost-sensitive, simpler prompts
- **Pre/post consultation messages** — Short, templated outputs
- **Astrologer matching** — Lightweight matching logic

### Fallback chain:
```
Claude API → (429/503) → OpenAI → (429/503) → Cached result → "Service busy" response
```

### Prompt management:
Store prompts in the database (not hardcoded). Version them. Track which prompt version produced which output. This is your A/B testing surface for improving accuracy.

```sql
CREATE TABLE prompt_templates (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,           -- 'kundli_interpreter', 'chronos_agent'
    version INTEGER NOT NULL,
    model TEXT NOT NULL,          -- 'claude-sonnet-4-6'
    system_prompt TEXT NOT NULL,
    user_template TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. STANDARDIZED PLANETARY DATA STRUCTURE

Currently planetary data lives in a JSONB blob. Here is the standardized structure that should be the canonical representation across your entire system:

```typescript
// shared/types/planetary.ts — THE ONE TRUE STRUCTURE

export interface PlanetaryPosition {
  planet: PlanetId;           // 'SUN' | 'MOON' | 'MARS' | ... | 'RAHU' | 'KETU'
  longitude: number;          // 0-360, sidereal (Lahiri)
  latitude: number;           // celestial latitude
  speed: number;              // degrees/day (negative = retrograde)
  isRetrograde: boolean;
  sign: ZodiacSign;           // 'ARIES' | 'TAURUS' | ...
  signLord: PlanetId;
  houseNumber: number;        // 1-12
  nakshatra: Nakshatra;       // 'ASHWINI' | 'BHARANI' | ...
  nakshatraPada: 1 | 2 | 3 | 4;
  nakshatraLord: PlanetId;
  degree: number;             // degree within sign (0-30)
  minute: number;
  second: number;
}

export interface BirthChart {
  // Identity
  kundliId: string;
  calculatedAt: Date;
  ayanamsa: 'LAHIRI' | 'RAMAN' | 'KP';
  julianDay: number;
  
  // Chart Angles
  ascendant: PlanetaryPosition;   // Lagna
  midheaven: number;              // 10th cusp longitude
  
  // All 9 Grahas (+ Ascendant as position)
  planets: Record<PlanetId, PlanetaryPosition>;
  
  // Houses (Whole Sign)
  houses: HouseData[];
  
  // Derived
  yogas: Yoga[];
  doshas: Dosha[];
  shadbala: ShadbalaResult[];
  
  // Dasha timeline
  currentDasha: DashaPeriod;
  dashaPeriods: DashaPeriod[];
}

export type PlanetId = 
  'SUN' | 'MOON' | 'MARS' | 'MERCURY' | 'JUPITER' | 
  'VENUS' | 'SATURN' | 'RAHU' | 'KETU';
```

**Rule:** The Rust engine outputs this shape. The JS engine outputs this shape. The database stores this shape (in a normalized `planetary_positions` table). The AI prompts consume this shape. Zero impedance mismatch across the system.

---

## 6. API ORCHESTRATION LAYER

The current backend has a flat route structure. Introduce an **orchestration layer** that composes services:

```typescript
// server/orchestrators/kundliOrchestrator.ts

export class KundliOrchestrator {
  async createFullKundli(input: CreateKundliInput): Promise<FullKundliResult> {
    // 1. Calculate base chart (sync, fast — JS engine)
    const baseChart = await this.astroCalcService.calculate(input);
    
    // 2. Enhance with Rust engine (sync, ~50ms)
    const enhancement = await this.rustEngine.calculate(baseChart);
    
    // 3. Merge into canonical BirthChart structure
    const birthChart = this.mergeResults(baseChart, enhancement);
    
    // 4. Persist to DB (sync, with normalized planetary_positions)
    const kundli = await this.storage.saveKundli(birthChart, input.userId);
    
    // 5. Enqueue AI interpretation job (async — don't block)
    await this.aiQueue.enqueue('kundli-interpretation', {
      kundliId: kundli.id,
      priority: input.userId ? 'normal' : 'low',
    });
    
    // 6. Return immediately — interpretation arrives via WebSocket
    return { kundli, interpretationJobId };
  }
}
```

This pattern means:
- The user gets their chart in <500ms (fast, deterministic)
- AI interpretation arrives 5-10 seconds later via WebSocket push
- No HTTP timeouts. No blocking. No user waiting for spinners.

---

## 7. MOVING LOGIC FROM FRONTEND TO BACKEND

**What should NEVER be in the frontend:**

| Logic Currently in Frontend | Should Move To |
|-----------------------------|---------------|
| Dasha period display formatting | Backend API response |
| Dosha severity scoring | Backend (KundliService) |
| Astrologer matching ranking | Backend (MatchingService) |
| Free question count enforcement | Backend (Redis counter) |
| Wallet balance validation before consultation | Backend (atomic transaction) |
| Horoscope content generation | Backend (cached job) |

**Rule of thumb:** If it involves money, limits, or trust, it runs on the server. The frontend is a display layer, not a business logic layer.

**Specific immediate moves:**

1. Free AI question quota: Currently `question-count` is an API endpoint but the display logic is in the component. Move the **enforcement** to Redis: `INCR ai:questions:{userId}:{month}` with TTL = end of month. Server rejects if >3.

2. Wallet check before consultation start: Currently the frontend checks the wallet balance and shows a warning. The backend must **atomically reserve** the minimum consultation amount (e.g., 1 minute × pricePerMinute) before issuing an Agora token. No atomic reserve = race condition where users start consultations with insufficient balance.

3. Astrologer availability: Currently a `status` field on the astrologer record. Should be a Redis key `astrologer:status:{id}` with 5-minute TTL. If TTL expires (astrologer app crashed), status auto-reverts to offline.

---

## 8. ARCHITECTURE FOR 1M USERS

At 1M registered users, assume:
- 10K daily active users  
- 500 peak concurrent WebSocket connections
- 2,000 AI queries/hour
- 100 active consultations at peak

**Infrastructure requirements at this scale:**

```
Load Balancer (Cloudflare / Railway auto-scaling)
    │
    ├── Core API: 3 instances × 512MB RAM (auto-scale to 8)
    ├── WS Gateway: 2 instances × 1GB RAM (sticky sessions OR Redis pub/sub)
    ├── AI Workers: 4 instances × 2GB RAM (queue-based, scale by queue depth)
    ├── Rust Engine: 3 instances × 256MB RAM (stateless, fast)
    │
    ├── PostgreSQL: 1 primary + 1 read replica (Railway/Neon)
    ├── Redis: 1 instance + 1 replica (Railway Redis or Upstash)
    │
    └── CDN: Cloudflare (global edge caching for static assets)
```

**Monthly cost estimate at 1M users (10K DAU):**
- Railway Pro: ~$150/month (compute)
- PostgreSQL: ~$50/month (Neon Pro)
- Redis: ~$25/month (Upstash)
- Cloudflare: $20/month (Pro)
- OpenAI + Claude: ~$500/month (at 2K queries/hour)
- Razorpay: 2% transaction fee (revenue-linked)
- Agora: ~$0.0099/min (usage-based)
- **Total infrastructure: ~$750/month + AI costs**

This is sustainable with 500+ paying users/month at ₹399+ per recharge.

---

*Continue to: [03_DATABASE_SCHEMA.md](./03_DATABASE_SCHEMA.md)*

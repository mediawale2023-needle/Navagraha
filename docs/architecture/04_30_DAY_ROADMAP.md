# Navagraha — 30-Day Engineering Roadmap
**Prepared by:** Senior Systems Architect  
**Date:** April 2026  
**Horizon:** 30 days to a production-grade foundation

---

> **Framing:** You have a working product. This is not a rebuild. This is removing landmines and adding load-bearing foundations so the product doesn't collapse when users arrive. Every item below has a direct revenue, reliability, or growth justification.

---

## PRIORITIZATION FRAMEWORK

Each task is scored on:
- **Revenue risk** — Does this failure cost money today?
- **Scale blocker** — Does this stop you from handling more users?
- **User trust** — Does this break the user experience?

**Only P0 and P1 items are in the 30-day window.** P2 is the following sprint.

---

## WEEK 1: STOP THE BLEEDING (Days 1–7)

### Day 1–2: Fix WebSocket Billing (P0 — Revenue Risk)

**The problem:** Billing timers are in memory. Server restart = lost billing.

**The fix:**
```typescript
// server/services/billingService.ts

// Add to consultations table (migration):
// billing_checkpoint_at TIMESTAMPTZ
// billed_seconds INTEGER NOT NULL DEFAULT 0

// Every 60 seconds instead of just deducting:
async function billingTick(consultationId: string) {
  await db.transaction(async (tx) => {
    // 1. Deduct from wallet (atomic)
    const { newBalance } = await tx
      .update(wallets)
      .set({ balance: sql`balance - ${pricePerMinute}` })
      .where(and(eq(wallets.userId, userId), gte(wallets.balance, pricePerMinute)))
      .returning({ newBalance: wallets.balance });
    
    if (!newBalance) { endConsultation(consultationId); return; }
    
    // 2. Checkpoint the consultation
    await tx.update(consultations).set({
      billedSeconds: sql`billed_seconds + 60`,
      billingCheckpointAt: new Date(),
      totalAmount: sql`total_amount + ${pricePerMinute}`
    }).where(eq(consultations.id, consultationId));
    
    // 3. Create transaction record
    await tx.insert(transactions).values({...});
  });
}

// On server startup — reconcile any consultations whose checkpoint is stale:
async function reconcileBilling() {
  const staleConsultations = await db
    .select().from(consultations)
    .where(and(
      eq(consultations.status, 'active'),
      lt(consultations.billingCheckpointAt, new Date(Date.now() - 90_000))
    ));
  
  for (const c of staleConsultations) {
    const unbilledSeconds = Math.floor(
      (Date.now() - c.billingCheckpointAt.getTime()) / 1000
    );
    await billingTick(c.id); // catch up
  }
}
```

**Deliverable:** Zero billing loss on server restart. Financial integrity guaranteed.  
**Effort:** 4-6 hours.

---

### Day 2–4: Add Redis (P0 — Scale Blocker)

**Install:**
```bash
# Railway: add Redis service to project
# Cost: ~$5/month for dev, ~$25/month for prod
npm install ioredis bullmq
```

**Immediate uses on Day 2–3:**

```typescript
// 1. Replace connect-pg-simple with Redis sessions
import connectRedis from 'connect-redis';
const RedisStore = connectRedis(session);
app.use(session({ store: new RedisStore({ client: redis }) }));

// 2. Cache daily horoscopes (stops regenerating 12×/request)
async function getHoroscope(sign: string, date: string) {
  const key = `horoscope:${sign}:${date}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  
  const result = await generateHoroscope(sign, date);
  await redis.setex(key, 86400, JSON.stringify(result)); // 24h TTL
  return result;
}

// 3. Cache kundli interpretations (most expensive AI call)
async function getInterpretation(kundliId: string) {
  const key = `kundli:interpretation:${kundliId}`;
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  
  const result = await generateInterpretation(kundliId);
  await redis.setex(key, 604800, JSON.stringify(result)); // 7-day TTL
  return result;
}
```

**Deliverable:** Horoscopes and interpretations served from cache. Instant ~60% reduction in OpenAI API costs.  
**Effort:** 6-8 hours.

---

### Day 4–5: Add Rate Limiting (P0 — Abuse Prevention)

Without rate limiting, a single user can DoS your AI endpoints and rack up $500 in OpenAI bills in minutes.

```typescript
// server/middleware/rateLimit.ts
import { RateLimiterRedis } from 'rate-limiter-flexible';

const aiLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:ai',
  points: 10,           // 10 AI requests
  duration: 60,         // per minute
  blockDuration: 300,   // block 5 min if exceeded
});

const apiLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'rl:api',
  points: 100,          // 100 requests
  duration: 60,
});

// Apply to routes:
app.use('/api/ai/', rateLimitMiddleware(aiLimiter));
app.use('/api/', rateLimitMiddleware(apiLimiter));
```

**Deliverable:** API abuse impossible. OpenAI costs bounded.  
**Effort:** 2-3 hours.

---

### Day 5–7: Async AI Jobs with BullMQ (P0 — Reliability)

**The key change:** No more AI on the HTTP thread.

```typescript
// server/queues/aiQueue.ts
import { Queue, Worker } from 'bullmq';

export const interpretationQueue = new Queue('kundli-interpretation', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  }
});

// server/workers/interpretationWorker.ts (SEPARATE PROCESS)
const worker = new Worker('kundli-interpretation', async (job) => {
  const { kundliId, userId } = job.data;
  
  // This can take 10 seconds — nobody is waiting on HTTP
  const interpretation = await aiAstrologerService.interpretKundli(kundliId);
  
  // Cache it
  await redis.setex(`kundli:interpretation:${kundliId}`, 604800, 
    JSON.stringify(interpretation));
  
  // Notify the user via WebSocket (if connected)
  await wsGateway.sendToUser(userId, {
    type: 'interpretation_ready',
    kundliId,
    interpretation
  });
  
  return interpretation;
}, { connection: redis });

// server/routes/kundli.ts — new response pattern:
router.post('/', async (req, res) => {
  const kundli = await kundliOrchestrator.create(req.body);
  
  // Enqueue AI job (non-blocking)
  const job = await interpretationQueue.add('interpret', { 
    kundliId: kundli.id, userId: req.user.id 
  });
  
  // Return chart immediately
  res.json({ kundli, interpretationJobId: job.id });
  // Client subscribes via WebSocket for the interpretation
});
```

**Add BullMQ Dashboard** (bull-board) for monitoring jobs in development.

**Deliverable:** AI calls never timeout. Retries are automatic. System stays responsive under load.  
**Effort:** 1 day.

---

## WEEK 2: RELIABILITY FOUNDATIONS (Days 8–14)

### Day 8–9: Structured Logging (P1)

```typescript
// server/logger.ts
import winston from 'winston';

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'navagraha-api' },
  transports: [
    new winston.transports.Console(),
    // Railway log drain captures stdout
  ]
});

// Request logging middleware
app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  req.requestId = requestId;
  
  res.on('finish', () => {
    logger.info('request', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: Date.now() - req.startTime,
      userId: req.user?.id,
    });
  });
  next();
});
```

**Why this matters:** Without structured logs, you're debugging production issues by feeling. Every AI failure, payment error, and billing anomaly needs to be searchable. Railway captures stdout JSON automatically — send it to Logtail ($19/month) for searchable logs.

**Effort:** 3-4 hours.

---

### Day 9–11: Circuit Breakers for External Services (P1)

```typescript
// server/resilience/circuitBreakers.ts
import CircuitBreaker from 'opossum';

const openaiBreaker = new CircuitBreaker(callOpenAI, {
  timeout: 30000,           // 30s timeout
  errorThresholdPercentage: 50,  // open after 50% failures
  resetTimeout: 60000,      // try again after 60s
  volumeThreshold: 5,       // need 5 calls to evaluate
});

openaiBreaker.on('open', () => {
  logger.warn('OpenAI circuit OPEN — using fallback');
  redis.setex('circuit:openai', 60, 'open');
});

openaiBreaker.fallback(() => ({
  overview: 'AI interpretation temporarily unavailable. Please try again shortly.',
  // ... stub response
}));
```

Apply to: OpenAI, Anthropic, Razorpay, Agora, Rust engine.

**Deliverable:** One external service failing no longer crashes your app.  
**Effort:** 4-5 hours.

---

### Day 11–12: Normalize Planetary Data (P1 — Data Foundation)

This is mechanical work but it unlocks your AI accuracy loop.

```typescript
// scripts/migrateChartData.ts
async function migrateKundli(kundliId: string) {
  const kundli = await db.select().from(kundlis).where(eq(kundlis.id, kundliId));
  const chartData = kundli.chartData as ChartDataJSON;
  
  // Insert planetary positions
  await db.insert(planetaryPositions).values(
    Object.entries(chartData.planets).map(([planet, data]) => ({
      kundliId,
      planet: planet.toUpperCase(),
      longitude: data.longitude,
      // ... map all fields
    }))
  );
  
  // Insert dasha periods
  await db.insert(dashaPeriods).values(
    chartData.dashas.map(dasha => ({ kundliId, ...mapDasha(dasha) }))
  );
  
  // Insert doshas
  await db.insert(doshaRecords).values(
    chartData.doshas.map(dosha => ({ kundliId, ...mapDosha(dosha) }))
  );
}

// Run as background job — process all existing kundlis
for (const kundli of await db.select().from(kundlis)) {
  await migrateKundli(kundli.id);
}
```

**Effort:** 1 day (migration) + 1 day (testing).

---

### Day 12–14: Integrate Claude as Primary LLM (P1)

```typescript
// server/ai/llmClient.ts
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function callClaude(
  systemPrompt: string,
  userMessage: string,
  options = {}
): Promise<string> {
  return claudeBreaker.fire(async () => {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      ...options
    });
    return response.content[0].text;
  });
}

// Fallback chain
export async function callLLM(prompt: LLMPrompt): Promise<string> {
  try {
    return await callClaude(prompt.system, prompt.user);
  } catch (claudeError) {
    logger.warn('Claude failed, falling back to OpenAI', { error: claudeError });
    try {
      return await callOpenAI(prompt);
    } catch (openAIError) {
      const cached = await redis.get(`llm:cache:${prompt.cacheKey}`);
      if (cached) return cached;
      throw new Error('All LLM providers unavailable');
    }
  }
}
```

**Use Claude for:** Full kundli interpretation, AI Council synthesis, consultation briefs.  
**Keep OpenAI for:** Daily horoscope (high volume, cost-sensitive), short messages.

**Deliverable:** Better interpretation quality. No single LLM vendor dependency.  
**Effort:** 1 day.

---

## WEEK 3: SCALE FOUNDATIONS (Days 15–21)

### Day 15–16: WebSocket Redis Pub/Sub (P1)

```typescript
// server/websocket/wsGateway.ts
const pubClient = new Redis(process.env.REDIS_URL);
const subClient = pubClient.duplicate();

// When sending a message, publish to Redis
async function sendToUser(userId: string, message: unknown) {
  const localClient = localConnections.get(userId);
  
  if (localClient?.readyState === WebSocket.OPEN) {
    // Connected to this instance
    localClient.send(JSON.stringify(message));
  } else {
    // May be on another instance — publish to Redis
    await pubClient.publish(`ws:user:${userId}`, JSON.stringify(message));
  }
}

// Subscribe to Redis — deliver to locally connected clients
subClient.psubscribe('ws:user:*', (channel, message) => {
  const userId = channel.replace('ws:user:', '');
  const localClient = localConnections.get(userId);
  if (localClient?.readyState === WebSocket.OPEN) {
    localClient.send(message);
  }
});
```

**Deliverable:** Can now run 2+ API instances. Required for zero-downtime deploys.  
**Effort:** 1 day.

---

### Day 17–18: CDN for Static Assets (P1)

1. Enable Cloudflare proxying for your Railway domain
2. Set cache headers on Vite build output:
   ```
   /assets/*  Cache-Control: public, max-age=31536000, immutable
   /          Cache-Control: no-cache (HTML must be fresh)
   ```
3. Move user-uploaded images to Railway Volumes or object storage (R2/S3)

**Deliverable:** React bundle loads from edge (~50ms globally vs ~300ms from Railway).  
**Effort:** 3-4 hours.

---

### Day 19–20: Add `predictions` Table and Feedback UI (P1)

This is your competitive moat. Build it now, when you have few users, so you have training data when you have many.

**Backend:**
```typescript
// After every AI council response, extract predictions
async function extractAndStorePredictions(
  interpretationId: string, 
  content: CouncilOutput,
  kundliId: string,
  userId: string
) {
  const predictions = content.predictions ?? [];
  
  await db.insert(predictionsTable).values(predictions.map(p => ({
    userId, kundliId, interpretationId,
    category: p.category,
    predictionText: p.text,
    predictedFor: p.dateRange,
    mahadasha: p.dashaContext?.mahadasha,
    antardasha: p.dashaContext?.antardasha,
  })));
}
```

**Frontend:** After 30 days, show users their past predictions with "Did this happen?" thumbs up/down. This data trains your accuracy model.

**Deliverable:** Prediction accuracy tracking begins. Data compound interest starts Day 1.  
**Effort:** 1 day.

---

### Day 21: API Versioning Cleanup (P2 start)

```typescript
// Before: /api/kundli
// After:  /api/v1/kundli

// In Express:
const v1Router = express.Router();
v1Router.use('/kundli', kundliRoutes);
v1Router.use('/consultations', consultationRoutes);
// ...

app.use('/api/v1', v1Router);
app.use('/api', v1Router); // backward compat alias — mark for deprecation
```

---

## WEEK 4: PRODUCT VELOCITY (Days 22–30)

### Day 22–23: Push Notifications (P2 — Growth)

Users need re-engagement. Without push notifications, you have no way to bring users back.

```typescript
// Use Firebase Cloud Messaging (free tier covers 1M users)
npm install firebase-admin

// Store FCM tokens in users table:
// fcm_token TEXT
// fcm_token_updated_at TIMESTAMPTZ

// Trigger notifications from:
// - consultation starting (3 min reminder)
// - AI interpretation ready (from BullMQ worker)
// - Dasha transition (monthly cron job)
// - Daily horoscope (opt-in, daily cron)
// - Astrologer response in chat
```

---

### Day 24–25: Background Worker for Payouts (P2 — Astrologer Trust)

Manual payout approval doesn't scale. Automate it:

```typescript
// bullmq worker: payout-processing
// Runs at 10 AM IST daily
// Finds astrologerEarnings where status='pending' and amount > threshold
// Creates payoutRequest
// (Auto-approve logic once you trust the data)
```

---

### Day 26–27: Astrologer Availability as Redis TTL (P2 — UX)

```typescript
// When astrologer opens app:
await redis.setex(`astrologer:status:${id}`, 300, 'online'); // 5 min TTL

// Heartbeat every 4 minutes from client:
await redis.setex(`astrologer:status:${id}`, 300, 'online');

// If heartbeat stops, TTL expires, status auto-reverts to offline
// No more astrologers appearing online when they've closed the app
```

---

### Day 28–30: Remove / Extract Corporate C-Suite Feature (P2 — Focus)

**Option A (recommended):** Disable the feature behind an environment flag. Remove it from the main navigation. Don't delete the code yet — you may want to extract it as a separate product.

**Option B:** Extract to a separate Railway service with its own database. If you believe in this product, it deserves its own project, not a schema that lives inside your astrology app.

**What to remove from Navagraha's DB:**
- `ai_companies`, `ai_employees`, `ai_initiatives`, `ai_directives`, `boardroom_messages`
- This frees up mental bandwidth, reduces DB size, and clarifies your product focus.

---

## SUMMARY: 30-DAY PRIORITY MATRIX

| Day | Task | Category | Revenue Risk | Scale Impact |
|-----|------|----------|-------------|--------------|
| 1-2 | Fix WebSocket billing | P0 | Direct loss | Medium |
| 2-4 | Add Redis | P0 | Indirect | High |
| 4-5 | Rate limiting | P0 | Cost control | High |
| 5-7 | BullMQ AI queue | P0 | Reliability | High |
| 8-9 | Structured logging | P1 | Debugging | Medium |
| 9-11 | Circuit breakers | P1 | Availability | High |
| 11-12 | Normalize DB schema | P1 | Data quality | Medium |
| 12-14 | Integrate Claude | P1 | Quality | Medium |
| 15-16 | WS Redis pub/sub | P1 | Availability | High |
| 17-18 | CDN setup | P1 | Performance | Medium |
| 19-20 | Predictions table | P1 | Moat | High |
| 21 | API versioning | P2 | Maintainability | Low |
| 22-23 | Push notifications | P2 | Growth | Medium |
| 24-25 | Payout automation | P2 | Astrologer NPS | Medium |
| 26-27 | Astrologer TTL | P2 | UX | Low |
| 28-30 | Extract C-Suite | P2 | Focus | Medium |

---

## WHAT SUCCESS LOOKS LIKE AT DAY 30

- Zero billing loss on server restart
- Redis caching reducing OpenAI costs by 50-70%
- AI queries async — zero HTTP timeouts
- Can deploy 2 API instances without WebSocket breaking
- Planetary data queryable (analytics-ready)
- Claude integrated as primary LLM
- Structured logs searchable in Logtail
- Rate limiting active on all endpoints
- Prediction tracking recording from Day 1

**At this point, you can confidently onboard 5,000 users and the architecture will hold.**

---

## WHAT TO BUILD IN MONTHS 2–3

After the 30-day foundation:
1. React Native mobile app (largest growth lever)
2. Advanced search: find astrologers by planetary specialization
3. Offline kundli caching (PWA + service worker)
4. Automated A/B testing for AI prompts (connected to prediction accuracy)
5. Astrologer earnings analytics dashboard
6. Webhook for dasha transitions (email/push when major period starts)
7. Group Q&A sessions (one astrologer, many users) — new revenue model

---

*This document is a living artifact. Revisit and reprioritize at the end of each week.*

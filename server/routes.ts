import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { sql, eq, asc, desc, and, inArray } from "drizzle-orm";
import { setupAuth, isAuthenticated, isAdmin } from "./auth";
import { runCouncil } from "./agents/orchestrator";
import { localise } from "./agents/localise.js";
import { features } from "./features";
import { marketplaceGate } from "./marketplace";
import { setupSwagger } from "./swagger";
import rateLimit from "express-rate-limit";
import {
  insertKundliSchema,
  insertConsultationSchema,
  insertAstrologerSchema,
  insertCouponSchema,
  insertTransactionSchema,
  insertChatMessageSchema,
  insertReviewSchema,
  insertScheduledCallSchema,
  users as usersTable,
  kundlis as kundlisTable,
  type Kundli,
  astrologers as astrologersTable,
  transactions as transactionsTable,
  consultations as consultationsTable,
  homepageContent as homepageContentTable,
} from "@shared/schema";
import { z } from "zod";
import {
  getKundli,
  BirthInputError,
  getKundliMatching,
  signHoroscope,
  resolveSign,
  HOROSCOPE_PERIODS,
  type HoroscopePeriod,
  getNumerology,
  transitsForChart,
  transitSummary,
} from "./astroEngine/index.js";
import { computePrashna, PRASHNA_CATEGORIES } from "./astroEngine/prashna.js";
import { CalculationError } from "./astroEngine/canonical/compute.js";
import { upgradeLegacyKundli, chartVersionStatus, listedChart, withReconciledRemedies, withCurrentDoshaRules } from "./astroEngine/canonical/upgrade.js";
import { buildInsights } from "./astroEngine/evidence/insights.js";
import { routeQuestion, buildEvidencePacket, answerSimple, answerWithoutChart, guardAnswer, packetSummary, limitedChartReply } from "./agents/askKundli.js";
import { canonicalChartSchema, isCurrentCanonicalChart } from "@shared/v3/canonical";
import {
  callSynastryEngine,
  callRemediationEngine,
} from "./astroEngineClient";
import { isAdminEmail, normalizeEmail } from "./adminAccess";
import { publicAstrologer } from "./publicAstrologer";
import { resolveBirthCoords } from "./geocode";
import { selectChart } from "./birthDetails";
import { computePanchang } from "./astroEngine/panchang";
import {
  createRazorpayOrder,
  fetchPayment,
  toGatewayPayment,
  parseRechargeAmount,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
  RECHARGE_PACKS,
  PLATFORM_FEE_PERCENTAGE,
  evaluateCoupon,
  REFERRER_REWARD,
  REFEREE_REWARD,
  FREE_CHAT_MINUTES,
} from "./paymentService";
import { generateAgoraToken, getChannelName } from "./agoraService";
import { notifyUser, notifyAstrologer } from "./websocketService";
import { audit } from "./audit";
import { aiBudget, aiRequestContext } from "./ai/metering";
import { ASK_FREE_FOLLOW_UPS, askChartKey, askEnforced, askFreeQuestionsFor, askIdempotencyKey } from "./askMetering";
import { ASK_PACKS, ASK_PACK_FOLLOW_UPS, askPack, askPackRequestKey } from "./askPacks";
import { pricedReportType, reportPrice } from "./reportPricing";
import { sendPushToUser, sendPushToAstrologer } from "./pushService";
import {
  interpretKundli,
  InterpretationUnavailableError,
  generatePreConsultBrief,
  generatePostConsultFollowUp,
  matchAstrologerToChart,
  generateReport,
  generateLifeReport,
  generateDailyHoroscope,
  extractMemories,
} from "./aiAstrologerService";
import { fulfilReportOrder, isOfferedReportCategory, reportsAvailable } from "./reportOrders";
import { computeJyotishChart } from "./astroEngine/jyotishEngine.js";
import { streamTraditionReading, answerSessionQuery, type Tradition } from "./jyotishAiService.js";
import { insertJyotishClientProfileSchema } from "@shared/schema";
import { sendWelcomeEmail, sendBookingConfirmation, sendConsultationSummary } from "./emailService";
import { sendVerification, isWellFormedToken, hashVerificationToken, verificationAvailable } from "./emailVerification";
import { settleRazorpayPayment, reconcilePendingRecharges } from "./rechargeSettlement";
import { selfUser, selfAstrologer, adminAstrologer, adminAstrologerUpdate } from "./safeRows";
import crypto from "crypto";

// ─────────────────────────────────────────────────────────────
// Astrologer auth middleware
// ─────────────────────────────────────────────────────────────
function isAstrologerAuthenticated(req: any, res: Response, next: Function) {
  if (!req.session?.astrologerId) {
    return res.status(401).json({ message: "Astrologer authentication required" });
  }
  next();
}

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
});

// Verification links: resend is per signed-in user (the account limits are kept in the database);
// opening links is per IP.
const verifyResendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req: any) => `user:${req.user?.id ?? req.session?.userId ?? 'anonymous'}`,
});
const verifyLinkLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
});

// Paid-model AI endpoints, throttled per authenticated user (they run after isAuthenticated).
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  keyGenerator: (req: any) => `user:${req.user?.id ?? req.session?.userId ?? 'anonymous'}`,
  message: { message: 'Too many AI requests. Please wait a few minutes and try again.' },
});

// Pro workspace model calls, per astrologer (aiLimiter keys on users, so astrologers would share one bucket).
const proAiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  keyGenerator: (req: any) => `astrologer:${req.session?.astrologerId ?? 'anonymous'}`,
  message: { message: 'Too many AI requests. Please wait a few minutes and try again.' },
});

// Unauthenticated guest-preview insights: pure computation, but still throttled per IP.
const insightsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
});

/** How long after a consultation ends its end call may still finalise it (earning, notifications). */
const FINALISE_WINDOW_MS = 5 * 60 * 1000;

export async function registerRoutes(app: Express, existingServer?: Server): Promise<Server> {

  try {
    await setupAuth(app);
  } catch (err) {
    console.error('[startup] Auth setup failed (continuing without auth):', err);
  }

  // After auth, so the production guard can see the signed-in admin.
  setupSwagger(app, isAdmin);

  // NOTE: /api/config is registered in index.ts (before async init) so it
  // responds immediately for Railway healthchecks. Do NOT duplicate here.

  // While the marketplace is off, nothing can start, book or charge for it (server/marketplace.ts).
  app.use(marketplaceGate);

  // Attributes every model call to the signed-in user or astrologer (cost logging, budgets).
  app.use(aiRequestContext);

  // ─── User Email Auth ──────────────────────────────────────

  app.post('/api/auth/register', authLimiter, async (req: any, res) => {
    try {
      const { password, firstName, lastName } = req.body;
      const email = typeof req.body.email === 'string' ? normalizeEmail(req.body.email) : '';
      if (!email || typeof password !== 'string' || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      // Admin addresses are provisioned (ADMIN_EMAIL seed or Google sign-in), never
      // self-registered: without email verification anyone could claim an unregistered one.
      // Same reply as a taken address, so the admin list cannot be probed.
      const existing = isAdminEmail(email) || await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }

      const user = await storage.createUserWithPassword({ email, password, firstName, lastName });

      // Log them in immediately
      (req.session as any).userId = user.id;

      // Auto-create wallet
      await storage.createWallet(user.id).catch(() => {});

      // A verification link when verification is on (it doubles as the welcome); otherwise the welcome email.
      let verificationEmailSent = false;
      if (verificationAvailable()) {
        const result = await sendVerification(user).catch(() => ({ unavailable: true as const }));
        verificationEmailSent = "sent" in result;
        if (verificationEmailSent) audit("auth.email_verification_sent", { userId: user.id, at: "register" });
      } else {
        sendWelcomeEmail(email, firstName || "").catch(() => {});
      }

      res.status(201).json({ ...selfUser(user), verificationEmailSent });
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post('/api/auth/login', authLimiter, async (req: any, res) => {
    try {
      const { email, password } = req.body;
      if (typeof email !== 'string' || !email || typeof password !== 'string' || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const user = await storage.verifyUserPassword(email, password);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      (req.session as any).userId = user.id;

      const { passwordHash: _ph, ...safe } = user as any;
      res.json(safe);
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // ─── Email verification ───────────────────────────────────
  // Resend only to the signed-in account's own address (no lookup by address, so nothing to
  // enumerate). Opening a link needs no session, so it works on another device.
  app.post('/api/auth/verify-email/resend', isAuthenticated, verifyResendLimiter, async (req: any, res) => {
    try {
      if (!features.emailVerification()) return res.status(404).json({ code: 'email_verification_disabled', message: "Email verification is not available." });
      const user = await storage.getUser((req.user as any).id);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (user.emailVerifiedAt) return res.json({ alreadyVerified: true });
      if (!user.email) return res.status(400).json({ message: "This account has no email address." });
      if (!verificationAvailable()) return res.status(503).json({ code: 'email_unavailable', message: "We can't send email right now. Please try again later." });
      const result = await sendVerification(user);
      if ("throttled" in result) {
        audit("auth.email_verification_throttled", { userId: user.id });
        res.setHeader('Retry-After', String(result.retryAfterS));
        return res.status(429).json({ code: 'verification_throttled', retryAfter: result.retryAfterS, message: "Please wait before asking for another link." });
      }
      if ("unavailable" in result) return res.status(503).json({ code: 'email_unavailable', message: "We can't send email right now. Please try again later." });
      audit("auth.email_verification_sent", { userId: user.id, at: "resend" });
      res.status(202).json({ sent: true });
    } catch (error) {
      console.error("Verification resend error:", (error as Error)?.message);
      res.status(500).json({ message: "Could not send the verification email" });
    }
  });

  // Always a redirect to the app's status page; the token never stays in the address bar.
  app.get('/api/auth/verify-email', verifyLinkLimiter, async (req: any, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    let status = 'invalid';
    try {
      const token = req.query.token;
      if (isWellFormedToken(token)) {
        status = await storage.consumeEmailVerificationToken(hashVerificationToken(token));
        if (status === 'verified') audit("auth.email_verified", {});
      }
    } catch (error) {
      console.error("Verification link error:", (error as Error)?.message);
      status = 'error';
    }
    res.redirect(303, `/verify-email?status=${status}`);
  });

  app.post('/api/auth/logout', (req: any, res) => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ message: "Logged out" });
    });
  });

  // ─── Auth ─────────────────────────────────────────────────
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const user = await storage.getUser(userId);
      res.json(user ? selfUser(user) : null);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.put('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { firstName, lastName, phoneNumber } = req.body;
      const user = await storage.updateUser(userId, { firstName, lastName, phoneNumber });
      res.json(selfUser(user));
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // ─── Kundli ───────────────────────────────────────────────
  // A pre-V3 saved chart is served as a V3 view recalculated on read (see canonical/upgrade.ts);
  // the stored row is never modified unless V3_PERSIST_LEGACY_UPGRADES=true, and then only by an
  // atomic compare-and-swap that keeps the original under legacySnapshot. Callers must have
  // verified ownership first. Parallel requests for the same chart share one recalculation.
  const upgradesInFlight = new Map<string, Promise<Kundli>>();
  async function currentChart<T extends Kundli | null | undefined>(kundli: T): Promise<T> {
    if (!kundli?.id) return kundli;
    if (isCurrentCanonicalChart((kundli.chartData as any)?.canonical)) return withReconciledRemedies(withCurrentDoshaRules(kundli)) as T;
    const id = kundli.id;
    let pending = upgradesInFlight.get(id);
    if (!pending) {
      pending = (async (): Promise<Kundli> => {
        let upgrade;
        try {
          upgrade = await upgradeLegacyKundli(kundli);
        } catch (err) {
          // Unexpected engine failure: serve the stored chart marked limited, never as V3.
          console.error('Legacy chart recalculation failed:', err);
          return { ...kundli, chartData: { ...(kundli.chartData as any ?? {}), limitedReason: 'This chart could not be recalculated right now. Please try again later.' } };
        }
        if (!upgrade) return kundli;
        const view = { ...kundli, ...upgrade };
        if (!features.persistLegacyUpgrades() || !isCurrentCanonicalChart((upgrade.chartData as any)?.canonical)) return view;
        try {
          const saved = await storage.persistLegacyUpgrade(id, kundli.chartData, upgrade);
          if (saved) return saved;
          // Lost the swap: someone else changed the row; use theirs only if it is a full V3 chart.
          const fresh = await storage.getKundliById(id);
          return fresh && isCurrentCanonicalChart((fresh.chartData as any)?.canonical) ? fresh : view;
        } catch (err) {
          console.error('Persisting a legacy chart upgrade failed (serving the recalculated view):', err);
          return view;
        }
      })().finally(() => upgradesInFlight.delete(id));
      upgradesInFlight.set(id, pending);
    }
    return (await pending) as T;
  }

  /** A stored professional reading's chart if it is a current V3 chart, else recomputed canonically from the profile. */
  function readingChartData(reading: { chartData: unknown }, profile: { dateOfBirth: any; timeOfBirth: any; latitude: any; longitude: any }): any {
    if (isCurrentCanonicalChart((reading.chartData as any)?.canonical)) return reading.chartData;
    return computeJyotishChart(profile.dateOfBirth, profile.timeOfBirth, Number(profile.latitude), Number(profile.longitude)).chartData;
  }

  /** The owner's chart for AI context only if it holds a verified V3 calculation; otherwise null (no legacy data). */
  async function verifiedChart(kundli: Kundli | null | undefined): Promise<Kundli | null> {
    const k = await currentChart(kundli ?? null);
    return k && isCurrentCanonicalChart((k.chartData as any)?.canonical) ? k : null;
  }

  app.post('/api/kundli', async (req: any, res) => {
    try {
      const userId = req.user?.id || req.session?.userId || null;
      const dateOfBirth = new Date(req.body.dateOfBirth);

      // Never fabricate a location — a wrong Ascendant ruins every prediction.
      const coords = await resolveBirthCoords(req.body.latitude, req.body.longitude, req.body.placeOfBirth);
      if (!coords) {
        return res.status(400).json({ message: "Please pick your exact birth place from the suggestions. An approximate location produces a wrong Ascendant and unreliable predictions.", field: "placeOfBirth" });
      }
      const lat = coords.lat;
      const lon = coords.lng;

      // Pass the entered calendar date itself; a Date round-trip can shift it across UTC midnight.
      const nk = await getKundli(typeof req.body.dateOfBirth === 'string' ? req.body.dateOfBirth : dateOfBirth, req.body.timeOfBirth, lat, lon, {
        timeAccuracy: req.body.isBirthTimeApproximate === true ? 'approximate' : 'exact',
        timezone: typeof req.body.timezone === 'string' ? req.body.timezone : null,
        utcOffset: typeof req.body.utcOffset === 'string' ? req.body.utcOffset : null,
        place: req.body.placeOfBirth,
      });
      const kundliData = {
        zodiacSign: nk.zodiacSign,
        moonSign: nk.moonSign,
        ascendant: nk.ascendant,
        chartData: { ...nk.chartData, isBirthTimeApproximate: req.body.isBirthTimeApproximate === true },
        dashas: nk.dashas,
        doshas: nk.doshas,
        remedies: nk.remedies,
      };

      // Guests: return computed data without saving
      if (!userId) {
        return res.json({
          ...req.body,
          ...kundliData,
          id: null,
          saved: false,
        });
      }

      const validatedData = insertKundliSchema.parse({ ...req.body, latitude: lat, longitude: lon, userId });
      const kundli = await storage.createKundli({ ...validatedData, ...kundliData });
      res.json(kundli);
    } catch (error) {
      if (error instanceof BirthInputError || error instanceof CalculationError) return res.status(400).json({ message: error.message });
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: error.errors });
      console.error('Create kundli error:', error);
      res.status(500).json({ message: "Failed to create kundli" });
    }
  });

  app.get('/api/kundli', async (req: any, res) => {
    try {
      // Unauthenticated users get an empty list
      if (!req.user?.id && !req.session?.userId) return res.json([]);
      const userId = req.user?.id || req.session?.userId;
      const kundlis = await storage.getUserKundlis(userId);
      // Recalculate pre-V3 rows as read-only views so the list never shows retired-engine placements.
      const current = await Promise.all(kundlis.map((k) => currentChart(k)));
      res.json(current.map((k) => listedChart(k)));
    } catch { res.status(500).json({ message: "Failed to fetch kundlis" }); }
  });

  app.get('/api/kundli/:id', isAuthenticated, async (req, res) => {
    try {
      const owned = await storage.getKundliById(req.params.id);
      if (!owned || owned.userId !== (req.user as { id: string }).id) return res.status(404).json({ message: "Kundli not found" });
      const kundli = await currentChart(owned);
      res.json({ ...kundli, chartStatus: chartVersionStatus(kundli) });
    } catch { res.status(500).json({ message: "Failed to fetch kundli" }); }
  });

  // V3 insights: evidence-backed domain verdicts + life timeline for a saved chart.
  app.get('/api/kundli/:id/insights', isAuthenticated, async (req, res) => {
    try {
      const owned = await storage.getKundliById(req.params.id);
      if (!owned || owned.userId !== (req.user as { id: string }).id) return res.status(404).json({ message: "Kundli not found" });
      const kundli = await currentChart(owned);
      const canonical = (kundli.chartData as any)?.canonical;
      if (!isCurrentCanonicalChart(canonical)) {
        return res.status(409).json({ message: chartVersionStatus(kundli).notes[0] ?? 'This chart needs to be recreated with the V3 engine.', chartStatus: chartVersionStatus(kundli) });
      }
      res.json({ ...buildInsights(canonical), chartStatus: chartVersionStatus(kundli) });
    } catch (err) {
      console.error('Insights error:', err);
      res.status(500).json({ message: "Failed to compute insights" });
    }
  });

  // Insights for an unsaved (guest) chart held by the client. Pure computation on a
  // schema-validated canonical chart: nothing is stored and no AI is called.
  app.post('/api/kundli/insights', insightsLimiter, async (req, res) => {
    try {
      const canonical = canonicalChartSchema.safeParse(req.body?.canonical);
      if (!canonical.success) return res.status(400).json({ message: 'A valid V3 canonical chart is required' });
      res.json(buildInsights(canonical.data));
    } catch (err) {
      console.error('Guest insights error:', err);
      res.status(500).json({ message: "Failed to compute insights" });
    }
  });

  // Current transits (Gochar) + Sade Sati for a saved chart.
  app.get('/api/kundli/:id/transits', isAuthenticated, async (req, res) => {
    try {
      const owned = await storage.getKundliById(req.params.id);
      if (!owned || owned.userId !== (req.user as { id: string }).id) return res.status(404).json({ message: "Kundli not found" });
      const kundli = await currentChart(owned);
      const canonical = (kundli.chartData as any)?.canonical;
      if (!isCurrentCanonicalChart(canonical)) {
        return res.status(409).json({ message: chartVersionStatus(kundli).notes[0] ?? 'This chart needs to be recreated with the V3 engine.', chartStatus: chartVersionStatus(kundli) });
      }
      res.json(transitsForChart(canonical, (kundli.chartData as any)?.ashtakavarga?.sav));
    } catch (err) {
      console.error('Transit error:', err);
      res.status(500).json({ message: "Failed to compute transits" });
    }
  });

  // ─── Horoscope ────────────────────────────────────────────
  // Personalised daily horoscope from the user's chart, cached once per day.
  app.get('/api/horoscope/personal', isAuthenticated, aiLimiter, aiBudget('user'), async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const language = (req.query.language as string) || 'English';
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

      const userKundlis = await storage.getUserKundlis(userId);
      const kundli = await currentChart(userKundlis?.[0] ?? null);
      if (!kundli) return res.json({ hasChart: false });
      // A chart without a verified V3 calculation is never used as the basis of a reading.
      if (!isCurrentCanonicalChart((kundli.chartData as any)?.canonical)) {
        return res.json({ hasChart: false, limitedReason: chartVersionStatus(kundli).notes[0] ?? 'Your chart needs to be recreated with its birth place.' });
      }

      const cached = await storage.getDailyHoroscope(userId, today);
      if (cached && cached.language === language) {
        return res.json({ hasChart: true, date: today, language, person: kundli.name, content: cached.content });
      }

      const content = await generateDailyHoroscope(kundli, today, language);
      // No card is better than an unchecked one; a missing card is not cached, so a later visit retries.
      if (!content) return res.json({ hasChart: true, date: today, language, person: kundli.name, content: null, unavailable: true });
      await storage.saveDailyHoroscope({ userId, kundliId: kundli.id, horoDate: today, language, content }).catch(() => {});
      res.json({ hasChart: true, date: today, language, person: kundli.name, content });
    } catch (err) {
      console.error('Personal horoscope error:', err);
      res.status(500).json({ message: 'Failed to fetch your daily horoscope' });
    }
  });

  // Rashi horoscope from today's transits (Gochara). Results only change with the date, so they are cached per day.
  const signHoroscopeCache = new Map<string, ReturnType<typeof signHoroscope>>();
  app.get('/api/horoscope/:sign', (req, res) => {
    const sign = resolveSign(req.params.sign);
    if (!sign) return res.status(400).json({ message: 'Unknown sign.', field: 'sign' });
    const period = (typeof req.query.period === 'string' ? req.query.period : 'today') as HoroscopePeriod;
    if (!HOROSCOPE_PERIODS.includes(period)) return res.status(400).json({ message: `period must be one of ${HOROSCOPE_PERIODS.join(', ')}.`, field: 'period' });
    let timeZone = typeof req.query.tz === 'string' && req.query.tz ? req.query.tz : 'Asia/Kolkata';
    try { new Intl.DateTimeFormat('en', { timeZone }); } catch { timeZone = 'Asia/Kolkata'; }
    try {
      const day = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
      const key = `${sign}|${period}|${timeZone}|${day}`;
      let h = signHoroscopeCache.get(key);
      if (!h) {
        h = signHoroscope(sign, period, new Date(), timeZone);
        if (signHoroscopeCache.size > 500) signHoroscopeCache.clear();
        signHoroscopeCache.set(key, h);
      }
      res.json(h);
    } catch (e) {
      console.error('Sign horoscope error:', e);
      res.status(500).json({ message: 'Failed to calculate the horoscope' });
    }
  });

  // ─── Panchang ─────────────────────────────────────────────
  // Without a location the almanac is for New Delhi, and the response says so (location.isDefault).
  app.get('/api/panchang', (req, res) => {
    try {
      const q = (k: string) => (typeof req.query[k] === 'string' && req.query[k] ? String(req.query[k]) : undefined);
      const hasLocation = q('lat') !== undefined || q('lng') !== undefined;
      res.json(computePanchang({
        date: q('date'),
        latitude: hasLocation ? q('lat') : 28.6139,
        longitude: hasLocation ? q('lng') : 77.209,
        timezone: q('tz'),
        place: hasLocation ? (q('place')?.slice(0, 120) ?? null) : 'New Delhi, India',
        isDefaultLocation: !hasLocation,
      }));
    } catch (err) {
      if (err instanceof BirthInputError || err instanceof CalculationError) {
        return res.status(400).json({ message: err.message });
      }
      console.error('Panchang error:', err);
      res.status(500).json({ message: 'Failed to compute panchang' });
    }
  });

  // ─── Matchmaking ──────────────────────────────────────────
  app.post('/api/matchmaking', async (req, res) => {
    try {
      const {
        person1Name, person1Date, person1Time, person1Lat, person1Lon,
        person2Name, person2Date, person2Time, person2Lat, person2Lon,
      } = req.body;

      const c1 = await resolveBirthCoords(person1Lat, person1Lon, req.body.person1Place);
      const c2 = await resolveBirthCoords(person2Lat, person2Lon, req.body.person2Place);
      if (!c1 || !c2) {
        return res.status(400).json({
          message: 'Valid coordinates or a resolvable birthplace are required for both people.',
          field: !c1 ? 'person1Place' : 'person2Place',
        });
      }
      const p1 = { dateOfBirth: person1Date, timeOfBirth: person1Time, latitude: c1.lat, longitude: c1.lng, gender: req.body.person1Gender };
      const p2 = { dateOfBirth: person2Date, timeOfBirth: person2Time, latitude: c2.lat, longitude: c2.lng, gender: req.body.person2Gender };
      const result = await getKundliMatching(p1, p2);
      res.json({
        totalScore: result.percentage,
        gunaScore: result.score,
        maxGunaScore: result.maxScore,
        compatibility: result.compatibility,
        recommendation: result.recommendation,
        details: result.details,
        dosha: result.dosha,
        doshas: result.doshas,
        roles: {
          ...result.roles,
          note: result.roles.assumed
            ? `Ashtakoota scores a bride and a groom; ${person1Name || 'Person 1'} was scored as the bride. Varna, Vashya and Gana can change if the roles are swapped.`
            : null,
        },
        person1: person1Name,
        person2: person2Name,
      });
    } catch (error) {
      if (error instanceof BirthInputError || error instanceof CalculationError) return res.status(400).json({ message: error.message });
      res.status(500).json({ message: "Failed to calculate compatibility" });
    }
  });

  // ─── Numerology ───────────────────────────────────────────
  app.post('/api/numerology', async (req, res) => {
    try {
      const { dateOfBirth, firstName, lastName, system = 'pythagorean' } = req.body;
      if (!dateOfBirth || !firstName) {
        return res.status(400).json({ message: "dateOfBirth and firstName are required" });
      }
      const result = await getNumerology(dateOfBirth, firstName, lastName || '');
      res.json(result);
    } catch { res.status(500).json({ message: "Failed to calculate numerology" }); }
  });

  // ─── Sprint 3: Prashna, Synastry, Remediation ──────────────────────────────
  app.post('/api/prashna', async (req, res) => {
    try {
      const { latitude, longitude, question_category } = req.body;
      if (!question_category) {
        return res.status(400).json({ message: "Missing required Prashna fields" });
      }
      if (!PRASHNA_CATEGORIES.includes(question_category)) {
        return res.status(400).json({ message: `question_category must be one of ${PRASHNA_CATEGORIES.join(', ')}` });
      }
      const coords = await resolveBirthCoords(latitude, longitude, req.body.place);
      if (!coords) return res.status(400).json({ message: 'Valid coordinates or a resolvable place are required for Prashna.' });
      res.json(computePrashna(new Date(), coords.lat, coords.lng, question_category));
    } catch (e) {
      if (e instanceof CalculationError || e instanceof BirthInputError) return res.status(400).json({ message: e.message });
      console.error('Prashna error:', e);
      res.status(500).json({ message: "Failed to calculate Prashna" });
    }
  });

  app.post('/api/synastry', async (req, res) => {
    try {
      const { 
        person1Date, person1Time, person1Lat, person1Lon,
        person2Date, person2Time, person2Lat, person2Lon
      } = req.body;
      
      if (!person1Date || !person2Date) {
        return res.status(400).json({ message: "Missing birth dates for synastry" });
      }

      const c1 = await resolveBirthCoords(person1Lat, person1Lon, req.body.person1Place);
      const c2 = await resolveBirthCoords(person2Lat, person2Lon, req.body.person2Place);
      if (!c1 || !c2) return res.status(400).json({ message: 'Valid coordinates or a resolvable birthplace are required for both people.' });

      // Generate base charts to extract Nakshatra and Moon values
      const p1Chart = await getKundli(person1Date, person1Time, c1.lat, c1.lng);
      const p2Chart = await getKundli(person2Date, person2Time, c2.lat, c2.lng);

      const NAKSHATRAS = ["Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra","Punarvasu","Pushya","Ashlesha","Magha","Purva Phalguni","Uttara Phalguni","Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha","Mula","Purva Ashadha","Uttara Ashadha","Shravana","Dhanishtha","Shatabhisha","Purva Bhadrapada","Uttara Bhadrapada","Revati"];
      const SIGNS = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];

      const person_a_nakshatra = Math.max(1, NAKSHATRAS.indexOf(p1Chart.nakshatra) + 1);
      const person_a_moon_sign = Math.max(1, SIGNS.indexOf(p1Chart.moonSign) + 1);
      const person_b_nakshatra = Math.max(1, NAKSHATRAS.indexOf(p2Chart.nakshatra) + 1);
      const person_b_moon_sign = Math.max(1, SIGNS.indexOf(p2Chart.moonSign) + 1);

      const a_mars = p1Chart.chartData.planetaryPositions.find((p: any) => p.planet === 'Mars');
      const b_mars = p2Chart.chartData.planetaryPositions.find((p: any) => p.planet === 'Mars');

      const result = await callSynastryEngine({
        person_a_nakshatra, person_a_moon_sign, person_a_mars_house: a_mars?.house,
        person_b_nakshatra, person_b_moon_sign, person_b_mars_house: b_mars?.house
      });
      if (!result) return res.status(503).json({ message: "Synastry engine unavailable" });

      res.json({
         ...result, 
         person1: req.body.person1Name,
         person2: req.body.person2Name,
      });
    } catch (e: any) {
        if (e instanceof BirthInputError || e instanceof CalculationError) return res.status(400).json({ message: e.message });
        console.error("Synastry error:", e);
        res.status(500).json({ message: "Failed to calculate Synastry" }); 
    }
  });

  app.post('/api/remediation', async (req, res) => {
    try {
      const { planets } = req.body;
      if (!planets || !Array.isArray(planets)) {
        return res.status(400).json({ message: "Requires an array of planets with Shadbala rupas" });
      }
      const result = await callRemediationEngine(planets);
      if (!result) return res.status(503).json({ message: "Remediation engine unavailable" });
      res.json(result);
    } catch { res.status(500).json({ message: "Failed to fetch Remediations" }); }
  });

  // ─── Phase 3, Sprint 4: Pattern Matcher / Feedback ─────────────────

  const feedbackBodySchema = z.object({
    kundliId: z.string({ invalid_type_error: "kundliId must be a string" }).trim().min(1, "kundliId must not be empty").optional(),
    predictionCategory: z.string().trim().min(1).max(64),
    wasAccurate: z.boolean(),
    dashaSystemUsed: z.string().trim().min(1).max(64),
    predictedDate: z.coerce.date().optional(),
    actualOccurrenceDate: z.coerce.date().optional(),
  });

  app.post('/api/feedback', isAuthenticated, async (req: any, res) => {
    try {
      const parsed = feedbackBodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid feedback" });
      const userId = (req.user as { id: string }).id;
      if (parsed.data.kundliId !== undefined) {
        const kundli = await storage.getKundliById(parsed.data.kundliId);
        if (!kundli || kundli.userId !== userId) return res.status(404).json({ message: "Kundli not found" });
      }
      // userId comes only from the session; unknown body fields are stripped by the schema.
      const feedback = await storage.createPredictionFeedback({ ...parsed.data, userId });
      res.status(201).json(feedback);
    } catch (e: any) {
      console.error("Feedback error:", e);
      res.status(500).json({ message: "Failed to submit prediction feedback" });
    }
  });

  app.get('/api/patterns', isAuthenticated, async (req: any, res) => {
    try {
      // In a real app, you might restrict this to admins or astrologers.
      const stats = await storage.getPatternStatistics();
      res.json(stats);
    } catch (e: any) {
      console.error("Pattern Matcher stats error:", e);
      res.status(500).json({ message: "Failed to fetch pattern statistics" });
    }
  });

  // ─── Astrologers ──────────────────────────────────────────
  app.get('/api/astrologers', async (_req, res) => {
    try {
      // Only admin-verified astrologers are listed to the public.
      const list = await storage.getAllAstrologers();
      res.json(list.filter((a) => a.isVerified).map(publicAstrologer));
    } catch { res.status(500).json({ message: "Failed to fetch astrologers" }); }
  });

  app.get('/api/astrologers/:id', async (req: any, res) => {
    try {
      const astrologer = await storage.getAstrologerById(req.params.id);
      if (!astrologer) return res.status(404).json({ message: "Astrologer not found" });
      const followers = await storage.getFollowerUserIds(astrologer.id);
      const currentUserId = (req.user as any)?.id || req.session?.userId;
      const isFollowing = currentUserId ? followers.includes(currentUserId) : false;
      res.json({ ...publicAstrologer(astrologer), followerCount: followers.length, isFollowing });
    } catch { res.status(500).json({ message: "Failed to fetch astrologer" }); }
  });

  // Follow / unfollow an astrologer
  app.post('/api/astrologers/:id/follow', isAuthenticated, async (req: any, res) => {
    try {
      await storage.followAstrologer((req.user as any).id, req.params.id);
      res.json({ following: true });
    } catch { res.status(500).json({ message: "Failed to follow" }); }
  });

  app.delete('/api/astrologers/:id/follow', isAuthenticated, async (req: any, res) => {
    try {
      await storage.unfollowAstrologer((req.user as any).id, req.params.id);
      res.json({ following: false });
    } catch { res.status(500).json({ message: "Failed to unfollow" }); }
  });

  // List astrologers the current user follows
  app.get('/api/astrologers/following/list', isAuthenticated, async (req: any, res) => {
    try {
      const ids = await storage.getFollowedAstrologerIds((req.user as any).id);
      res.json(ids);
    } catch { res.status(500).json({ message: "Failed to fetch following" }); }
  });

  // ─── Waitlist (when astrologer is busy/offline) ────────────
  app.post('/api/astrologers/:id/waitlist', isAuthenticated, async (req: any, res) => {
    try {
      const { type } = req.body;
      const entry = await storage.joinQueue((req.user as any).id, req.params.id, type || 'chat');
      const position = await storage.getQueuePosition((req.user as any).id, req.params.id);
      res.status(201).json({ entry, position });
    } catch { res.status(500).json({ message: "Failed to join waitlist" }); }
  });

  app.delete('/api/astrologers/:id/waitlist', isAuthenticated, async (req: any, res) => {
    try {
      await storage.leaveQueue((req.user as any).id, req.params.id);
      res.json({ success: true });
    } catch { res.status(500).json({ message: "Failed to leave waitlist" }); }
  });

  app.get('/api/astrologers/:id/waitlist', isAuthenticated, async (req: any, res) => {
    try {
      const position = await storage.getQueuePosition((req.user as any).id, req.params.id);
      res.json({ position });
    } catch { res.status(500).json({ message: "Failed to fetch waitlist status" }); }
  });

  // ─── Astrologer Auth ──────────────────────────────────────

  app.post('/api/astrologer/auth/register', authLimiter, async (req: any, res) => {
    try {
      const { name, email, password, phoneNumber } = req.body;
      if (!name || !email || !password) {
        return res.status(400).json({ message: "Name, email and password are required" });
      }
      const existing = await storage.getAstrologerByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "An astrologer account with this email already exists" });
      }
      const astrologer = await (storage as any).createAstrologerWithPassword({ name, email, password, phoneNumber });
      req.session.astrologerId = astrologer.id;
      const { passwordHash: _ph, bankAccountNumber: _ban, bankIfsc: _bi, ...safe } = astrologer;
      res.status(201).json(safe);
    } catch (error) {
      console.error("Astrologer register error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post('/api/astrologer/auth/login', authLimiter, async (req: any, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      const astrologer = await (storage as any).verifyAstrologerPassword(email, password);
      if (!astrologer) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      if (!astrologer.isVerified) {
        return res.status(403).json({ message: "Your account is pending admin approval. You'll receive an email once approved." });
      }
      req.session.astrologerId = astrologer.id;
      await new Promise<void>((resolve, reject) => {
        req.session.save((err: any) => (err ? reject(err) : resolve()));
      });
      const { passwordHash: _ph, bankAccountNumber: _ban, bankIfsc: _bi, ...safe } = astrologer;
      res.json(safe);
    } catch (error: any) {
      console.error("Astrologer login error:", error);
      const detail = error?.message || "Login failed";
      res.status(500).json({ message: detail.includes('does not exist') ? 'Database migration incomplete — redeploy after schema fix.' : 'Login failed' });
    }
  });

  app.post('/api/astrologer/auth/logout', (req: any, res) => {
    req.session.astrologerId = undefined;
    res.json({ message: "Logged out" });
  });

  app.get('/api/astrologer/auth/me', isAstrologerAuthenticated, async (req: any, res) => {
    try {
      const astrologer = await storage.getAstrologerById(req.session.astrologerId);
      if (!astrologer) return res.status(404).json({ message: "Not found" });
      const { passwordHash: _ph, bankAccountNumber: _ban, bankIfsc: _bi, ...safe } = astrologer;
      res.json(safe);
    } catch { res.status(500).json({ message: "Failed to fetch profile" }); }
  });

  // Astrologer submits KYC for verification
  app.post('/api/astrologer/kyc', isAstrologerAuthenticated, async (req: any, res) => {
    try {
      const { panNumber, aadhaarLast4, bankAccountName, bankAccountNumber, bankIfsc, upiId } = req.body;
      if (!panNumber || !bankAccountNumber || !bankIfsc) {
        return res.status(400).json({ message: 'PAN, bank account number and IFSC are required.' });
      }
      const updated = await storage.submitAstrologerKyc(req.session.astrologerId, {
        panNumber, aadhaarLast4, bankAccountName, bankAccountNumber, bankIfsc, upiId,
      });
      res.json({ kycStatus: updated.kycStatus });
    } catch (err) {
      console.error('KYC submit error:', err);
      res.status(500).json({ message: 'Failed to submit KYC' });
    }
  });

  // ─── Astrologer Dashboard ─────────────────────────────────

  app.get('/api/astrologer/dashboard', isAstrologerAuthenticated, async (req: any, res) => {
    try {
      const astrologerId = req.session.astrologerId;
      const [astrologer, consultationList, earnings, payouts] = await Promise.all([
        storage.getAstrologerById(astrologerId),
        storage.getAstrologerConsultations(astrologerId),
        storage.getAstrologerTotalEarnings(astrologerId),
        storage.getAstrologerPayouts(astrologerId),
      ]);
      if (!astrologer) return res.status(404).json({ message: "Not found" });

      // Calculate today's earnings
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayEarnings = consultationList
        .filter(c => c.status === 'ended' && new Date(c.createdAt!) >= today)
        .reduce((sum, c) => sum + parseFloat(c.totalAmount || '0') * (1 - PLATFORM_FEE_PERCENTAGE / 100), 0);

      res.json({
        astrologer: selfAstrologer(astrologer),
        stats: {
          totalEarnings: earnings.total,
          pendingPayout: earnings.pending,
          todayEarnings,
          totalConsultations: consultationList.length,
          todayConsultations: consultationList.filter(c => new Date(c.createdAt!) >= today).length,
        },
        recentConsultations: consultationList.slice(0, 10),
        payouts: payouts.slice(0, 5),
      });
    } catch (error) {
      console.error("Dashboard error:", error);
      res.status(500).json({ message: "Failed to load dashboard" });
    }
  });

  app.put('/api/astrologer/profile', isAstrologerAuthenticated, async (req: any, res) => {
    try {
      const astrologerId = req.session.astrologerId;
      const { about, specializations, languages, pricePerMinute, experience, certifications, upiId, bankAccountName, bankAccountNumber, bankIfsc, phoneNumber } = req.body;
      // An empty rate field leaves the stored rate unchanged rather than writing an invalid price.
      const updated = await storage.updateAstrologer(astrologerId, { about, specializations, languages, pricePerMinute: pricePerMinute === '' ? undefined : pricePerMinute, experience, certifications, upiId, bankAccountName, bankAccountNumber, bankIfsc, phoneNumber });
      const { passwordHash: _ph, ...safe } = updated;
      res.json(safe);
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.post('/api/astrologer/status', isAstrologerAuthenticated, async (req: any, res) => {
    try {
      const astrologerId = req.session.astrologerId;
      const { isOnline } = req.body;
      await storage.updateAstrologerOnlineStatus(astrologerId, isOnline);
      res.json({ isOnline });

      // When coming online, alert waitlisted users + followers (best-effort)
      if (isOnline) {
        (async () => {
          try {
            const astro = await storage.getAstrologerById(astrologerId);
            const name = astro?.name || 'Your astrologer';
            const waiting = await storage.getWaitingQueue(astrologerId);
            for (const entry of waiting) {
              await storage.createNotification({
                userId: entry.userId, type: 'system', title: `${name} is online`,
                body: `${name} is now available. Tap to start your ${entry.type} consultation.`,
              });
              sendPushToUser(entry.userId, { title: `${name} is online`, body: `Start your ${entry.type} consultation now.`, link: `/astrologers` });
            }
            await storage.markQueueNotified(astrologerId);
          } catch (err) { console.error('Waitlist notify error:', err); }
        })();
      }
    } catch { res.status(500).json({ message: "Failed to update status" }); }
  });

  app.get('/api/astrologer/consultations', isAstrologerAuthenticated, async (req: any, res) => {
    try {
      const list = await storage.getAstrologerConsultations(req.session.astrologerId);
      res.json(list);
    } catch { res.status(500).json({ message: "Failed to fetch consultations" }); }
  });

  app.get('/api/astrologer/schedule', isAstrologerAuthenticated, async (req: any, res) => {
    try {
      const list = await storage.getAstrologerScheduledCalls(req.session.astrologerId);
      res.json(list);
    } catch { res.status(500).json({ message: "Failed to fetch schedule" }); }
  });

  app.post('/api/astrologer/payout', isAstrologerAuthenticated, async (req: any, res) => {
    try {
      const { amount, method } = req.body;
      if (!amount || !method) return res.status(400).json({ message: "Amount and method required" });
      const earnings = await storage.getAstrologerTotalEarnings(req.session.astrologerId);
      if (parseFloat(amount) > earnings.pending) {
        return res.status(400).json({ message: "Amount exceeds pending payout balance" });
      }
      const payout = await storage.createPayoutRequest(req.session.astrologerId, amount, method);
      res.status(201).json(payout);
    } catch { res.status(500).json({ message: "Failed to create payout request" }); }
  });

  // ─── Wallet ───────────────────────────────────────────────
  app.get('/api/wallet', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      let wallet = await storage.getWallet(userId);
      if (!wallet) wallet = await storage.createWallet(userId);
      res.json(wallet);
    } catch { res.status(500).json({ message: "Failed to fetch wallet" }); }
  });

  // Canonical description used to identify PDF download transactions
  const PDF_DESCRIPTION = 'Kundli PDF download';
  const PDF_PRICE = 10;

  // Check whether the current user is eligible for a free PDF (first download ever)
  app.get('/api/wallet/pdf-check', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const [txns, wallet] = await Promise.all([
        storage.getUserTransactions(userId),
        storage.getWallet(userId),
      ]);
      const hasUsedFree = txns.some(
        (t) => t.description === PDF_DESCRIPTION && t.status === 'completed',
      );
      const balance = wallet ? parseFloat(wallet.balance || '0') : 0;
      res.json({ isFree: !hasUsedFree, balance: balance.toFixed(2) });
    } catch { res.status(500).json({ message: 'Failed to check PDF status' }); }
  });

  // Deduct from wallet (paid features — PDF download, etc.)
  app.post('/api/wallet/deduct', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      // The only paid item sold here is the Kundli PDF, priced on the server; a client
      // amount is ignored so it cannot set its own price.
      const { description } = req.body;
      if (description !== PDF_DESCRIPTION) return res.status(400).json({ message: "Unknown purchase" });
      const result = await storage.purchaseKundliPdf(userId, PDF_PRICE, PDF_DESCRIPTION);
      if (!result) {
        const wallet = await storage.getWallet(userId);
        return res.status(402).json({ message: "Insufficient balance", balance: parseFloat(wallet?.balance || "0"), required: PDF_PRICE });
      }
      const wallet = await storage.getWallet(userId);
      res.json({ balance: result.balance, wallet: wallet && { ...wallet, balance: result.balance }, free: result.free });
    } catch { res.status(500).json({ message: "Failed to process deduction" }); }
  });

  app.get('/api/wallet/packs', (_req, res) => {
    res.json(RECHARGE_PACKS);
  });

  // ─── Offers / Coupons ────────────────────────────────────

  // Public: active offers to surface on the wallet/recharge screen
  app.get('/api/coupons', async (_req, res) => {
    try {
      const list = await storage.getActiveCoupons(true);
      res.json(list.map((c) => ({
        code: c.code,
        description: c.description,
        discountType: c.discountType,
        discountValue: c.discountValue,
        maxDiscount: c.maxDiscount,
        minAmount: c.minAmount,
        firstRechargeOnly: c.firstRechargeOnly,
      })));
    } catch { res.status(500).json({ message: 'Failed to fetch offers' }); }
  });

  // Validate a coupon against an intended recharge amount (no side effects)
  app.post('/api/coupons/validate', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { code } = req.body ?? {};
      const amount = parseRechargeAmount(req.body?.amount);
      if (typeof code !== 'string' || !code.trim() || code.length > 40) {
        return res.status(400).json({ valid: false, message: 'Enter a recharge amount and coupon code.' });
      }
      if (!amount.ok) return res.status(400).json({ valid: false, message: amount.message });
      const rechargeAmount = amount.rupees;
      const coupon = await storage.getCouponByCode(String(code).trim());
      if (!coupon) return res.status(404).json({ valid: false, message: 'Invalid coupon code.' });

      const isFirstRecharge = !(await storage.hasCompletedRecharge(userId));
      const userRedemptionCount = await storage.getUserCouponRedemptionCount(userId, coupon.id);
      const result = evaluateCoupon(coupon, rechargeAmount, { isFirstRecharge, userRedemptionCount });
      res.json({ valid: result.ok, bonus: result.bonus, message: result.message });
    } catch (err) {
      console.error('Coupon validate error:', err);
      res.status(500).json({ valid: false, message: 'Failed to validate coupon' });
    }
  });

  // ─── Referrals ───────────────────────────────────────────

  // My referral code + reward stats
  app.get('/api/referral', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const code = await storage.getOrCreateReferralCode(userId);
      const referrals = await storage.getReferralsByReferrer(userId);
      const rewarded = referrals.filter((r) => r.status === 'rewarded');
      const totalEarned = rewarded.reduce((sum, r) => sum + parseFloat(r.referrerReward || '0'), 0);
      res.json({
        code,
        referrerReward: REFERRER_REWARD,
        refereeReward: REFEREE_REWARD,
        totalInvited: referrals.length,
        totalRewarded: rewarded.length,
        totalEarned,
      });
    } catch (err) {
      console.error('Referral fetch error:', err);
      res.status(500).json({ message: 'Failed to fetch referral details' });
    }
  });

  // Apply a referral code (before the user's first recharge)
  app.post('/api/referral/apply', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { code } = req.body;
      if (!code) return res.status(400).json({ message: 'Referral code required' });

      const existing = await storage.getReferralByReferee(userId);
      if (existing) return res.status(400).json({ message: 'You have already used a referral code.' });

      if (await storage.hasCompletedRecharge(userId)) {
        return res.status(400).json({ message: 'Referral codes can only be applied before your first recharge.' });
      }

      const referrer = await storage.getUserByReferralCode(String(code).trim());
      if (!referrer) return res.status(404).json({ message: 'Invalid referral code.' });
      if (referrer.id === userId) return res.status(400).json({ message: "You can't refer yourself." });

      await storage.createReferral({ referrerId: referrer.id, refereeId: userId });
      await storage.updateUser(userId, { referredBy: String(code).trim() });
      res.json({
        success: true,
        message: `Referral applied! You'll get ₹${REFEREE_REWARD} on your first recharge.`,
      });
    } catch (err) {
      console.error('Referral apply error:', err);
      res.status(500).json({ message: 'Failed to apply referral code' });
    }
  });

  // ─── Razorpay Payment ────────────────────────────────────

  // Started-but-unpaid recharges one user may hold in 30 minutes.
  const MAX_OPEN_RECHARGES = 5;

  app.post('/api/payment/razorpay/order', isAuthenticated, paymentLimiter, async (req: any, res) => {
    if (features.rechargesPaused()) {
      return res.status(503).json({ code: 'recharges_paused', message: 'Recharges are paused for a few minutes for maintenance. Please try again shortly.' });
    }
    try {
      const userId = (req.user as any).id;
      const { packId, couponCode } = req.body ?? {};
      const amount = parseRechargeAmount(req.body?.amount);
      if (!amount.ok) return res.status(400).json({ message: amount.message, field: 'amount' });
      if (packId !== undefined && packId !== null && typeof packId !== 'string') return res.status(400).json({ message: "Invalid recharge pack" });
      if (couponCode !== undefined && couponCode !== null && (typeof couponCode !== 'string' || couponCode.length > 40)) {
        return res.status(400).json({ message: "Invalid coupon code", field: 'couponCode' });
      }

      const pack = packId ? RECHARGE_PACKS.find(p => p.id === packId) : undefined;
      if (packId && !pack) return res.status(400).json({ message: "Invalid recharge pack" });
      if (pack && pack.amount !== amount.rupees) {
        return res.status(400).json({ message: "Recharge amount does not match selected pack" });
      }
      const bonus = pack?.bonus || 0;

      if (await storage.countOpenRecharges(userId, new Date(Date.now() - 30 * 60 * 1000)) >= MAX_OPEN_RECHARGES) {
        return res.status(429).json({ message: "You have several payments in progress. Finish or close them before starting another." });
      }

      // The coupon is checked here to quote it, and again at settlement, where it is applied
      // only if still eligible (storage.settleRechargeOrder).
      let coupon: { id: string; code: string; bonus: number } | undefined;
      if (couponCode) {
        const found = await storage.getCouponByCode(couponCode.trim());
        if (!found) return res.status(400).json({ message: "Invalid coupon code", field: 'couponCode' });
        const isFirstRecharge = !(await storage.hasCompletedRecharge(userId));
        const userRedemptionCount = await storage.getUserCouponRedemptionCount(userId, found.id);
        const evalResult = evaluateCoupon(found, amount.rupees, { isFirstRecharge, userRedemptionCount });
        if (!evalResult.ok) return res.status(400).json({ message: evalResult.message, field: 'couponCode' });
        coupon = { id: found.id, code: found.code, bonus: evalResult.bonus };
      }

      const order = await createRazorpayOrder({
        amountPaise: amount.paise,
        receipt: `wallet_${Date.now()}`,
        notes: { userId, bonus: bonus.toString() },
      });
      if (Number(order.amount) !== amount.paise || order.currency !== 'INR') {
        console.error('[payment] Razorpay order does not match the request', { orderId: order.id });
        return res.status(502).json({ message: "Failed to create payment order" });
      }

      const totalCredit = amount.rupees + bonus + (coupon?.bonus ?? 0);
      const bonusLabel = [
        bonus > 0 ? `+₹${bonus} bonus` : '',
        coupon ? `+₹${coupon.bonus} (${coupon.code})` : '',
      ].filter(Boolean).join(' ');

      const pendingTxn = await storage.createPendingRecharge({
        userId,
        orderId: order.id,
        amountPaise: amount.paise,
        packBonus: bonus,
        coupon,
        quotedCredit: totalCredit,
        description: `Wallet recharge${bonusLabel ? ` (${bonusLabel})` : ''}`,
      });
      audit("payment.order_created", {
        userId, transactionId: pendingTxn.id, orderId: order.id, amountPaise: amount.paise, currency: 'INR',
        packId: pack?.id, packBonus: bonus, couponCode: coupon?.code, couponBonus: coupon?.bonus ?? 0,
      });

      res.json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        couponBonus: coupon?.bonus ?? 0,
        totalCredit,
      });
    } catch (error: any) {
      console.error("Razorpay order error:", error?.message ?? error);
      if (error.message?.includes("must be set")) {
        return res.status(503).json({ message: "Payment gateway not configured. Contact support." });
      }
      res.status(500).json({ message: "Failed to create payment order" });
    }
  });

  // The browser reports a payment; it is credited only as Razorpay itself reports it
  // (fetched by id): the signed order, captured, in INR, for exactly the order's amount.
  app.post('/api/payment/razorpay/verify', isAuthenticated, paymentLimiter, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { orderId, paymentId, signature } = req.body ?? {};
      if (typeof orderId !== 'string' || typeof paymentId !== 'string' || typeof signature !== 'string') {
        return res.status(400).json({ message: "Payment verification failed" });
      }
      if (!verifyRazorpaySignature(orderId, paymentId, signature)) return res.status(400).json({ message: "Payment verification failed" });

      const payment = await fetchPayment(paymentId);
      if (!payment || payment.orderId !== orderId) return res.status(400).json({ message: "Payment verification failed" });

      const outcome = await settleRazorpayPayment(payment, { signature, userId });
      if (outcome.kind === 'settled') return res.json({ success: true, newBalance: outcome.balance });
      if (outcome.kind === 'not_captured') {
        return res.status(202).json({ success: false, pending: true, message: "Your payment is being confirmed. Your wallet will update shortly." });
      }
      if (outcome.kind === 'mismatch') {
        return res.status(409).json({ code: 'payment_review', message: "This payment did not match its order and is held for review. Please contact support with your payment ID." });
      }

      // Already credited by the webhook or the reconciler: answer success, credit nothing.
      const recharge = await storage.getRechargeByOrderId(orderId);
      if (recharge && recharge.userId === userId && recharge.status === 'completed') {
        const wallet = await storage.getWallet(userId);
        return res.json({ success: true, newBalance: parseFloat(wallet?.balance || "0"), alreadyCredited: true });
      }
      return res.status(404).json({ message: "Pending transaction not found" });
    } catch (error: any) {
      console.error("Razorpay verify error:", error?.message ?? error);
      res.status(500).json({ message: "Payment verification failed" });
    }
  });

  // Razorpay webhook (server-side confirmation). The signature covers the exact raw body,
  // so the payment entity in it is Razorpay's own report of the payment.
  app.post('/api/payment/razorpay/webhook', async (req: any, res) => {
    try {
      const signature = req.headers['x-razorpay-signature'];
      if (!Buffer.isBuffer(req.rawBody) || typeof signature !== 'string') {
        return res.status(400).json({ message: "Invalid webhook signature" });
      }
      if (!verifyRazorpayWebhookSignature(req.rawBody.toString('utf8'), signature)) {
        return res.status(400).json({ message: "Invalid webhook signature" });
      }

      // The webhook credits on its own, so a payer who closes the tab before the
      // browser's verify call still gets the money; settlement is idempotent, and a
      // replayed or out-of-order event finds nothing left to settle.
      const event = req.body;
      if (event?.event === 'payment.captured') {
        const payment = toGatewayPayment(event.payload?.payment?.entity);
        if (payment) {
          const outcome = await settleRazorpayPayment(payment);
          if (outcome.kind === 'settled') {
            notifyUser(outcome.transaction.userId, { type: 'payment_confirmed', paymentId: payment.id, newBalance: outcome.balance });
          }
        }
      } else if (typeof event?.event === 'string' && event.event.startsWith('refund.')) {
        // Refunds are never issued by the app (failed reports refund to the wallet); one made
        // from the Razorpay dashboard is recorded for an admin to reconcile the wallet.
        const refund = event.payload?.refund?.entity;
        audit("payment.refund_observed", { event: event.event, paymentId: refund?.payment_id, refundId: refund?.id, amountPaise: Number(refund?.amount) || null });
      }
      res.json({ status: 'ok' });
    } catch (err: any) {
      console.error('Razorpay webhook error:', err?.message ?? err);
      res.status(500).json({ message: "Webhook error" });
    }
  });

  // ─── Snapmint / LazyPay direct ────────────────────────────
  // Disabled: these flows have no server-created pending order, take the amount and the
  // user from the gateway callback, and cannot confirm the payment with the gateway, so a
  // credit could not be verified to Release A's standard. Snapmint and LazyPay remain
  // available inside Razorpay Checkout, which settles through the verified path above.
  const directBnplDisabled = (req: any, res: any) => {
    audit("payment.method_disabled", { path: req.path });
    res.status(503).json({ code: 'payment_method_unavailable', message: "This payment method is not available. Please pay with Razorpay (UPI, cards, EMI and pay-later options are available there)." });
  };
  app.post('/api/payment/snapmint/order', isAuthenticated, paymentLimiter, directBnplDisabled);
  app.post('/api/payment/snapmint/callback', directBnplDisabled);
  app.post('/api/payment/lazypay/order', isAuthenticated, paymentLimiter, directBnplDisabled);
  app.post('/api/payment/lazypay/callback', directBnplDisabled);

  // ─── Transactions ─────────────────────────────────────────
  app.get('/api/transactions', isAuthenticated, async (req: any, res) => {
    try {
      const txns = await storage.getUserTransactions((req.user as any).id);
      res.json(txns);
    } catch { res.status(500).json({ message: "Failed to fetch transactions" }); }
  });

  // ─── Chat ─────────────────────────────────────────────────
  app.get('/api/chat/:astrologerId', isAuthenticated, async (req: any, res) => {
    try {
      const messages = await storage.getChatMessages((req.user as any).id, req.params.astrologerId);
      res.json(messages);
    } catch { res.status(500).json({ message: "Failed to fetch messages" }); }
  });

  app.post('/api/chat/:astrologerId', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as any;
      const userId = user.id;
      const { astrologerId } = req.params;
      const { message, sender } = req.body;
      if (!message || !sender) return res.status(400).json({ message: "Message and sender required" });
      if (typeof message !== 'string' || message.length > 2000) return res.status(400).json({ message: "Message is too long (2000 characters max)" });

      // The old AI-astrologer chat duplicated Ask Your Kundli without its metering; no client
      // uses it. Ask questions go through /api/ai/chat only.
      if (astrologerId === 'ai-astrologer') {
        return res.status(410).json({ code: 'use_ask_kundli', message: "Ask your Kundli at /api/ai/chat." });
      }

      const chatMessage = await storage.createChatMessage({ userId, astrologerId, message, sender });

      // Push the message to the recipient (best-effort)
      if (sender === 'user') {
        sendPushToAstrologer(astrologerId, {
          title: `${user.firstName || 'A user'} sent you a message`,
          body: message.slice(0, 120),
          link: `/chat/${userId}`,
          data: { type: 'chat', userId },
        });
      } else {
        const astro = await storage.getAstrologerById(astrologerId);
        sendPushToUser(userId, {
          title: `${astro?.name || 'Your astrologer'} replied`,
          body: message.slice(0, 120),
          link: `/chat/${astrologerId}`,
          data: { type: 'chat', astrologerId },
        });
      }

      res.json(chatMessage);
    } catch { res.status(500).json({ message: "Failed to send message" }); }
  });

  // ─── Consultations ────────────────────────────────────────
  app.post('/api/consultations/start', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { astrologerId, type } = req.body;
      if (!astrologerId || !type) return res.status(400).json({ message: "astrologerId and type required" });

      const astrologer = await storage.getAstrologerById(astrologerId);
      if (!astrologer) return res.status(404).json({ message: "Astrologer not found" });
      if (!astrologer.isOnline) return res.status(400).json({ message: "Astrologer is currently offline" });

      const pricePerMin = parseFloat(astrologer.pricePerMinute || "25");

      // First-chat-free: a user's very first chat consultation gets N free minutes
      const startUser = await storage.getUser(userId);
      const eligibleForFreeChat = type === 'chat' && !startUser?.freeChatUsed;

      // Check wallet balance (minimum 5 minutes) — skipped for the free first chat
      if (!eligibleForFreeChat) {
        const wallet = await storage.getWallet(userId);
        const minRequired = pricePerMin * 5;
        if (parseFloat(wallet?.balance || "0") < minRequired) {
          return res.status(400).json({ message: `Insufficient balance. Minimum ₹${minRequired} required for 5 minutes.` });
        }
      }

      const agoraChannel = getChannelName(`${astrologerId}_${Date.now()}`);
      const consultation = await storage.createConsultation({
        userId,
        astrologerId,
        type,
        status: 'active',
        pricePerMinute: pricePerMin.toString(),
        agoraChannel,
        isFree: eligibleForFreeChat,
        freeMinutes: eligibleForFreeChat ? FREE_CHAT_MINUTES : 0,
      });

      // Consume the free-chat entitlement immediately so it can't be reused
      if (eligibleForFreeChat) {
        await storage.updateUser(userId, { freeChatUsed: true });
      }

      // Update astrologer status to busy
      await storage.updateAstrologer(astrologerId, { availability: 'busy' });

      // Notify astrologer
      notifyAstrologer(astrologerId, {
        type: 'new_session',
        consultationId: consultation.id,
        userId,
        sessionType: type,
        agoraChannel,
      });
      sendPushToAstrologer(astrologerId, {
        title: 'New consultation request',
        body: `A user started a ${type} consultation with you.`,
        link: '/astrologer/dashboard',
        data: { type: 'new_session', consultationId: consultation.id },
      });

      await storage.createNotification({
        userId,
        type: 'session_start',
        title: 'Consultation Started',
        body: `Your ${type} consultation with ${astrologer.name} has started.`,
      });

      res.status(201).json(consultation);
    } catch (error) {
      console.error("Start consultation error:", error);
      res.status(500).json({ message: "Failed to start consultation" });
    }
  });

  app.post('/api/consultations/:id/end', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const owned = await storage.getConsultationById(req.params.id);
      if (!owned || owned.userId !== userId) return res.status(404).json({ message: "Not found" });
      const consultation = await storage.endConsultation(owned.id);

      // Finalised once, as the session ends (the WebSocket stop usually closes it moments
      // before this call). Ending an old consultation again only returns it: no earning,
      // no availability change, no notifications.
      const endedAt = consultation.endedAt ? new Date(consultation.endedAt).getTime() : 0;
      const justEnded = owned.status === 'active' || (consultation.status === 'ended' && Date.now() - endedAt < FINALISE_WINDOW_MS);
      if (!justEnded) return res.json(consultation);

      // Set astrologer back to online
      if (consultation.astrologerId) {
        await storage.updateAstrologer(consultation.astrologerId, { availability: 'online' });
      }

      // The astrologer earns on what the user was actually charged, once per consultation.
      const gross = await storage.getBilledAmountForConsultation(consultation.id);
      let earned = false;
      if (gross > 0 && !(await storage.hasEarningForConsultation(consultation.id))) {
        const platformFee = (gross * PLATFORM_FEE_PERCENTAGE) / 100;
        const net = gross - platformFee;
        try {
          await storage.createEarning({
            astrologerId: consultation.astrologerId,
            consultationId: consultation.id,
            grossAmount: gross.toFixed(2),
            platformFee: platformFee.toFixed(2),
            netAmount: net.toFixed(2),
          });
          earned = true;
        } catch (err: any) {
          if (err?.code !== '23505') throw err; // a concurrent end already recorded it
        }
      }
      if (earned) {
        const net = gross - (gross * PLATFORM_FEE_PERCENTAGE) / 100;

        notifyAstrologer(consultation.astrologerId, {
          type: 'session_ended',
          consultationId: consultation.id,
          earning: net.toFixed(2),
        });
      }

      await storage.createNotification({
        userId,
        type: 'session_start',
        title: 'Consultation Ended',
        body: `Your consultation ended. Duration: ${Math.floor((consultation.durationSeconds || 0) / 60)} minutes. Charged: ₹${gross.toFixed(2)}`,
      });

      // Send consultation summary email (fire-and-forget)
      const endUser = await storage.getUser(userId);
      const endAstrologer = consultation.astrologerId
        ? await storage.getAstrologerById(consultation.astrologerId)
        : null;
      if (endUser?.email && endAstrologer) {
        sendConsultationSummary(endUser.email, {
          userName: endUser.firstName || 'User',
          astrologerName: endAstrologer.name,
          type: consultation.type,
          durationMinutes: Math.floor((consultation.durationSeconds || 0) / 60),
          totalAmount: gross.toFixed(2),
        }).catch((err) => { console.error('[email] consultation summary failed:', err); });
      }

      // AI post-consult follow-up notification (fire-and-forget)
      if (endAstrologer) {
        (async () => {
          try {
            const userKundlis = await storage.getUserKundlis(userId);
            const latestKundli = await verifiedChart(userKundlis?.[0]);
            const durationMinutes = Math.floor((consultation.durationSeconds || 0) / 60);
            const followUp = await generatePostConsultFollowUp(
              latestKundli,
              endAstrologer.name,
              consultation.type || 'chat',
              durationMinutes
            );
            await storage.createNotification({
              userId,
              type: 'system',
              title: 'Your post-session insights',
              body: followUp,
            });
            notifyUser(userId, { type: 'notification', title: 'Your post-session insights', body: followUp });
          } catch (err) {
            console.error('[ai] post-consult follow-up failed:', err);
          }
        })();
      }

      res.json(consultation);
    } catch (error) {
      console.error("End consultation error:", error);
      res.status(500).json({ message: "Failed to end consultation" });
    }
  });

  app.get('/api/consultations', isAuthenticated, async (req: any, res) => {
    try {
      const list = await storage.getUserConsultations((req.user as any).id);
      res.json(list);
    } catch { res.status(500).json({ message: "Failed to fetch consultations" }); }
  });

  app.get('/api/consultations/:id', isAuthenticated, async (req: any, res) => {
    try {
      const consultation = await storage.getConsultationById(req.params.id);
      if (!consultation || consultation.userId !== (req.user as any).id) return res.status(404).json({ message: "Not found" });
      res.json(consultation);
    } catch { res.status(500).json({ message: "Failed to fetch consultation" }); }
  });

  // ─── Agora Token ──────────────────────────────────────────
  app.get('/api/agora/token', isAuthenticated, async (req: any, res) => {
    try {
      const { channel, uid, role } = req.query;
      if (!channel) return res.status(400).json({ message: "channel required" });

      const token = generateAgoraToken(
        channel as string,
        parseInt(uid as string) || 0,
        (role as "publisher" | "subscriber") || "publisher"
      );
      res.json({ token, channel, appId: process.env.AGORA_APP_ID });
    } catch (error: any) {
      if (error.message?.includes("must be set")) {
        return res.status(503).json({ message: "Voice/video calls not configured. Set AGORA_APP_ID and AGORA_APP_CERTIFICATE." });
      }
      res.status(500).json({ message: "Failed to generate token" });
    }
  });

  // ─── Reviews ──────────────────────────────────────────────
  app.post('/api/reviews', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { astrologerId, consultationId, rating, comment } = req.body;
      if (!astrologerId || !rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "astrologerId and rating (1-5) required" });
      }
      // Check if already reviewed
      if (consultationId) {
        const existing = await storage.getUserReviewForConsultation(userId, consultationId);
        if (existing) return res.status(409).json({ message: "Already reviewed this consultation" });
      }
      const review = await storage.createReview({ userId, astrologerId, consultationId, rating, comment });
      res.status(201).json(review);
    } catch { res.status(500).json({ message: "Failed to submit review" }); }
  });

  app.get('/api/reviews/:astrologerId', async (req, res) => {
    try {
      const reviews = await storage.getAstrologerReviews(req.params.astrologerId);
      res.json(reviews);
    } catch { res.status(500).json({ message: "Failed to fetch reviews" }); }
  });

  // ─── Schedule ─────────────────────────────────────────────
  app.post('/api/schedule', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { astrologerId, scheduledAt, type, durationMinutes, notes } = req.body;
      if (!astrologerId || !scheduledAt || !type) {
        return res.status(400).json({ message: "astrologerId, scheduledAt and type required" });
      }
      const astrologer = await storage.getAstrologerById(astrologerId);
      const pricePerMin = parseFloat(astrologer?.pricePerMinute || "25");
      const totalAmount = (pricePerMin * (durationMinutes || 30)).toFixed(2);

      const call = await storage.createScheduledCall({
        userId, astrologerId, scheduledAt, type,
        durationMinutes: durationMinutes || 30,
        notes, totalAmount,
      });

      notifyAstrologer(astrologerId, {
        type: 'new_booking',
        call,
        userName: userId,
      });

      await storage.createNotification({
        userId,
        type: 'schedule',
        title: 'Appointment Booked',
        body: `Your ${type} consultation with ${astrologer?.name} is scheduled for ${new Date(scheduledAt).toLocaleString()}.`,
      });

      // Send booking confirmation email (fire-and-forget)
      const bookingUser = await storage.getUser(userId);
      if (bookingUser?.email && astrologer) {
        sendBookingConfirmation(bookingUser.email, {
          userName: bookingUser.firstName || 'User',
          astrologerName: astrologer.name,
          type,
          scheduledAt: new Date(scheduledAt),
          durationMinutes: durationMinutes || 30,
          totalAmount,
        }).catch(() => {});
      }

      res.status(201).json(call);
    } catch { res.status(500).json({ message: "Failed to book appointment" }); }
  });

  app.get('/api/schedule', isAuthenticated, async (req: any, res) => {
    try {
      const list = await storage.getUserScheduledCalls((req.user as any).id);
      res.json(list);
    } catch { res.status(500).json({ message: "Failed to fetch schedule" }); }
  });

  app.delete('/api/schedule/:id', isAuthenticated, async (req: any, res) => {
    try {
      const call = await storage.cancelUserScheduledCall(req.params.id, (req.user as any).id);
      if (!call) return res.status(404).json({ message: "Booking not found" });
      res.json(call);
    } catch { res.status(500).json({ message: "Failed to cancel booking" }); }
  });

  // ─── Notifications ────────────────────────────────────────
  app.get('/api/notifications', isAuthenticated, async (req: any, res) => {
    try {
      const list = await storage.getUserNotifications((req.user as any).id);
      res.json(list);
    } catch { res.status(500).json({ message: "Failed to fetch notifications" }); }
  });

  app.put('/api/notifications/:id/read', isAuthenticated, async (req: any, res) => {
    try {
      await storage.markNotificationRead(req.params.id, (req.user as any).id);
      res.json({ success: true });
    } catch { res.status(500).json({ message: "Failed to update notification" }); }
  });

  app.put('/api/notifications/read/all', isAuthenticated, async (req: any, res) => {
    try {
      await storage.markAllNotificationsRead((req.user as any).id);
      res.json({ success: true });
    } catch { res.status(500).json({ message: "Failed to mark notifications" }); }
  });

  // ─── Push notification tokens (FCM) ────────────────────────
  app.post('/api/push/register', isAuthenticated, async (req: any, res) => {
    try {
      const { token, platform } = req.body;
      if (!token) return res.status(400).json({ message: "token required" });
      // A logged-in astrologer dashboard uses the astrologer session
      const identity = req.session?.astrologerId
        ? { ownerId: req.session.astrologerId, ownerType: 'astrologer' }
        : { ownerId: (req.user as any).id, ownerType: 'user' };
      await storage.savePushToken({ ...identity, token, platform: platform || 'web' });
      res.json({ success: true });
    } catch (err) {
      console.error('Push register error:', err);
      res.status(500).json({ message: "Failed to register push token" });
    }
  });

  app.post('/api/push/unregister', async (req: any, res) => {
    try {
      const { token } = req.body;
      if (token) await storage.deletePushToken(token);
      res.json({ success: true });
    } catch { res.status(500).json({ message: "Failed to unregister push token" }); }
  });

  // ─── Astromall (store) ─────────────────────────────────────
  app.get('/api/store/products', async (_req, res) => {
    try {
      res.json(await storage.getProducts());
    } catch { res.status(500).json({ message: 'Failed to fetch products' }); }
  });

  app.get('/api/store/products/:slug', async (req, res) => {
    try {
      const product = await storage.getProductBySlug(req.params.slug);
      if (!product) return res.status(404).json({ message: 'Product not found' });
      res.json(product);
    } catch { res.status(500).json({ message: 'Failed to fetch product' }); }
  });

  // Wallet-based checkout
  app.post('/api/store/orders', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { items, shipping } = req.body as {
        items: { productId: string; quantity: number }[];
        shipping: { name?: string; phone?: string; address?: string; city?: string; state?: string; pincode?: string };
      };
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: 'Cart is empty' });
      }
      if (!shipping?.name || !shipping?.phone || !shipping?.address || !shipping?.pincode) {
        return res.status(400).json({ message: 'Shipping name, phone, address and pincode are required' });
      }

      // Resolve products + compute server-side total (never trust client prices)
      const resolved = [];
      let total = 0;
      for (const item of items) {
        const product = await storage.getProductById(item.productId);
        if (!product || !product.isActive) return res.status(400).json({ message: 'A product is unavailable' });
        const qty = Math.max(1, Math.min(10, Number(item.quantity) || 1));
        const price = parseFloat(product.price);
        total += price * qty;
        resolved.push({ productId: product.id, productName: product.name, quantity: qty, price: product.price });
      }
      total = Math.round(total * 100) / 100;

      const debit = await storage.debitWallet(userId, total, `Astromall order (${resolved.length} item${resolved.length > 1 ? 's' : ''})`);
      if (!debit) return res.status(402).json({ message: 'Insufficient wallet balance. Please recharge to place the order.' });

      const order = await storage.createOrder({
        userId,
        totalAmount: total.toFixed(2),
        paymentMethod: 'wallet',
        shippingName: shipping.name,
        shippingPhone: shipping.phone,
        shippingAddress: shipping.address,
        shippingCity: shipping.city,
        shippingState: shipping.state,
        shippingPincode: shipping.pincode,
      }, resolved);

      await storage.createNotification({
        userId, type: 'system', title: 'Order Placed',
        body: `Your order of ₹${total.toFixed(2)} has been placed successfully.`,
      });
      sendPushToUser(userId, { title: 'Order Placed', body: `Your Astromall order of ₹${total.toFixed(2)} is confirmed.`, link: '/store' });

      res.status(201).json({ order, newBalance: debit.balance });
    } catch (err) {
      console.error('Order error:', err);
      res.status(500).json({ message: 'Failed to place order' });
    }
  });

  app.get('/api/store/orders', isAuthenticated, async (req: any, res) => {
    try {
      res.json(await storage.getUserOrders((req.user as any).id));
    } catch { res.status(500).json({ message: 'Failed to fetch orders' }); }
  });

  // ─── Paid Reports ──────────────────────────────────────────
  app.get('/api/reports/types', async (_req, res) => {
    try {
      res.json((await storage.getReportTypes()).map(pricedReportType));
    } catch { res.status(500).json({ message: 'Failed to fetch report types' }); }
  });

  app.post('/api/reports/order', isAuthenticated, aiLimiter, aiBudget('admin'), async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { reportTypeId } = req.body;
      const selection = selectChart(req.body);
      if (selection.kind === 'invalid') return res.status(400).json({ message: selection.message });
      const reportType = await storage.getReportTypeById(reportTypeId);
      if (!reportType || !reportType.isActive || !isOfferedReportCategory(reportType.category)) return res.status(404).json({ message: 'Report not available' });
      // A client showing an older price is asked to confirm the current one before anything is charged.
      const expectedPrice = req.body?.expectedPrice;
      if (expectedPrice !== undefined && Number(expectedPrice) !== reportPrice(reportType)) {
        return res.status(409).json({ code: 'price_changed', price: reportPrice(reportType), message: `The price of this report is now ₹${reportPrice(reportType)}. You have not been charged.` });
      }
      // Paid reports are AI-written and quality-checked; nothing templated is ever sold in their place.
      if (!reportsAvailable()) return res.status(503).json({ message: 'Reports are temporarily unavailable. You have not been charged.', code: 'reports_unavailable' });

      // Resolve a chart: an explicit saved chart, an on-the-fly chart computed
      // from entered birth details (NOT saved to the user's charts), or — only
      // when neither was supplied — the user's most recent saved chart.
      let kundli: any = null;
      let kundliRef: string | undefined;
      if (selection.kind === 'saved') {
        kundli = await storage.getKundliById(selection.kundliId);
        if (!kundli || kundli.userId !== userId) return res.status(404).json({ message: "Kundli not found" });
        kundli = await currentChart(kundli);
        kundliRef = kundli.id;
      }
      if (selection.kind === 'birthDetails') {
        const birthDetails = selection.details;
        const dob = new Date(birthDetails.dateOfBirth);
        const coords = await resolveBirthCoords(birthDetails.latitude, birthDetails.longitude, birthDetails.placeOfBirth ?? undefined);
        if (!coords) {
          return res.status(400).json({ message: "Please pick an exact birth place for the report — an approximate location gives a wrong Ascendant." });
        }
        const nk = await getKundli(dob, birthDetails.timeOfBirth, coords.lat, coords.lng, {
          timeAccuracy: birthDetails.isBirthTimeApproximate === true ? 'approximate' : 'exact',
          timezone: birthDetails.timezone ?? null,
          utcOffset: birthDetails.utcOffset ?? null,
          place: birthDetails.placeOfBirth ?? null,
        });
        kundli = {
          name: birthDetails.name,
          dateOfBirth: dob,
          timeOfBirth: birthDetails.timeOfBirth,
          placeOfBirth: birthDetails.placeOfBirth,
          zodiacSign: nk.zodiacSign,
          moonSign: nk.moonSign,
          ascendant: nk.ascendant,
          chartData: { ...nk.chartData, isBirthTimeApproximate: birthDetails.isBirthTimeApproximate === true },
          dashas: nk.dashas,
          doshas: nk.doshas,
          remedies: nk.remedies,
        };
      }
      if (selection.kind === 'default') {
        const userKundlis = await storage.getUserKundlis(userId);
        kundli = await currentChart(userKundlis?.[0] ?? null);
        if (kundli) kundliRef = kundli.id;
      }
      if (!kundli) return res.status(400).json({ message: 'Provide birth details or generate your Kundli first to order a report.' });
      // Never charge for a report built on a chart without a verified V3 calculation.
      if (!isCurrentCanonicalChart((kundli.chartData as any)?.canonical)) {
        return res.status(409).json({ message: chartVersionStatus(kundli).notes[0] ?? 'This chart needs to be recreated with its birth place before a report can be generated.', chartStatus: chartVersionStatus(kundli) });
      }

      if (reportType.category === 'life_complete' && (kundli.chartData as any)?.canonical?.birth?.timeAccuracy === 'approximate') {
        return res.status(409).json({ message: 'The Complete Life Report reads every house, so it needs an exact birth time. You have not been charged.' });
      }
      const placed = await storage.placeReportOrder({
        userId,
        reportTypeId: reportType.id,
        kundliId: kundliRef,
        subjectName: (kundli as any).name || undefined,
        price: reportPrice(reportType),
        description: `Report: ${reportType.name}`,
      });
      if (!placed) return res.status(402).json({ message: 'Insufficient wallet balance. Please recharge to order this report.' });
      if ('refused' in placed) {
        if (placed.refused === 'duplicate') {
          return res.status(409).json({ code: 'report_in_progress', orderId: placed.order?.id, message: 'This report is already being prepared. You have not been charged again.' });
        }
        return res.status(429).json({ code: 'free_report_daily_limit', message: 'Free-access accounts can generate a limited number of reports per day.' });
      }
      const { order } = placed;
      audit("wallet.debit", { userId, reason: 'report', orderId: order.id, amount: Number(order.chargedAmount ?? 0), reportTypeId: reportType.id });

      // Generated asynchronously; the client polls until the order is ready or failed (refunded).
      void fulfilReportOrder(order, reportType.name, () => reportType.category === 'life_complete'
        ? generateLifeReport(kundli)
        : generateReport(reportType.category || 'life', kundli));

      res.status(201).json({ orderId: order.id, newBalance: placed.balance });
    } catch (err) {
      if (err instanceof BirthInputError || err instanceof CalculationError) return res.status(400).json({ message: err.message });
      console.error('Report order error:', err);
      res.status(500).json({ message: 'Failed to order report' });
    }
  });

  app.get('/api/reports/orders', isAuthenticated, async (req: any, res) => {
    try {
      res.json(await storage.getUserReportOrders((req.user as any).id));
    } catch { res.status(500).json({ message: 'Failed to fetch reports' }); }
  });

  app.get('/api/reports/orders/:id', isAuthenticated, async (req: any, res) => {
    try {
      const order = await storage.getReportOrderById(req.params.id);
      if (!order || order.userId !== (req.user as any).id) return res.status(404).json({ message: 'Report not found' });
      res.json(order);
    } catch { res.status(500).json({ message: 'Failed to fetch report' }); }
  });

  // ─── Book a Pooja ──────────────────────────────────────────
  app.get('/api/poojas', async (_req, res) => {
    try {
      res.json(await storage.getPoojas());
    } catch { res.status(500).json({ message: 'Failed to fetch poojas' }); }
  });

  app.post('/api/poojas/book', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { poojaId, devoteeName, gotra, preferredDate, sankalpNotes } = req.body;
      if (!devoteeName) return res.status(400).json({ message: 'Devotee name is required' });
      const pooja = await storage.getPoojaById(poojaId);
      if (!pooja || !pooja.isActive) return res.status(404).json({ message: 'Pooja not available' });

      const price = parseFloat(pooja.price);
      const debit = await storage.debitWallet(userId, price, `Pooja booking: ${pooja.name}`);
      if (!debit) return res.status(402).json({ message: 'Insufficient wallet balance. Please recharge to book this pooja.' });

      const booking = await storage.createPoojaBooking({
        userId,
        poojaId: pooja.id,
        poojaName: pooja.name,
        amount: pooja.price,
        devoteeName,
        gotra,
        preferredDate: preferredDate ? new Date(preferredDate) : null,
        sankalpNotes,
      });

      await storage.createNotification({
        userId, type: 'system', title: 'Pooja Booked',
        body: `Your ${pooja.name} has been booked. ${pooja.durationText || ''}`.trim(),
      });
      sendPushToUser(userId, { title: 'Pooja Booked', body: `Your ${pooja.name} is confirmed.`, link: '/pooja' });

      res.status(201).json({ booking, newBalance: debit.balance });
    } catch (err) {
      console.error('Pooja booking error:', err);
      res.status(500).json({ message: 'Failed to book pooja' });
    }
  });

  app.get('/api/poojas/bookings', isAuthenticated, async (req: any, res) => {
    try {
      res.json(await storage.getUserPoojaBookings((req.user as any).id));
    } catch { res.status(500).json({ message: 'Failed to fetch bookings' }); }
  });

  // ─── Live Streaming ────────────────────────────────────────
  const GIFT_CATALOG = [
    { id: 'rose', name: 'Rose', emoji: '🌹', amount: 10 },
    { id: 'diya', name: 'Diya', emoji: '🪔', amount: 25 },
    { id: 'garland', name: 'Garland', emoji: '💐', amount: 51 },
    { id: 'coconut', name: 'Coconut', emoji: '🥥', amount: 101 },
    { id: 'crown', name: 'Crown', emoji: '👑', amount: 251 },
    { id: 'temple', name: 'Temple', emoji: '🛕', amount: 501 },
  ];

  app.get('/api/live/gifts', (_req, res) => res.json(GIFT_CATALOG));

  // Public: list active live streams
  app.get('/api/live', async (_req, res) => {
    try {
      res.json(await storage.getActiveLiveStreams());
    } catch { res.status(500).json({ message: 'Failed to fetch live streams' }); }
  });

  // Astrologer: go live
  app.post('/api/live/start', isAstrologerAuthenticated, async (req: any, res) => {
    try {
      const astrologerId = req.session.astrologerId;
      const { title } = req.body;
      const astrologer = await storage.getAstrologerById(astrologerId);
      if (!astrologer) return res.status(404).json({ message: 'Astrologer not found' });

      const existing = await storage.getActiveLiveStreamByAstrologer(astrologerId);
      if (existing) return res.status(400).json({ message: 'You are already live', stream: existing });

      const agoraChannel = getChannelName(`live_${astrologerId}_${Date.now()}`);
      const stream = await storage.createLiveStream({
        astrologerId,
        title: title?.trim() || `Live with ${astrologer.name}`,
        agoraChannel,
      });
      await storage.updateAstrologer(astrologerId, { isOnline: true, availability: 'online' });

      let token: string | null = null;
      try {
        token = generateAgoraToken(agoraChannel, 0, 'publisher');
      } catch { /* Agora not configured — A/V disabled, chat still works */ }

      // Alert followers that this astrologer is live (best-effort)
      (async () => {
        try {
          const followerIds = await storage.getFollowerUserIds(astrologerId);
          for (const uid of followerIds) {
            await storage.createNotification({
              userId: uid, type: 'system', title: `${astrologer.name} is live! 🔴`,
              body: stream.title,
            });
            sendPushToUser(uid, { title: `${astrologer.name} is live! 🔴`, body: stream.title, link: `/live/${stream.id}` });
          }
        } catch (err) { console.error('Live follower notify error:', err); }
      })();

      res.status(201).json({ stream, token, appId: process.env.AGORA_APP_ID, gifts: GIFT_CATALOG });
    } catch (err) {
      console.error('Live start error:', err);
      res.status(500).json({ message: 'Failed to start live stream' });
    }
  });

  // Astrologer: end live
  app.post('/api/live/:id/end', isAstrologerAuthenticated, async (req: any, res) => {
    try {
      const stream = await storage.getLiveStreamById(req.params.id);
      if (!stream || stream.astrologerId !== req.session.astrologerId) {
        return res.status(404).json({ message: 'Stream not found' });
      }
      const ended = await storage.endLiveStream(stream.id);
      res.json(ended);
    } catch { res.status(500).json({ message: 'Failed to end stream' }); }
  });

  // Viewer: get stream detail + audience token (public — guests can watch)
  app.get('/api/live/:id', async (req: any, res) => {
    try {
      const stream = await storage.getLiveStreamById(req.params.id);
      if (!stream) return res.status(404).json({ message: 'Stream not found' });
      const astrologer = await storage.getAstrologerById(stream.astrologerId);
      let token: string | null = null;
      try {
        token = generateAgoraToken(stream.agoraChannel, 0, 'subscriber');
      } catch { /* Agora not configured */ }
      res.json({
        stream,
        astrologer: astrologer ? { id: astrologer.id, name: astrologer.name, profileImageUrl: astrologer.profileImageUrl, specializations: astrologer.specializations } : null,
        token,
        appId: process.env.AGORA_APP_ID,
        gifts: GIFT_CATALOG,
      });
    } catch { res.status(500).json({ message: 'Failed to fetch stream' }); }
  });

  app.post('/api/live/:id/join', isAuthenticated, async (req: any, res) => {
    try {
      const stream = await storage.incrementStreamViewers(req.params.id);
      const user = req.user as any;
      await storage.createStreamMessage({
        streamId: req.params.id,
        senderId: user.id,
        senderType: 'user',
        senderName: user.firstName || 'A viewer',
        type: 'join',
        message: 'joined',
      });
      res.json({ viewerCount: stream.viewerCount });
    } catch { res.status(500).json({ message: 'Failed to join' }); }
  });

  app.post('/api/live/:id/leave', isAuthenticated, async (req, res) => {
    try {
      await storage.decrementStreamViewers(req.params.id);
      res.json({ success: true });
    } catch { res.status(500).json({ message: 'Failed to leave' }); }
  });

  app.get('/api/live/:id/messages', async (req, res) => {
    try {
      res.json(await storage.getStreamMessages(req.params.id));
    } catch { res.status(500).json({ message: 'Failed to fetch messages' }); }
  });

  // Chat in a stream (user or astrologer)
  app.post('/api/live/:id/message', async (req: any, res) => {
    try {
      const streamId = req.params.id;
      const { message } = req.body;
      if (!message?.trim()) return res.status(400).json({ message: 'Message required' });

      let sender: { id: string; name: string; type: string };
      if (req.session?.astrologerId) {
        const astro = await storage.getAstrologerById(req.session.astrologerId);
        sender = { id: req.session.astrologerId, name: astro?.name || 'Astrologer', type: 'astrologer' };
      } else if (req.isAuthenticated?.() || req.session?.userId) {
        const userId = (req.user as any)?.id || req.session.userId;
        const user = await storage.getUser(userId);
        sender = { id: userId, name: user?.firstName || 'Viewer', type: 'user' };
      } else {
        return res.status(401).json({ message: 'Login to chat' });
      }

      const saved = await storage.createStreamMessage({
        streamId,
        senderId: sender.id,
        senderType: sender.type,
        senderName: sender.name,
        type: 'chat',
        message: message.slice(0, 300),
      });
      res.status(201).json(saved);
    } catch { res.status(500).json({ message: 'Failed to send message' }); }
  });

  // Send a gift (deducts wallet, credits astrologer)
  app.post('/api/live/:id/gift', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { giftId } = req.body;
      const gift = GIFT_CATALOG.find((g) => g.id === giftId);
      if (!gift) return res.status(400).json({ message: 'Invalid gift' });

      const stream = await storage.getLiveStreamById(req.params.id);
      if (!stream || stream.status !== 'live') return res.status(404).json({ message: 'Stream is not live' });

      const debit = await storage.debitWallet(userId, gift.amount, `Live gift: ${gift.name}`);
      if (!debit) return res.status(402).json({ message: 'Insufficient balance. Recharge to send gifts.' });

      // Credit astrologer (net of platform fee)
      const platformFee = (gift.amount * PLATFORM_FEE_PERCENTAGE) / 100;
      const net = gift.amount - platformFee;
      await storage.createEarning({
        astrologerId: stream.astrologerId,
        grossAmount: gift.amount.toFixed(2),
        platformFee: platformFee.toFixed(2),
        netAmount: net.toFixed(2),
      });
      await storage.addStreamGiftTotal(stream.id, gift.amount);

      const user = await storage.getUser(userId);
      const saved = await storage.createStreamMessage({
        streamId: stream.id,
        senderId: userId,
        senderType: 'user',
        senderName: user?.firstName || 'A viewer',
        type: 'gift',
        message: `${gift.emoji} sent ${gift.name}`,
        giftName: gift.name,
        giftAmount: gift.amount.toFixed(2),
      });

      sendPushToAstrologer(stream.astrologerId, {
        title: 'You received a gift! 🎁',
        body: `${user?.firstName || 'A viewer'} sent you a ${gift.name} (₹${gift.amount}).`,
      });

      res.status(201).json({ message: saved, newBalance: debit.balance });
    } catch (err) {
      console.error('Gift error:', err);
      res.status(500).json({ message: 'Failed to send gift' });
    }
  });

  // ─── AI Astrologer ────────────────────────────────────────

  // Get AI Chat session history
  app.get('/api/ai/chat/:sessionId', isAuthenticated, async (req: any, res) => {
    try {
      const history = await storage.getAiChatHistory((req.user as any).id, req.params.sessionId);
      res.json(history);
    } catch {
      res.status(500).json({ message: "Failed to fetch chat history" });
    }
  });

  const askAllowance = async (user: { id: string; emailVerifiedAt?: Date | string | null }, sessionId?: string, chartKey?: string) => {
    const freeQuestions = askFreeQuestionsFor(user);
    const counts = await storage.getAskAllowance(user.id, { freeQuestions, sessionId, chartKey });
    return { enforced: askEnforced(), emailVerified: Boolean(user.emailVerifiedAt), freeQuestionsTotal: freeQuestions, ...counts };
  };

  // Ask allowance for the signed-in user (and, with sessionId + kundliId, the thread's follow-ups).
  app.get('/api/ai/question-count', isAuthenticated, async (req: any, res) => {
    try {
      const sessionId = typeof req.query.sessionId === 'string' && req.query.sessionId.length <= 64 ? req.query.sessionId : undefined;
      const kundliId = typeof req.query.kundliId === 'string' && req.query.kundliId.length <= 64 ? req.query.kundliId : undefined;
      const allowance = await askAllowance(req.user as any, sessionId, kundliId ? `kundli:${kundliId}` : undefined);
      res.json({ used: allowance.freeQuestionsUsed, free: allowance.freeQuestionsTotal, remaining: allowance.freeQuestionsRemaining, ...allowance });
    } catch {
      res.status(500).json({ message: "Failed to fetch question count" });
    }
  });

  // ─── Ask question packs (wallet) ──────────────────────────
  app.get('/api/ask/packs', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as any;
      const [allowance, history, wallet] = await Promise.all([askAllowance(user), storage.getAskEntitlements(user.id), storage.getWallet(user.id)]);
      res.json({
        enabled: features.askPacks(),
        packs: features.askPacks() ? ASK_PACKS.map((p) => ({ ...p, followUpsEach: ASK_PACK_FOLLOW_UPS })) : [],
        balance: wallet?.balance ?? "0.00",
        allowance,
        history,
      });
    } catch {
      res.status(500).json({ message: "Failed to load question packs" });
    }
  });

  // Price and quantity come only from the server's catalogue; one request id buys once.
  app.post('/api/ask/packs/purchase', isAuthenticated, paymentLimiter, async (req: any, res) => {
    try {
      if (!features.askPacks()) return res.status(404).json({ code: 'ask_packs_disabled', message: "Question packs are not available." });
      const user = req.user as any;
      const pack = askPack(req.body?.packId);
      if (!pack) return res.status(400).json({ message: "Choose a question pack", field: 'packId' });
      const requestId = askPackRequestKey(req.body?.requestId);
      if (!requestId) return res.status(400).json({ message: "Invalid request" });
      const result = await storage.purchaseAskPack(user.id, { ...pack, followUpsEach: ASK_PACK_FOLLOW_UPS }, requestId);
      if (result.kind === 'free_access') {
        audit("ask.pack_refused", { userId: user.id, packId: pack.id, reason: 'free_access' });
        return res.status(409).json({ code: 'free_access_unlimited', message: "Your account already asks without limit." });
      }
      if (result.kind === 'insufficient') {
        audit("ask.pack_refused", { userId: user.id, packId: pack.id, reason: 'insufficient_balance' });
        return res.status(402).json({ code: 'insufficient_balance', required: pack.price, message: "Your wallet balance doesn't cover this pack." });
      }
      if (result.kind === 'request_conflict') return res.status(409).json({ code: 'request_conflict', message: "This purchase was already made with a different pack." });
      if (result.kind === 'purchased') {
        audit("wallet.debit", { userId: user.id, reason: 'ask_pack', amount: pack.price, transactionId: result.entitlement.transactionId, entitlementId: result.entitlement.id });
        audit("ask.pack_purchased", { userId: user.id, packId: pack.id, entitlementId: result.entitlement.id, quantity: pack.questions });
      }
      res.status(result.kind === 'purchased' ? 201 : 200).json({
        replayed: result.kind === 'replay',
        entitlementId: result.entitlement.id,
        questions: result.entitlement.quantity,
        followUpsEach: result.entitlement.followUpsEach,
        newBalance: result.balance,
        // The purchase is committed by now; a failed count must not turn it into an error reply.
        allowance: await askAllowance(user).catch(() => null),
      });
    } catch (err) {
      console.error("Ask pack purchase error:", (err as Error)?.message);
      res.status(500).json({ message: "Purchase failed. You have not been charged." });
    }
  });

  // Chat with AI Astrologer (Super-Council Orchestrator)
  app.post('/api/ai/chat', isAuthenticated, aiLimiter, aiBudget('user'), async (req: any, res) => {
    try {
      const user = req.user as any;
      const { message, sessionId, language } = req.body;
      if (!message || typeof message !== 'string') return res.status(400).json({ message: "Message is required" });
      if (message.length > 2000) return res.status(400).json({ message: "Message is too long (2000 characters max)" });
      const selection = selectChart(req.body);
      if (selection.kind === 'invalid') return res.status(400).json({ message: selection.message });

      if (sessionId != null && (typeof sessionId !== 'string' || sessionId.length > 64)) return res.status(400).json({ message: "Invalid session" });
      const activeSessionId = sessionId || crypto.randomUUID();

      let birthDate = user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : 'Unknown';
      let birthTime = user.timeOfBirth || 'Unknown';
      let birthPlace = user.placeOfBirth || 'Unknown';
      let chartData: any = null;

      // Resolve a chart: entered birth details (computed in-memory, not saved),
      // an explicit saved chart, or — only when neither was supplied — the
      // user's most recent saved chart.
      let kundli: any = selection.kind === 'saved' ? await storage.getKundliById(selection.kundliId) : null;
      if (selection.kind === 'saved' && (!kundli || kundli.userId !== user.id)) return res.status(404).json({ message: "Kundli not found" });
      if (selection.kind === 'saved') kundli = await currentChart(kundli);
      if (selection.kind === 'birthDetails') {
        const birthDetails = selection.details;
        const dob = new Date(birthDetails.dateOfBirth);
        const coords = await resolveBirthCoords(birthDetails.latitude, birthDetails.longitude, birthDetails.placeOfBirth ?? undefined);
        if (!coords) {
          return res.status(400).json({ message: "Please enter an exact birth place so I can calculate the Ascendant accurately." });
        }
        const nk = await getKundli(dob, birthDetails.timeOfBirth, coords.lat, coords.lng, {
          timeAccuracy: birthDetails.isBirthTimeApproximate === true ? 'approximate' : 'exact',
          timezone: birthDetails.timezone ?? null,
          utcOffset: birthDetails.utcOffset ?? null,
          place: birthDetails.placeOfBirth ?? null,
        });
        kundli = {
          name: birthDetails.name,
          dateOfBirth: dob,
          timeOfBirth: birthDetails.timeOfBirth,
          placeOfBirth: birthDetails.placeOfBirth,
          zodiacSign: nk.zodiacSign,
          moonSign: nk.moonSign,
          ascendant: nk.ascendant,
          chartData: { ...nk.chartData, isBirthTimeApproximate: birthDetails.isBirthTimeApproximate === true },
          dashas: nk.dashas,
          doshas: nk.doshas,
        };
      }
      if (selection.kind === 'default') {
        const userKundlis = await storage.getUserKundlis(user.id);
        kundli = await currentChart(userKundlis?.[0] ?? null);
      }
      if (kundli) {
        birthDate = kundli.dateOfBirth ? new Date(kundli.dateOfBirth).toISOString().split('T')[0] : 'Unknown';
        birthTime = kundli.timeOfBirth || 'Unknown';
        birthPlace = kundli.placeOfBirth || 'Unknown';
        chartData = {
          ascendant: kundli.ascendant,
          sunSign: kundli.zodiacSign,
          moonSign: kundli.moonSign,
          planets: kundli.chartData?.planetaryPositions,
          calculatedChart: kundli.chartData,
          dashas: kundli.dashas,
          doshas: kundli.doshas
        };
      }

      // Metering: reserve this message (an independent question, or a follow-up within its
      // question's allowance) before any model call; settled below.
      const chartKey = askChartKey(selection as any, kundli?.id ?? null);
      const reservation = await storage.reserveAskUsage({
        userId: user.id, chartKey, sessionId: activeSessionId, idempotencyKey: askIdempotencyKey(req.body.requestId),
        freeQuestions: askFreeQuestionsFor(user), freeFollowUps: ASK_FREE_FOLLOW_UPS, enforce: askEnforced(),
        unlimited: await storage.hasFreeAccess(user.id),
      });
      if (reservation.kind === 'in_flight') return res.status(409).json({ code: 'ask_in_flight', message: "This question is already being answered." });
      if (reservation.kind === 'exhausted') {
        audit("ask.refused", { userId: user.id, chart: chartKey.split(":")[0] });
        if (!user.emailVerifiedAt) {
          return res.status(402).json({ code: 'email_verification_required', message: "Verify your email address to use your free questions.", allowance: await askAllowance(user, activeSessionId, chartKey) });
        }
        return res.status(402).json({ code: 'ask_allowance_exhausted', message: "You have used your free questions.", packsAvailable: features.askPacks(), allowance: await askAllowance(user, activeSessionId, chartKey) });
      }
      if (reservation.kind === 'replay') {
        const prior = reservation.usage.replyMessageId ? await storage.getAiChatMessage(user.id, reservation.usage.replyMessageId) : undefined;
        if (!prior) return res.status(409).json({ code: 'ask_in_flight', message: "This question was already answered." });
        const allowance = await askAllowance(user, reservation.usage.sessionId, reservation.usage.chartKey);
        return res.json({ sessionId: reservation.usage.sessionId, reply: prior.content, evidence: null, answerSource: 'replay', replayed: true, questionsUsed: allowance.freeQuestionsUsed, allowance });
      }
      const usage = reservation.usage;
      audit("ask.reserved", { userId: user.id, usageId: usage.id, kind: usage.kind, entitlement: usage.entitlement, chart: chartKey.split(":")[0] });
      let settledUsage = false;
      const settleUsage = async (outcome: 'consumed' | 'released', replyMessageId?: string) => {
        if (settledUsage) return;
        settledUsage = true;
        const row = await storage.settleAskUsage(usage.id, outcome, replyMessageId);
        if (row) audit(outcome === 'consumed' ? "ask.consumed" : "ask.released", { userId: user.id, usageId: usage.id, kind: usage.kind, entitlement: usage.entitlement });
      };
      try {
        // Only persist accepted requests after chart ownership/location validation.
        await storage.saveAiChatMessage({
          userId: user.id,
          sessionId: activeSessionId,
          role: 'user',
          content: message
        });

        // Long-term memory: what we've learned about this user before.
        const memories = await storage.getUserMemories(user.id, 30)
          .then((rows) => rows.map((r) => r.content))
          .catch(() => [] as string[]);

        // Current transits (Gochar) for the bound chart.
        let transits: string | undefined;
        if (isCurrentCanonicalChart((kundli?.chartData as any)?.canonical)) {
          try {
            transits = transitSummary(transitsForChart((kundli!.chartData as any).canonical, (kundli!.chartData as any)?.ashtakavarga?.sav));
          } catch (err) {
            console.error('[chat] transit computation failed:', err);
          }
        }

        // Closed feedback loop: this user's verified past events + system accuracy.
        let verifiedEvents: string[] = [];
        let accuracyNote: string | undefined;
        try {
          const fb = await storage.getPredictionFeedbacksByUser(user.id);
          verifiedEvents = fb
            .filter((f: any) => f.wasAccurate)
            .map((f: any) => `${f.predictionCategory}${f.actualOccurrenceDate ? ` around ${new Date(f.actualOccurrenceDate).toISOString().slice(0, 7)}` : ''} (confirmed via ${f.dashaSystemUsed})`)
            .slice(0, 20);
          const stats = await storage.getPatternStatistics();
          if (stats?.total > 0) accuracyNote = `Verified prediction accuracy so far: ${stats.accuracy}% over ${stats.total} confirmed predictions — calibrate confidence accordingly.`;
        } catch (err) {
          console.error('[chat] feedback load failed:', err);
        }

        // Ask Your Kundli: route the question, build the deterministic evidence packet,
        // then explain it (one model call) or, for deep questions, run the council.
        // Prior turns come from this user's stored session, never from the client (which could forge assistant turns).
        const history = sessionId
          ? (await storage.getAiChatHistory(user.id, activeSessionId).catch(() => []))
              .filter((h) => h.role === 'user' || h.role === 'assistant')
              .slice(-7, -1)
              .map((h) => ({ role: h.role as 'user' | 'assistant', content: String(h.content).slice(0, 4000) }))
          : [];
        const route = routeQuestion(message, { depth: req.body.depth === 'deep' ? 'deep' : undefined });
        const canonical = kundli?.chartData?.canonical;
        let aiResponseText: string;
        let evidenceSummary: ReturnType<typeof packetSummary> | null = null;
        let answerSource: 'llm' | 'deterministic' = 'llm';
        if (isCurrentCanonicalChart(canonical)) {
          const packet = buildEvidencePacket(canonical, route, new Date(), transits);
          evidenceSummary = packetSummary(packet);
          if (route.depth === 'deep' && features.aiCouncil()) {
            // Generated and checked in English; translated only after the guard (localise.ts).
            const reading = await runCouncil({
              birthDetails: { date: birthDate, time: birthTime, place: birthPlace },
              chartData, profession: 'User', language: 'English', memories, transits, verifiedEvents, accuracyNote,
              evidencePacket: packet.text, currentQuery: message,
            });
            const guarded = await guardAnswer(packet, reading, async () => (await answerSimple(packet, message, { memories, history })).text);
            aiResponseText = await localise(guarded.text, language);
            answerSource = guarded.source;
          } else {
            const answer = await answerSimple(packet, message, { memories, history });
            aiResponseText = await localise(answer.text, language);
            answerSource = answer.source;
          }
        } else if (kundli) {
          // A chart was chosen but has no verified V3 calculation: explain rather than guess from legacy data.
          aiResponseText = limitedChartReply(chartVersionStatus(kundli).notes[0]);
          answerSource = 'deterministic';
        } else {
          const answer = await answerWithoutChart(message, { language, history });
          aiResponseText = answer.text;
          answerSource = answer.source;
        }

        // Save AI response to DB
        const replyMessage = await storage.saveAiChatMessage({
          userId: user.id,
          sessionId: activeSessionId,
          role: 'assistant',
          content: aiResponseText
        });
        // Only a model answer uses the allowance; a deterministic fallback (model failed or
        // unavailable, or a chart that cannot be read) restores it.
        await settleUsage(answerSource === 'llm' ? 'consumed' : 'released', replyMessage?.id);

        // Extract durable facts from this message into long-term memory (async).
        extractMemories(message)
          .then(async (mems) => {
            if (!mems.length) return;
            const existing = (await storage.getUserMemories(user.id, 200)).map((m) => m.content.toLowerCase());
            for (const m of mems) {
              if (!existing.includes(m.content.toLowerCase())) {
                await storage.addUserMemory({ userId: user.id, kind: m.kind, content: m.content, sourceSessionId: activeSessionId });
              }
            }
          })
          .catch((err) => console.error('[memory] extraction failed:', err));

        const allowance = await askAllowance(user, activeSessionId, chartKey);
        res.json({
          sessionId: activeSessionId,
          reply: aiResponseText,
          evidence: evidenceSummary,
          answerSource,
          questionsUsed: allowance.freeQuestionsUsed,
          allowance,
        });
      } catch (err) {
        await settleUsage('released').catch(() => {});
        throw err;
      }
    } catch (error: any) {
      if (error instanceof BirthInputError || error instanceof CalculationError) return res.status(400).json({ message: error.message });
      console.error("AI Chat Error:", error);
      res.status(500).json({ message: "AI Council is currently unavailable. Please try again later." });
    }
  });

  // Interpret a saved Kundli with AI
  app.post('/api/ai/interpret-kundli', isAuthenticated, aiLimiter, aiBudget('user'), async (req: any, res) => {
    try {
      const { kundliId } = req.body;
      if (!kundliId) return res.status(400).json({ message: "kundliId is required" });

      const owned = await storage.getKundliById(kundliId);
      if (!owned || owned.userId !== (req.user as { id: string }).id) return res.status(404).json({ message: "Kundli not found" });
      const kundli = await currentChart(owned);

      const interpretation = await interpretKundli(kundli);
      res.json(interpretation);
    } catch (error: any) {
      if (error instanceof InterpretationUnavailableError) return res.status(409).json({ message: error.message });
      if (error.message?.includes("OPENAI_API_KEY")) {
        return res.status(503).json({ message: "AI features not configured. Set OPENAI_API_KEY." });
      }
      console.error("AI interpret error:", error);
      res.status(500).json({ message: "Failed to generate AI interpretation" });
    }
  });

  // Pre-consultation brief — talking points tailored to user's chart + astrologer
  app.get('/api/ai/pre-consult-brief', isAuthenticated, aiLimiter, aiBudget('user'), async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { astrologerId } = req.query;
      if (!astrologerId) return res.status(400).json({ message: "astrologerId required" });

      const [astrologer, userKundlis] = await Promise.all([
        storage.getAstrologerById(astrologerId as string),
        storage.getUserKundlis(userId),
      ]);
      if (!astrologer) return res.status(404).json({ message: "Astrologer not found" });

      const latestKundli = await verifiedChart(userKundlis?.[0]);
      const brief = await generatePreConsultBrief(
        latestKundli,
        astrologer.name,
        astrologer.specializations || []
      );
      res.json(brief);
    } catch (error: any) {
      if (error.message?.includes("OPENAI_API_KEY")) {
        return res.status(503).json({ message: "AI features not configured. Set OPENAI_API_KEY." });
      }
      console.error("Pre-consult brief error:", error);
      res.status(500).json({ message: "Failed to generate brief" });
    }
  });

  // Astrologer matching — rank online astrologers by chart compatibility
  app.get('/api/ai/match-astrologer', isAuthenticated, aiLimiter, aiBudget('user'), async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const userKundlis = await storage.getUserKundlis(userId);
      const latestKundli = await verifiedChart(userKundlis?.[0]);
      if (!latestKundli) return res.status(400).json({ message: "No verified Kundli found. Create (or recreate) your birth chart with its birth place first." });

      const allAstrologers = await storage.getAllAstrologers();
      const candidates = (allAstrologers || [])
        .filter((a: any) => a.isOnline && a.isVerified)
        .slice(0, 10) // limit tokens
        .map((a: any) => ({ id: a.id, name: a.name, specializations: a.specializations || [] }));

      if (!candidates.length) return res.json([]);

      const matches = await matchAstrologerToChart(latestKundli, candidates);
      res.json(matches);
    } catch (error: any) {
      if (error.message?.includes("OPENAI_API_KEY")) {
        return res.status(503).json({ message: "AI features not configured. Set OPENAI_API_KEY." });
      }
      console.error("Match astrologer error:", error);
      res.status(500).json({ message: "Failed to match astrologer" });
    }
  });

  // ─── Admin / Developer Dashboard ──────────────────────────
  // Paid Pooja bookings and store orders still open while the marketplace is paused:
  // each needs fulfilling or refunding.
  app.get('/api/admin/marketplace/open-items', isAdmin, adminLimiter, async (_req, res) => {
    try {
      res.json({ marketplaceEnabled: features.marketplace(), ...(await storage.getOpenPaidMarketplaceItems()) });
    } catch { res.status(500).json({ message: 'Failed to load open marketplace items' }); }
  });

  // Recharges whose gateway payment did not match the order (amount, currency, order, refund,
  // or a second payment): never credited automatically; listed for an admin to resolve.
  app.get('/api/admin/payments/review', isAdmin, adminLimiter, async (_req, res) => {
    try {
      res.json(await storage.getRechargesForReview());
    } catch { res.status(500).json({ message: 'Failed to list payments for review' }); }
  });

  // Settle pending Razorpay recharges whose confirmation never arrived (also runs on a timer).
  // Dry run unless ?apply=1; ?days=N (default 7) limits it to recharges from the last N days.
  app.post('/api/admin/payments/reconcile', isAdmin, adminLimiter, async (req, res) => {
    try {
      const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);
      res.json(await reconcilePendingRecharges(new Date(), undefined, {
        createdAfter: new Date(Date.now() - days * 86_400_000),
        dryRun: req.query.apply !== '1',
      }));
    } catch (err: any) {
      if (err?.message?.includes('must be set')) return res.status(503).json({ message: 'Payment gateway not configured' });
      console.error('Reconcile error:', err);
      res.status(500).json({ message: 'Reconciliation failed' });
    }
  });

  // Report orders that need a decision: failed orders never refunded, and delivered orders
  // whose content is the old templated placeholder. Refunds are explicit, one order at a time.
  app.get('/api/admin/reports/review', isAdmin, adminLimiter, async (_req, res) => {
    try {
      res.json(await storage.getReportOrdersNeedingReview());
    } catch { res.status(500).json({ message: 'Failed to load report orders' }); }
  });

  app.post('/api/admin/reports/:id/refund', isAdmin, adminLimiter, async (req, res) => {
    try {
      const order = await storage.getReportOrderById(req.params.id);
      if (!order) return res.status(404).json({ message: 'Report order not found' });
      if (order.status === 'processing') return res.status(409).json({ message: 'This order is still being prepared.' });
      const result = order.status === 'ready'
        ? await storage.refundPlaceholderReport(order.id)
        : await storage.failAndRefundReportOrder(order.id, order.failureReason ?? 'refunded by admin');
      if (!result) return res.status(409).json({ message: 'This order has already been refunded.' });
      await storage.createNotification({
        userId: order.userId, type: 'system', title: 'Report refunded',
        body: result.refunded > 0 ? `₹${result.refunded.toFixed(0)} for a report that did not meet our standard has been returned to your wallet.` : 'A report that did not meet our standard has been marked refunded.',
      }).catch(() => {});
      res.json({ orderId: order.id, refunded: result.refunded });
    } catch { res.status(500).json({ message: 'Refund failed' }); }
  });

  app.get('/api/admin/stats', isAdmin, adminLimiter, async (_req, res) => {
    try {
      const [
        [{ count: userCount }],
        [{ count: kundliCount }],
        [{ count: consultationCount }],
        [{ count: totalRevenue }],
        astrologerList,
      ] = await Promise.all([
        db.select({ count: sql<number>`count(*)::int` }).from(usersTable),
        db.select({ count: sql<number>`count(*)::int` }).from(kundlisTable),
        db.select({ count: sql<number>`count(*)::int` }).from(consultationsTable),
        db.select({ count: sql<number>`coalesce(sum(amount::numeric), 0)::int` }).from(transactionsTable).where(sql`type = 'recharge' and status = 'completed'`),
        storage.getAllAstrologers(),
      ]);
      res.json({
        users: userCount,
        kundlis: kundliCount,
        astrologers: astrologerList.length,
        onlineAstrologers: astrologerList.filter((a) => a.isOnline).length,
        consultations: consultationCount,
        totalRevenue,
      });
    } catch (err) {
      console.error('Admin stats error:', err);
      res.status(500).json({ message: 'Failed to fetch stats' });
    }
  });

  app.get('/api/admin/astrologers', isAdmin, adminLimiter, async (_req, res) => {
    try {
      const list = await storage.getAllAstrologers();
      res.json(list.map(adminAstrologer));
    } catch { res.status(500).json({ message: 'Failed to fetch astrologers' }); }
  });

  app.put('/api/admin/astrologers/:id', isAdmin, adminLimiter, async (req, res) => {
    try {
      const changes = adminAstrologerUpdate(req.body);
      if (Object.keys(changes).length === 0) return res.status(400).json({ message: 'Nothing to update' });
      const updated = await storage.updateAstrologer(req.params.id, changes);
      if (!updated) return res.status(404).json({ message: 'Astrologer not found' });
      res.json(adminAstrologer(updated));
    } catch { res.status(500).json({ message: 'Failed to update astrologer' }); }
  });

  // ─── Admin: store orders / pooja bookings ──────────────────
  app.get('/api/admin/orders', isAdmin, adminLimiter, async (_req, res) => {
    try {
      res.json(await storage.getAllOrders());
    } catch { res.status(500).json({ message: 'Failed to fetch orders' }); }
  });

  app.put('/api/admin/orders/:id', isAdmin, adminLimiter, async (req, res) => {
    try {
      const { status } = req.body;
      const updated = await storage.updateOrderStatus(req.params.id, status);
      res.json(updated);
    } catch { res.status(500).json({ message: 'Failed to update order' }); }
  });

  app.get('/api/admin/pooja-bookings', isAdmin, adminLimiter, async (_req, res) => {
    try {
      res.json(await storage.getAllPoojaBookings());
    } catch { res.status(500).json({ message: 'Failed to fetch bookings' }); }
  });

  app.put('/api/admin/pooja-bookings/:id', isAdmin, adminLimiter, async (req, res) => {
    try {
      const { status } = req.body;
      const updated = await storage.updatePoojaBookingStatus(req.params.id, status);
      res.json(updated);
    } catch { res.status(500).json({ message: 'Failed to update booking' }); }
  });

  // ─── Admin: astrologer KYC review ──────────────────────────
  app.get('/api/admin/kyc', isAdmin, adminLimiter, async (_req, res) => {
    try {
      res.json((await storage.getAstrologersByKycStatus('pending')).map(adminAstrologer));
    } catch { res.status(500).json({ message: 'Failed to fetch KYC submissions' }); }
  });

  app.post('/api/admin/kyc/:id', isAdmin, adminLimiter, async (req, res) => {
    try {
      const { action, notes } = req.body; // approve | reject
      const updated = await storage.reviewAstrologerKyc(req.params.id, action === 'approve', notes);
      await storage.createNotification({
        userId: updated.id, recipientType: 'astrologer', type: 'system',
        title: action === 'approve' ? 'KYC Approved ✅' : 'KYC Rejected',
        body: action === 'approve' ? 'Your profile is now verified.' : (notes || 'Please resubmit your KYC details.'),
      });
      res.json(adminAstrologer(updated));
    } catch { res.status(500).json({ message: 'Failed to review KYC' }); }
  });

  // ─── Admin: Coupons / Offers ───────────────────────────────
  app.get('/api/admin/coupons', isAdmin, adminLimiter, async (_req, res) => {
    try {
      const list = await storage.getAllCoupons();
      res.json(list);
    } catch { res.status(500).json({ message: 'Failed to fetch coupons' }); }
  });

  app.post('/api/admin/coupons', isAdmin, adminLimiter, async (req, res) => {
    try {
      const parsed = insertCouponSchema.parse({ ...req.body, code: String(req.body.code || '').trim().toUpperCase() });
      const created = await storage.createCoupon(parsed);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: 'Invalid coupon data', errors: err.errors });
      console.error('Create coupon error:', err);
      res.status(500).json({ message: 'Failed to create coupon' });
    }
  });

  app.put('/api/admin/coupons/:id', isAdmin, adminLimiter, async (req, res) => {
    try {
      const updated = await storage.updateCoupon(req.params.id, req.body);
      res.json(updated);
    } catch { res.status(500).json({ message: 'Failed to update coupon' }); }
  });

  app.delete('/api/admin/coupons/:id', isAdmin, adminLimiter, async (req, res) => {
    try {
      await storage.deleteCoupon(req.params.id);
      res.json({ success: true });
    } catch { res.status(500).json({ message: 'Failed to delete coupon' }); }
  });

  // ─── Homepage CMS ──────────────────────────────────────────

  // Public: Get all enabled homepage content grouped by section
  app.get('/api/homepage-content', async (_req, res) => {
    try {
      const rows = await db.select().from(homepageContentTable)
        .where(eq(homepageContentTable.enabled, true))
        .orderBy(asc(homepageContentTable.sortOrder));
      const grouped = {
        banners: rows.filter(r => r.section === 'banner'),
        services: rows.filter(r => r.section === 'service'),
        freeServices: rows.filter(r => r.section === 'free_service'),
      };
      res.json(grouped);
    } catch (err) {
      console.error('Homepage content error:', err);
      res.status(500).json({ message: 'Failed to fetch homepage content' });
    }
  });

  // Admin: Get ALL homepage content (including disabled)
  app.get('/api/admin/homepage-content', isAdmin, adminLimiter, async (_req, res) => {
    try {
      const rows = await db.select().from(homepageContentTable)
        .orderBy(asc(homepageContentTable.section), asc(homepageContentTable.sortOrder));
      res.json(rows);
    } catch { res.status(500).json({ message: 'Failed to fetch content' }); }
  });

  // Admin: Create new item
  app.post('/api/admin/homepage-content', isAdmin, adminLimiter, async (req, res) => {
    try {
      const { section, title, subtitle, icon, href, gradient, cta, sortOrder, enabled } = req.body;
      if (!section || !title) return res.status(400).json({ message: 'section and title required' });
      const [row] = await db.insert(homepageContentTable).values({
        section, title, subtitle, icon, href, gradient, cta,
        sortOrder: sortOrder ?? 0,
        enabled: enabled ?? true,
      }).returning();
      res.status(201).json(row);
    } catch (err) {
      console.error('Create content error:', err);
      res.status(500).json({ message: 'Failed to create content' });
    }
  });

  // Admin: Update item
  app.put('/api/admin/homepage-content/:id', isAdmin, adminLimiter, async (req, res) => {
    try {
      const { title, subtitle, icon, href, gradient, cta, sortOrder, enabled } = req.body;
      const [row] = await db.update(homepageContentTable)
        .set({ title, subtitle, icon, href, gradient, cta, sortOrder, enabled, updatedAt: new Date() })
        .where(eq(homepageContentTable.id, req.params.id))
        .returning();
      if (!row) return res.status(404).json({ message: 'Not found' });
      res.json(row);
    } catch { res.status(500).json({ message: 'Failed to update content' }); }
  });

  // Admin: Delete item
  app.delete('/api/admin/homepage-content/:id', isAdmin, adminLimiter, async (req, res) => {
    try {
      await db.delete(homepageContentTable)
        .where(eq(homepageContentTable.id, req.params.id));
      res.json({ success: true });
    } catch { res.status(500).json({ message: 'Failed to delete content' }); }
  });

  // Admin: Batch reorder
  app.put('/api/admin/homepage-content-reorder', isAdmin, adminLimiter, async (req, res) => {
    try {
      const { items } = req.body; // [{ id, sortOrder }]
      if (!Array.isArray(items)) return res.status(400).json({ message: 'items array required' });
      for (const item of items) {
        await db.update(homepageContentTable)
          .set({ sortOrder: item.sortOrder, updatedAt: new Date() })
          .where(eq(homepageContentTable.id, item.id));
      }
      res.json({ success: true });
    } catch { res.status(500).json({ message: 'Failed to reorder' }); }
  });

  // ─── Admin: Jyotish AI Reading (admin-only professional tool) ──
  const READING_COLUMN: Record<Tradition, 'parasharReading' | 'knRaoReading' | 'kamakhyaReading'> = {
    parashar: 'parasharReading',
    kn_rao: 'knRaoReading',
    kamakhya: 'kamakhyaReading',
  };
  const TRADITION_ENUM = z.enum(['parashar', 'kn_rao', 'kamakhya']);

  function jyotishProfileInfo(profile: { name: string; gender?: string | null; dateOfBirth: Date; timeOfBirth: string; placeOfBirth: string }) {
    return {
      name: profile.name,
      gender: profile.gender,
      dateOfBirth: new Date(profile.dateOfBirth).toISOString().slice(0, 10),
      timeOfBirth: profile.timeOfBirth,
      placeOfBirth: profile.placeOfBirth,
    };
  }

  app.post('/api/admin/jyotish/profiles', isAdmin, adminLimiter, async (req, res) => {
    try {
      const body = insertJyotishClientProfileSchema.omit({ createdByUserId: true, astrologerId: true }).parse(req.body);
      // Reject birth data the canonical engine cannot calculate before saving it.
      computeJyotishChart(body.dateOfBirth, body.timeOfBirth, Number(body.latitude), Number(body.longitude));
      const profile = await storage.createJyotishProfile({ ...body, createdByUserId: (req.user as any).id, astrologerId: null });
      res.json(profile);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: 'Invalid profile data', errors: err.errors });
      if (err instanceof BirthInputError || err instanceof CalculationError) return res.status(400).json({ message: err.message });
      console.error('Create jyotish profile error:', err);
      res.status(500).json({ message: 'Failed to create profile' });
    }
  });

  app.get('/api/admin/jyotish/profiles', isAdmin, adminLimiter, async (req, res) => {
    try {
      res.json(await storage.getJyotishProfiles((req.user as any).id));
    } catch { res.status(500).json({ message: 'Failed to fetch profiles' }); }
  });

  app.get('/api/admin/jyotish/profiles/:id', isAdmin, adminLimiter, async (req, res) => {
    try {
      const profile = await storage.getJyotishProfileById(req.params.id);
      if (!profile) return res.status(404).json({ message: 'Profile not found' });
      res.json(profile);
    } catch { res.status(500).json({ message: 'Failed to fetch profile' }); }
  });

  // Deterministic chart only (no AI) — fast, used for Chart Summary / Dashas / Yogas & Doshas tabs.
  app.post('/api/admin/jyotish/profiles/:id/chart', isAdmin, adminLimiter, async (req, res) => {
    try {
      const profile = await storage.getJyotishProfileById(req.params.id);
      if (!profile) return res.status(404).json({ message: 'Profile not found' });
      const chart = computeJyotishChart(profile.dateOfBirth, profile.timeOfBirth, Number(profile.latitude), Number(profile.longitude));
      res.json(chart);
    } catch (err) {
      if (err instanceof BirthInputError || err instanceof CalculationError) return res.status(400).json({ message: err.message });
      console.error('Compute jyotish chart error:', err);
      res.status(500).json({ message: 'Failed to compute chart' });
    }
  });

  // Create a saved reading snapshot (computes & persists chartData; tradition texts filled in later via /generate).
  app.post('/api/admin/jyotish/profiles/:id/readings', isAdmin, adminLimiter, async (req, res) => {
    try {
      const profile = await storage.getJyotishProfileById(req.params.id);
      if (!profile) return res.status(404).json({ message: 'Profile not found' });
      const language = typeof req.body?.language === 'string' ? req.body.language : 'English';
      const chart = computeJyotishChart(profile.dateOfBirth, profile.timeOfBirth, Number(profile.latitude), Number(profile.longitude));
      const reading = await storage.createJyotishReading({
        profileId: profile.id,
        chartData: chart.chartData,
        language,
        status: 'generating',
      });
      res.json(reading);
    } catch (err) {
      if (err instanceof BirthInputError || err instanceof CalculationError) return res.status(400).json({ message: err.message });
      console.error('Create jyotish reading error:', err);
      res.status(500).json({ message: 'Failed to create reading' });
    }
  });

  app.get('/api/admin/jyotish/profiles/:id/readings', isAdmin, adminLimiter, async (req, res) => {
    try {
      res.json(await storage.listJyotishReadingsForProfile(req.params.id));
    } catch { res.status(500).json({ message: 'Failed to fetch readings' }); }
  });

  app.get('/api/admin/jyotish/readings/:id', isAdmin, adminLimiter, async (req, res) => {
    try {
      const reading = await storage.getJyotishReadingById(req.params.id);
      if (!reading) return res.status(404).json({ message: 'Reading not found' });
      res.json(reading);
    } catch { res.status(500).json({ message: 'Failed to fetch reading' }); }
  });

  // Streams the AI narrative for one tradition, word-by-word, as a plain chunked
  // text/plain response (client reads via fetch()'s ReadableStream — no SSE
  // needed for a same-origin POST). Persists the full text once streaming ends.
  app.post('/api/admin/jyotish/readings/:id/generate', isAdmin, adminLimiter, aiBudget('admin'), async (req, res) => {
    let tradition: Tradition;
    try {
      tradition = TRADITION_ENUM.parse(req.body?.tradition);
    } catch {
      return res.status(400).json({ message: 'tradition must be one of parashar | kn_rao | kamakhya' });
    }
    try {
      const reading = await storage.getJyotishReadingById(req.params.id);
      if (!reading) return res.status(404).json({ message: 'Reading not found' });
      const profile = await storage.getJyotishProfileById(reading.profileId);
      if (!profile) return res.status(404).json({ message: 'Profile not found' });
      const chartData = readingChartData(reading, profile);

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      (res as any).flushHeaders?.();

      const full = await streamTraditionReading(
        tradition,
        jyotishProfileInfo(profile),
        chartData,
        (delta) => res.write(delta),
        reading.language || 'English',
      );
      await storage.updateJyotishReading(reading.id, { [READING_COLUMN[tradition]]: full, status: 'ready' } as any);
      res.end();
    } catch (err: any) {
      console.error('Generate jyotish reading error:', err);
      if (!res.headersSent && (err instanceof BirthInputError || err instanceof CalculationError)) return res.status(400).json({ message: err.message });
      if (!res.headersSent) {
        if (err.message?.includes('OPENAI_API_KEY')) return res.status(503).json({ message: 'AI features not configured. Set OPENAI_API_KEY.' });
        return res.status(500).json({ message: 'Failed to generate reading' });
      }
      res.end();
    }
  });

  // Quick mid-session Q&A ("session query box") — streamed the same way, logged for the record.
  app.post('/api/admin/jyotish/session-queries', isAdmin, adminLimiter, aiBudget('admin'), async (req, res) => {
    const { profileId, readingId, question, language } = req.body || {};
    let tradition: Tradition;
    try {
      tradition = TRADITION_ENUM.parse(req.body?.tradition);
    } catch {
      return res.status(400).json({ message: 'tradition must be one of parashar | kn_rao | kamakhya' });
    }
    if (!profileId || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ message: 'profileId and question are required' });
    }
    try {
      const profile = await storage.getJyotishProfileById(profileId);
      if (!profile) return res.status(404).json({ message: 'Profile not found' });

      // A stored reading is used only if it belongs to THIS profile and holds a current V3 chart;
      // otherwise the chart is recomputed canonically (never another tenant's or a pre-V3 snapshot).
      let chartData: any;
      let usedReadingId: string | undefined;
      if (readingId) {
        const reading = await storage.getJyotishReadingById(readingId);
        if (reading?.profileId === profile.id && isCurrentCanonicalChart((reading.chartData as any)?.canonical)) {
          chartData = reading.chartData;
          usedReadingId = reading.id;
        }
      }
      if (!chartData) {
        chartData = computeJyotishChart(profile.dateOfBirth, profile.timeOfBirth, Number(profile.latitude), Number(profile.longitude)).chartData;
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      (res as any).flushHeaders?.();

      const answer = await answerSessionQuery(
        tradition,
        jyotishProfileInfo(profile),
        chartData,
        question,
        (delta) => res.write(delta),
        language,
      );
      await storage.createJyotishSessionQuery({ profileId, readingId: usedReadingId, tradition, question, answer });
      res.end();
    } catch (err: any) {
      console.error('Jyotish session query error:', err);
      if (!res.headersSent && (err instanceof BirthInputError || err instanceof CalculationError)) return res.status(400).json({ message: err.message });
      if (!res.headersSent) {
        if (err.message?.includes('OPENAI_API_KEY')) return res.status(503).json({ message: 'AI features not configured. Set OPENAI_API_KEY.' });
        return res.status(500).json({ message: 'Failed to answer query' });
      }
      res.end();
    }
  });

  app.get('/api/admin/jyotish/profiles/:id/session-queries', isAdmin, adminLimiter, async (req, res) => {
    try {
      res.json(await storage.listJyotishSessionQueries(req.params.id));
    } catch { res.status(500).json({ message: 'Failed to fetch session queries' }); }
  });

  // ─── Astrologer Pro: practice workspace (tenant = astrologer session) ──
  const PRO_AI_MONTHLY_LIMIT = 80;

  // The workspace (and its paid-model calls) is for verified astrologers only: registering an
  // astrologer account signs it in, but does not verify it.
  app.use('/api/astrologer/pro', isAstrologerAuthenticated, async (req: any, res, next) => {
    try {
      const astro = await storage.getAstrologerById(req.session.astrologerId);
      if (!astro?.isVerified) return res.status(403).json({ code: 'pro_requires_verification', message: 'The Pro workspace is available once your astrologer account is verified.' });
      next();
    } catch {
      res.status(500).json({ message: 'Failed to check your account' });
    }
  });
  const proAiEnabled = (_req: any, res: any, next: any) => (features.proAi()
    ? next()
    : res.status(503).json({ code: 'pro_ai_disabled', message: 'AI readings in the Pro workspace are switched off for now. Your clients and charts are unaffected.' }));
  const proAiGuards = [proAiEnabled, proAiLimiter, aiBudget('astrologer')];

  async function requireProProfile(req: any, profileId: string) {
    const profile = await storage.getJyotishProfileById(profileId);
    if (!profile || profile.astrologerId !== req.session.astrologerId) return null;
    return profile;
  }

  app.get('/api/astrologer/pro/usage', isAstrologerAuthenticated, async (req: any, res) => {
    try {
      res.json(await storage.getProAiUsage(req.session.astrologerId, PRO_AI_MONTHLY_LIMIT));
    } catch { res.status(500).json({ message: 'Failed to fetch Pro usage' }); }
  });

  app.post('/api/astrologer/pro/profiles', isAstrologerAuthenticated, async (req: any, res) => {
    try {
      const body = insertJyotishClientProfileSchema
        .omit({ createdByUserId: true, astrologerId: true })
        .parse(req.body);
      computeJyotishChart(body.dateOfBirth, body.timeOfBirth, Number(body.latitude), Number(body.longitude));
      const profile = await storage.createJyotishProfile({
        ...body,
        createdByUserId: null,
        astrologerId: req.session.astrologerId,
      });
      res.json(profile);
    } catch (err: any) {
      if (err instanceof z.ZodError) return res.status(400).json({ message: 'Invalid profile data', errors: err.errors });
      if (err instanceof BirthInputError || err instanceof CalculationError) return res.status(400).json({ message: err.message });
      console.error('Pro create profile error:', err);
      res.status(500).json({ message: 'Failed to create profile' });
    }
  });

  app.get('/api/astrologer/pro/profiles', isAstrologerAuthenticated, async (req: any, res) => {
    try {
      res.json(await storage.getJyotishProfilesByAstrologer(req.session.astrologerId));
    } catch { res.status(500).json({ message: 'Failed to fetch profiles' }); }
  });

  app.get('/api/astrologer/pro/profiles/:id', isAstrologerAuthenticated, async (req: any, res) => {
    try {
      const profile = await requireProProfile(req, req.params.id);
      if (!profile) return res.status(404).json({ message: 'Profile not found' });
      res.json(profile);
    } catch { res.status(500).json({ message: 'Failed to fetch profile' }); }
  });

  app.post('/api/astrologer/pro/profiles/:id/chart', isAstrologerAuthenticated, async (req: any, res) => {
    try {
      const profile = await requireProProfile(req, req.params.id);
      if (!profile) return res.status(404).json({ message: 'Profile not found' });
      const chart = computeJyotishChart(profile.dateOfBirth, profile.timeOfBirth, Number(profile.latitude), Number(profile.longitude));
      res.json(chart);
    } catch (err) {
      if (err instanceof BirthInputError || err instanceof CalculationError) return res.status(400).json({ message: err.message });
      console.error('Pro compute chart error:', err);
      res.status(500).json({ message: 'Failed to compute chart' });
    }
  });

  app.post('/api/astrologer/pro/profiles/:id/readings', isAstrologerAuthenticated, async (req: any, res) => {
    try {
      const profile = await requireProProfile(req, req.params.id);
      if (!profile) return res.status(404).json({ message: 'Profile not found' });
      const language = typeof req.body?.language === 'string' ? req.body.language : 'English';
      const chart = computeJyotishChart(profile.dateOfBirth, profile.timeOfBirth, Number(profile.latitude), Number(profile.longitude));
      const reading = await storage.createJyotishReading({
        profileId: profile.id,
        chartData: chart.chartData,
        language,
        status: 'generating',
      });
      res.json(reading);
    } catch (err) {
      if (err instanceof BirthInputError || err instanceof CalculationError) return res.status(400).json({ message: err.message });
      console.error('Pro create reading error:', err);
      res.status(500).json({ message: 'Failed to create reading' });
    }
  });

  app.get('/api/astrologer/pro/profiles/:id/readings', isAstrologerAuthenticated, async (req: any, res) => {
    try {
      const profile = await requireProProfile(req, req.params.id);
      if (!profile) return res.status(404).json({ message: 'Profile not found' });
      res.json(await storage.listJyotishReadingsForProfile(profile.id));
    } catch { res.status(500).json({ message: 'Failed to fetch readings' }); }
  });

  app.get('/api/astrologer/pro/readings/:id', isAstrologerAuthenticated, async (req: any, res) => {
    try {
      const reading = await storage.getJyotishReadingById(req.params.id);
      if (!reading) return res.status(404).json({ message: 'Reading not found' });
      const profile = await requireProProfile(req, reading.profileId);
      if (!profile) return res.status(404).json({ message: 'Reading not found' });
      res.json(reading);
    } catch { res.status(500).json({ message: 'Failed to fetch reading' }); }
  });

  app.post('/api/astrologer/pro/readings/:id/generate', isAstrologerAuthenticated, ...proAiGuards, async (req: any, res) => {
    let tradition: Tradition;
    try {
      tradition = TRADITION_ENUM.parse(req.body?.tradition);
    } catch {
      return res.status(400).json({ message: 'tradition must be one of parashar | kn_rao | kamakhya' });
    }
    let creditTaken = false;
    try {
      const reading = await storage.getJyotishReadingById(req.params.id);
      if (!reading) return res.status(404).json({ message: 'Reading not found' });
      const profile = await requireProProfile(req, reading.profileId);
      if (!profile) return res.status(404).json({ message: 'Reading not found' });
      const chartData = readingChartData(reading, profile);

      const credit = await storage.consumeProAiCredit(req.session.astrologerId, 1, PRO_AI_MONTHLY_LIMIT);
      if (!credit.ok) {
        return res.status(402).json({
          message: `Pro Studio AI limit reached (${credit.limit}/month). Upgrade or wait until next month.`,
          used: credit.used,
          limit: credit.limit,
        });
      }
      creditTaken = true;

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      (res as any).flushHeaders?.();

      const full = await streamTraditionReading(
        tradition,
        jyotishProfileInfo(profile),
        chartData,
        (delta) => res.write(delta),
        reading.language || 'English',
      );
      creditTaken = false; // delivered: the credit is spent even if saving it fails
      await storage.updateJyotishReading(reading.id, { [READING_COLUMN[tradition]]: full, status: 'ready' } as any);
      res.end();
    } catch (err: any) {
      if (creditTaken) await storage.refundProAiCredit(req.session.astrologerId).catch(() => {});
      if (!res.headersSent && (err instanceof BirthInputError || err instanceof CalculationError)) return res.status(400).json({ message: err.message });
      console.error('Pro generate reading error:', err);
      if (!res.headersSent && (err instanceof BirthInputError || err instanceof CalculationError)) return res.status(400).json({ message: err.message });
      if (!res.headersSent) {
        if (err.message?.includes('OPENAI_API_KEY')) return res.status(503).json({ message: 'AI features not configured. Set OPENAI_API_KEY.' });
        return res.status(500).json({ message: 'Failed to generate reading' });
      }
      res.end();
    }
  });

  app.post('/api/astrologer/pro/session-queries', isAstrologerAuthenticated, ...proAiGuards, async (req: any, res) => {
    const { profileId, readingId, question, language } = req.body || {};
    let tradition: Tradition;
    try {
      tradition = TRADITION_ENUM.parse(req.body?.tradition);
    } catch {
      return res.status(400).json({ message: 'tradition must be one of parashar | kn_rao | kamakhya' });
    }
    if (!profileId || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ message: 'profileId and question are required' });
    }
    if (question.length > 2000) return res.status(400).json({ message: 'The question is too long (2000 characters max)' });
    let creditTaken = false;
    try {
      const profile = await requireProProfile(req, profileId);
      if (!profile) return res.status(404).json({ message: 'Profile not found' });

      // A stored reading is used only if it belongs to THIS profile and holds a current V3 chart;
      // otherwise the chart is recomputed canonically (never another tenant's or a pre-V3 snapshot).
      let chartData: any;
      let usedReadingId: string | undefined;
      if (readingId) {
        const reading = await storage.getJyotishReadingById(readingId);
        if (reading?.profileId === profile.id && isCurrentCanonicalChart((reading.chartData as any)?.canonical)) {
          chartData = reading.chartData;
          usedReadingId = reading.id;
        }
      }
      if (!chartData) {
        chartData = computeJyotishChart(profile.dateOfBirth, profile.timeOfBirth, Number(profile.latitude), Number(profile.longitude)).chartData;
      }

      const credit = await storage.consumeProAiCredit(req.session.astrologerId, 1, PRO_AI_MONTHLY_LIMIT);
      if (!credit.ok) {
        return res.status(402).json({
          message: `Pro Studio AI limit reached (${credit.limit}/month). Upgrade or wait until next month.`,
          used: credit.used,
          limit: credit.limit,
        });
      }
      creditTaken = true;

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      (res as any).flushHeaders?.();

      const answer = await answerSessionQuery(
        tradition,
        jyotishProfileInfo(profile),
        chartData,
        question,
        (delta) => res.write(delta),
        language,
      );
      creditTaken = false; // delivered: the credit is spent even if saving it fails
      await storage.createJyotishSessionQuery({ profileId, readingId: usedReadingId, tradition, question, answer });
      res.end();
    } catch (err: any) {
      if (creditTaken) await storage.refundProAiCredit(req.session.astrologerId).catch(() => {});
      console.error('Pro session query error:', err);
      if (!res.headersSent && (err instanceof BirthInputError || err instanceof CalculationError)) return res.status(400).json({ message: err.message });
      if (!res.headersSent) {
        if (err.message?.includes('OPENAI_API_KEY')) return res.status(503).json({ message: 'AI features not configured. Set OPENAI_API_KEY.' });
        return res.status(500).json({ message: 'Failed to answer query' });
      }
      res.end();
    }
  });

  app.get('/api/astrologer/pro/profiles/:id/session-queries', isAstrologerAuthenticated, async (req: any, res) => {
    try {
      const profile = await requireProProfile(req, req.params.id);
      if (!profile) return res.status(404).json({ message: 'Profile not found' });
      res.json(await storage.listJyotishSessionQueries(profile.id));
    } catch { res.status(500).json({ message: 'Failed to fetch session queries' }); }
  });

  return existingServer ?? createServer(app);
}

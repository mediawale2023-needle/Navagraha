import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { sql, eq, asc, desc, and, inArray } from "drizzle-orm";
import { setupAuth, isAuthenticated, isAdmin } from "./auth";
import { runCouncil, UserContext } from "./agents/orchestrator";
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
  astrologers as astrologersTable,
  transactions as transactionsTable,
  consultations as consultationsTable,
  homepageContent as homepageContentTable,
} from "@shared/schema";
import { z } from "zod";
import {
  getKundli,
  getKundliMatching,
  getNativeHoroscope,
  getNumerology,
} from "./astroEngine/index.js";
import {
  callPrashnaEngine,
  callSynastryEngine,
  callRemediationEngine,
} from "./astroEngineClient";
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
  verifyRazorpayWebhookSignature,
  createSnapmintOrder,
  verifySnapmintCallback,
  createLazyPayOrder,
  verifyPayUResponseHash,
  RECHARGE_PACKS,
  PLATFORM_FEE_PERCENTAGE,
  evaluateCoupon,
  REFERRER_REWARD,
  REFEREE_REWARD,
  FREE_CHAT_MINUTES,
} from "./paymentService";
import { generateAgoraToken, getChannelName } from "./agoraService";
import { notifyUser, notifyAstrologer } from "./websocketService";
import {
  interpretKundli,
  generatePreConsultBrief,
  generatePostConsultFollowUp,
  matchAstrologerToChart,
} from "./aiAstrologerService";
import { sendWelcomeEmail, sendPaymentReceipt, sendBookingConfirmation, sendConsultationSummary } from "./emailService";
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

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
});

export async function registerRoutes(app: Express, existingServer?: Server): Promise<Server> {

  // Mount Swagger UI
  setupSwagger(app);

  try {
    await setupAuth(app);
  } catch (err) {
    console.error('[startup] Auth setup failed (continuing without auth):', err);
  }

  // NOTE: /api/config is registered in index.ts (before async init) so it
  // responds immediately for Railway healthchecks. Do NOT duplicate here.

  // ─── User Email Auth ──────────────────────────────────────

  app.post('/api/auth/register', authLimiter, async (req: any, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      if (password.length < 8) {
        return res.status(400).json({ message: "Password must be at least 8 characters" });
      }

      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }

      const user = await storage.createUserWithPassword({ email, password, firstName, lastName });

      // Log them in immediately
      (req.session as any).userId = user.id;

      // Auto-create wallet
      await storage.createWallet(user.id).catch(() => {});

      // Send welcome email (fire-and-forget)
      sendWelcomeEmail(email, firstName || "").catch(() => {});

      const { passwordHash: _ph, ...safe } = user as any;
      res.status(201).json(safe);
    } catch (error) {
      console.error("Register error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post('/api/auth/login', authLimiter, async (req: any, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
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
      res.json(user);
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
      res.json(user);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // ─── Kundli ───────────────────────────────────────────────
  app.post('/api/kundli', async (req: any, res) => {
    try {
      const userId = req.user?.id || null;
      const dateOfBirth = new Date(req.body.dateOfBirth);
      const lat = req.body.latitude ? parseFloat(req.body.latitude) : 28.6139;
      const lon = req.body.longitude ? parseFloat(req.body.longitude) : 77.2090;

      const nk = await getKundli(dateOfBirth, req.body.timeOfBirth, lat, lon);
      const kundliData = {
        zodiacSign: nk.zodiacSign,
        moonSign: nk.moonSign,
        ascendant: nk.ascendant,
        chartData: nk.chartData,
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

      const validatedData = insertKundliSchema.parse({ ...req.body, userId });
      const kundli = await storage.createKundli({ ...validatedData, ...kundliData });
      res.json(kundli);
    } catch (error) {
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
      res.json(kundlis);
    } catch { res.status(500).json({ message: "Failed to fetch kundlis" }); }
  });

  app.get('/api/kundli/:id', async (req, res) => {
    try {
      const kundli = await storage.getKundliById(req.params.id);
      if (!kundli) return res.status(404).json({ message: "Kundli not found" });
      res.json(kundli);
    } catch { res.status(500).json({ message: "Failed to fetch kundli" }); }
  });

  // ─── Horoscope ────────────────────────────────────────────
  app.get('/api/horoscope/:sign', async (req, res) => {
    try {
      const sign = req.params.sign.toLowerCase();
      const type = (req.query.type as string) || 'general';
      const date = (req.query.date as string) || 'today';
      const horoscope = await getNativeHoroscope(sign, date as any, type as any);
      res.json({ sign: horoscope.sign, prediction: horoscope.prediction, lucky: horoscope.lucky });
    } catch { res.status(500).json({ message: "Failed to fetch horoscope" }); }
  });

  // ─── Matchmaking ──────────────────────────────────────────
  app.post('/api/matchmaking', async (req, res) => {
    try {
      const {
        person1Name, person1Date, person1Time, person1Lat, person1Lon,
        person2Name, person2Date, person2Time, person2Lat, person2Lon,
      } = req.body;

      const p1 = { dateOfBirth: person1Date, timeOfBirth: person1Time || '12:00:00', latitude: parseFloat(person1Lat) || 28.6139, longitude: parseFloat(person1Lon) || 77.2090 };
      const p2 = { dateOfBirth: person2Date, timeOfBirth: person2Time || '12:00:00', latitude: parseFloat(person2Lat) || 19.0760, longitude: parseFloat(person2Lon) || 72.8777 };
      const result = await getKundliMatching(p1, p2);
      res.json({
        totalScore: result.percentage,
        gunaScore: result.score,
        maxGunaScore: result.maxScore,
        compatibility: result.compatibility,
        recommendation: result.recommendation,
        details: result.details,
        dosha: result.dosha,
        person1: person1Name,
        person2: person2Name,
      });
    } catch { res.status(500).json({ message: "Failed to calculate compatibility" }); }
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
      if (!latitude || !longitude || !question_category) {
        return res.status(400).json({ message: "Missing required Prashna fields" });
      }
      // Calculate current Julian Day at the exact moment of the question
      const julian_day = (Date.now() / 86400000) + 2440587.5;
      const result = await callPrashnaEngine({ julian_day, latitude: parseFloat(latitude), longitude: parseFloat(longitude), question_category });
      if (!result) return res.status(503).json({ message: "Prashna engine unavailable" });
      res.json(result);
    } catch { res.status(500).json({ message: "Failed to calculate Prashna" }); }
  });

  app.post('/api/synastry', async (req, res) => {
    try {
      const { 
        person1Date, person1Time, person1Lat = 28.6139, person1Lon = 77.2090, 
        person2Date, person2Time, person2Lat = 19.0760, person2Lon = 72.8777 
      } = req.body;
      
      if (!person1Date || !person2Date) {
        return res.status(400).json({ message: "Missing birth dates for synastry" });
      }

      // Generate base charts to extract Nakshatra and Moon values
      const p1Chart = await getKundli(person1Date, person1Time || '12:00:00', person1Lat, person1Lon);
      const p2Chart = await getKundli(person2Date, person2Time || '12:00:00', person2Lat, person2Lon);

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

  app.post('/api/feedback', isAuthenticated, async (req: any, res) => {
    try {
      const payload = {
        userId: req.user.id,
        ...req.body
      };
      const feedback = await storage.createPredictionFeedback(payload);
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
      const list = await storage.getAllAstrologers();
      // Don't expose passwordHash or bank details to public
      const safe = list.map(({ passwordHash: _ph, bankAccountNumber: _ban, bankIfsc: _bi, ...a }) => a);
      res.json(safe);
    } catch { res.status(500).json({ message: "Failed to fetch astrologers" }); }
  });

  app.get('/api/astrologers/:id', async (req, res) => {
    try {
      const astrologer = await storage.getAstrologerById(req.params.id);
      if (!astrologer) return res.status(404).json({ message: "Astrologer not found" });
      const { passwordHash: _ph, bankAccountNumber: _ban, bankIfsc: _bi, ...safe } = astrologer;
      res.json(safe);
    } catch { res.status(500).json({ message: "Failed to fetch astrologer" }); }
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
      const { passwordHash: _ph, bankAccountNumber: _ban, bankIfsc: _bi, ...safe } = astrologer;
      res.json(safe);
    } catch (error) {
      console.error("Astrologer login error:", error);
      res.status(500).json({ message: "Login failed" });
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
        astrologer,
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
      const updated = await storage.updateAstrologer(astrologerId, { about, specializations, languages, pricePerMinute, experience, certifications, upiId, bankAccountName, bankAccountNumber, bankIfsc, phoneNumber });
      const { passwordHash: _ph, ...safe } = updated;
      res.json(safe);
    } catch (error) {
      console.error("Profile update error:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  app.post('/api/astrologer/status', isAstrologerAuthenticated, async (req: any, res) => {
    try {
      const { isOnline } = req.body;
      await storage.updateAstrologerOnlineStatus(req.session.astrologerId, isOnline);
      res.json({ isOnline });
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
      const { amount, description } = req.body;
      const cost = parseFloat(amount);
      if (!cost || cost <= 0) return res.status(400).json({ message: "Invalid amount" });
      let wallet = await storage.getWallet(userId);
      if (!wallet) wallet = await storage.createWallet(userId);

      // ── First PDF download is free ──────────────────────────────────────────
      if (description === PDF_DESCRIPTION) {
        const txns = await storage.getUserTransactions(userId);
        const hasUsedFree = txns.some(
          (t) => t.description === PDF_DESCRIPTION && t.status === 'completed',
        );
        if (!hasUsedFree) {
          await storage.createTransaction({
            userId,
            amount: '0',
            type: 'deduction',
            description: PDF_DESCRIPTION,
            status: 'completed',
          });
          return res.json({ balance: wallet.balance, wallet, free: true });
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      const balance = parseFloat(wallet.balance || "0");
      if (balance < cost) {
        return res.status(402).json({ message: "Insufficient balance", balance, required: cost });
      }
      const newBalance = (balance - cost).toFixed(2);
      const updatedWallet = await storage.updateWalletBalance(userId, newBalance);
      await storage.createTransaction({
        userId,
        amount: (-cost).toString(),
        type: 'deduction',
        description: description || 'Service charge',
        status: 'completed',
      });
      res.json({ balance: newBalance, wallet: updatedWallet, free: false });
    } catch { res.status(500).json({ message: "Failed to process deduction" }); }
  });

  // Legacy direct add (for testing / admin)
  app.post('/api/wallet/add', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { amount } = req.body;
      if (!amount || amount <= 0) return res.status(400).json({ message: "Invalid amount" });
      let wallet = await storage.getWallet(userId);
      if (!wallet) wallet = await storage.createWallet(userId);
      const newBalance = (parseFloat(wallet.balance || "0") + parseFloat(amount)).toFixed(2);
      const updatedWallet = await storage.updateWalletBalance(userId, newBalance);
      await storage.createTransaction({ userId, amount: amount.toString(), type: 'recharge', description: 'Wallet recharge', status: 'completed' });
      res.json(updatedWallet);
    } catch { res.status(500).json({ message: "Failed to add money" }); }
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
      const { code, amount } = req.body;
      const rechargeAmount = parseFloat(amount);
      if (!code || !rechargeAmount || rechargeAmount <= 0) {
        return res.status(400).json({ valid: false, message: 'Enter a recharge amount and coupon code.' });
      }
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

  app.post('/api/payment/razorpay/order', isAuthenticated, paymentLimiter, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { amount, packId, couponCode } = req.body;

      if (!amount || amount < 1) return res.status(400).json({ message: "Invalid amount" });

      // Find bonus if pack
      const pack = RECHARGE_PACKS.find(p => p.id === packId);
      if (packId && !pack) {
        return res.status(400).json({ message: "Invalid recharge pack" });
      }
      if (pack && pack.amount !== amount) {
        return res.status(400).json({ message: "Recharge amount does not match selected pack" });
      }
      const bonus = pack?.bonus || 0;

      // Apply coupon (if any) as additional wallet credit
      let couponBonus = 0;
      let appliedCouponCode: string | undefined;
      let appliedCouponId: string | undefined;
      if (couponCode) {
        const coupon = await storage.getCouponByCode(String(couponCode).trim());
        if (!coupon) return res.status(400).json({ message: "Invalid coupon code" });
        const isFirstRecharge = !(await storage.hasCompletedRecharge(userId));
        const userRedemptionCount = await storage.getUserCouponRedemptionCount(userId, coupon.id);
        const evalResult = evaluateCoupon(coupon, amount, { isFirstRecharge, userRedemptionCount });
        if (!evalResult.ok) return res.status(400).json({ message: evalResult.message });
        couponBonus = evalResult.bonus;
        appliedCouponCode = coupon.code;
        appliedCouponId = coupon.id;
      }

      const order = await createRazorpayOrder({
        amount,
        receipt: `wallet_${userId}_${Date.now()}`,
        notes: { userId, bonus: bonus.toString() },
      });

      const totalCredit = amount + bonus + couponBonus;
      const bonusLabel = [
        bonus > 0 ? `+₹${bonus} bonus` : '',
        couponBonus > 0 ? `+₹${couponBonus} (${appliedCouponCode})` : '',
      ].filter(Boolean).join(' ');

      // Create pending transaction
      const pendingTxn = await storage.createTransaction({
        userId,
        amount: totalCredit.toString(),
        type: 'recharge',
        description: `Wallet recharge${bonusLabel ? ` (${bonusLabel})` : ''}`,
        status: 'pending',
        paymentMethod: 'razorpay',
        gatewayOrderId: order.id,
        couponCode: appliedCouponCode,
      });

      // Stage the redemption (counts only once the transaction completes)
      if (appliedCouponId && couponBonus > 0) {
        await storage.recordCouponRedemption({
          couponId: appliedCouponId,
          userId,
          transactionId: pendingTxn.id,
          discountAmount: couponBonus.toString(),
        });
      }

      res.json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
        couponBonus,
        totalCredit,
      });
    } catch (error: any) {
      console.error("Razorpay order error:", error);
      if (error.message?.includes("must be set")) {
        return res.status(503).json({ message: "Payment gateway not configured. Contact support." });
      }
      res.status(500).json({ message: "Failed to create payment order" });
    }
  });

  app.post('/api/payment/razorpay/verify', isAuthenticated, paymentLimiter, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { orderId, paymentId, signature } = req.body;

      const valid = verifyRazorpaySignature(orderId, paymentId, signature);
      if (!valid) return res.status(400).json({ message: "Payment verification failed" });

      const txns = await storage.getUserTransactions(userId);
      const pendingTxn = txns.find((txn) => txn.gatewayOrderId === orderId && txn.status === 'pending');
      if (!pendingTxn) {
        return res.status(404).json({ message: "Pending transaction not found" });
      }

      // Add to wallet
      let wallet = await storage.getWallet(userId);
      if (!wallet) wallet = await storage.createWallet(userId);

      const totalCredit = parseFloat(pendingTxn.amount || "0");
      const newBalance = (parseFloat(wallet.balance || "0") + totalCredit).toFixed(2);
      await storage.updateWalletBalance(userId, newBalance);

      // Update transaction status
      await storage.updateTransactionStatus(pendingTxn.id, 'completed', paymentId, signature);

      await storage.createNotification({
        userId,
        type: 'payment',
        title: 'Wallet Recharged',
        body: `₹${totalCredit} added to your wallet successfully.`,
      });

      // Finalise coupon usage now that the recharge is confirmed
      if (pendingTxn.couponCode) {
        const coupon = await storage.getCouponByCode(pendingTxn.couponCode);
        if (coupon) await storage.incrementCouponUsage(coupon.id);
      }

      // Referral reward: fire once on the invitee's first completed recharge
      let runningBalance = parseFloat(newBalance);
      try {
        const referral = await storage.getReferralByReferee(userId);
        if (referral && referral.status === 'pending') {
          // Credit the new user (referee)
          runningBalance = runningBalance + REFEREE_REWARD;
          await storage.updateWalletBalance(userId, runningBalance.toFixed(2));
          await storage.createTransaction({
            userId,
            amount: REFEREE_REWARD.toString(),
            type: 'recharge',
            description: 'Referral bonus',
            status: 'completed',
          });
          await storage.createNotification({
            userId,
            type: 'payment',
            title: 'Referral Bonus',
            body: `You received ₹${REFEREE_REWARD} referral bonus in your wallet.`,
          });

          // Credit the inviter (referrer)
          const referrerWallet = (await storage.getWallet(referral.referrerId))
            || (await storage.createWallet(referral.referrerId));
          const referrerBalance = (parseFloat(referrerWallet.balance || '0') + REFERRER_REWARD).toFixed(2);
          await storage.updateWalletBalance(referral.referrerId, referrerBalance);
          await storage.createTransaction({
            userId: referral.referrerId,
            amount: REFERRER_REWARD.toString(),
            type: 'recharge',
            description: 'Referral reward',
            status: 'completed',
          });
          await storage.createNotification({
            userId: referral.referrerId,
            type: 'payment',
            title: 'Referral Reward',
            body: `Your friend recharged! ₹${REFERRER_REWARD} has been added to your wallet.`,
          });

          await storage.markReferralRewarded(
            referral.id,
            REFERRER_REWARD.toString(),
            REFEREE_REWARD.toString(),
          );
        }
      } catch (refErr) {
        console.error('Referral reward error:', refErr);
      }

      // Send email receipt (fire-and-forget)
      const user = await storage.getUser(userId);
      if (user?.email) {
        sendPaymentReceipt(user.email, {
          userName: user.firstName || 'User',
          amount: parseFloat(pendingTxn.amount || "0"),
          bonus: 0,
          newBalance: runningBalance,
          paymentId,
        }).catch(() => {});
      }

      res.json({ success: true, newBalance: runningBalance });
    } catch (error) {
      console.error("Razorpay verify error:", error);
      res.status(500).json({ message: "Payment verification failed" });
    }
  });

  // Razorpay webhook (for server-side confirmation)
  app.post('/api/payment/razorpay/webhook', async (req: any, res) => {
    try {
      const signature = req.headers['x-razorpay-signature'] as string;
      const rawBody = req.rawBody?.toString() || JSON.stringify(req.body);

      if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
        return res.status(400).json({ message: "Invalid webhook signature" });
      }

      const event = req.body;
      if (event.event === 'payment.captured') {
        const payment = event.payload.payment.entity;
        const userId = payment.notes?.userId;
        if (userId) {
          notifyUser(userId, { type: 'payment_confirmed', paymentId: payment.id });
        }
      }
      res.json({ status: 'ok' });
    } catch { res.status(500).json({ message: "Webhook error" }); }
  });

  // ─── Snapmint Payment ─────────────────────────────────────

  app.post('/api/payment/snapmint/order', isAuthenticated, paymentLimiter, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { amount } = req.body;
      const user = await storage.getUser(userId);

      const orderId = `snap_${userId}_${Date.now()}`;
      const order = await createSnapmintOrder({
        amount,
        orderId,
        customerName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'User',
        customerEmail: user?.email || '',
        customerPhone: user?.phoneNumber || '',
        returnUrl: `${process.env.APP_URL || 'http://localhost:5000'}/wallet?snapmint=callback`,
      });

      res.json(order);
    } catch (error: any) {
      if (error.message?.includes("not configured")) {
        return res.status(503).json({ message: "Snapmint not configured. Use Razorpay or enable Snapmint in Razorpay Dashboard." });
      }
      res.status(500).json({ message: "Failed to create Snapmint order" });
    }
  });

  app.post('/api/payment/snapmint/callback', async (req: any, res) => {
    try {
      const { checksum, order_id, status, amount, user_id } = req.body;
      const params = { ...req.body };
      delete params.checksum;

      if (!verifySnapmintCallback(params, checksum)) {
        return res.status(400).json({ message: "Invalid callback signature" });
      }

      if (status === 'success' && user_id) {
        let wallet = await storage.getWallet(user_id);
        if (!wallet) wallet = await storage.createWallet(user_id);
        const newBalance = (parseFloat(wallet.balance || "0") + parseFloat(amount)).toFixed(2);
        await storage.updateWalletBalance(user_id, newBalance);
        await storage.createTransaction({
          userId: user_id,
          amount,
          type: 'recharge',
          description: 'Snapmint EMI recharge',
          status: 'completed',
          paymentMethod: 'snapmint',
          gatewayOrderId: order_id,
        });
        notifyUser(user_id, { type: 'payment_confirmed', newBalance: parseFloat(newBalance) });
      }
      res.json({ status: 'ok' });
    } catch { res.status(500).json({ message: "Callback error" }); }
  });

  // ─── LazyPay / PayU ───────────────────────────────────────

  app.post('/api/payment/lazypay/order', isAuthenticated, paymentLimiter, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { amount } = req.body;
      const user = await storage.getUser(userId);

      const txnId = `lp_${userId}_${Date.now()}`;
      const params = createLazyPayOrder({
        amount,
        txnId,
        productInfo: 'Navagraha Wallet Recharge',
        firstName: user?.firstName || 'User',
        email: user?.email || '',
        phone: user?.phoneNumber || '',
        returnUrl: `${process.env.APP_URL || 'http://localhost:5000'}/wallet?lazypay=callback`,
      });

      res.json(params);
    } catch (error: any) {
      if (error.message?.includes("not configured")) {
        return res.status(503).json({
          message: "LazyPay/PayU not configured yet. Apply for a PayU merchant account at https://onboarding.payu.in. LazyPay is also available within Razorpay Checkout once enabled in your Razorpay Dashboard."
        });
      }
      res.status(500).json({ message: "Failed to create LazyPay order" });
    }
  });

  app.post('/api/payment/lazypay/callback', async (req: any, res) => {
    try {
      if (!verifyPayUResponseHash(req.body)) {
        return res.status(400).json({ message: "Invalid callback signature" });
      }
      const { status, txnid, amount } = req.body;
      if (status === 'success') {
        // Extract userId from txnId (format: lp_{userId}_{timestamp})
        const userId = txnid.split('_')[1];
        if (userId) {
          let wallet = await storage.getWallet(userId);
          if (!wallet) wallet = await storage.createWallet(userId);
          const newBalance = (parseFloat(wallet.balance || "0") + parseFloat(amount)).toFixed(2);
          await storage.updateWalletBalance(userId, newBalance);
          await storage.createTransaction({
            userId,
            amount,
            type: 'recharge',
            description: 'LazyPay BNPL recharge',
            status: 'completed',
            paymentMethod: 'lazypay',
            gatewayOrderId: txnid,
          });
          notifyUser(userId, { type: 'payment_confirmed', newBalance: parseFloat(newBalance) });
        }
      }
      // PayU requires redirect
      res.redirect(`${process.env.APP_URL || 'http://localhost:5000'}/wallet`);
    } catch { res.status(500).json({ message: "Callback error" }); }
  });

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

      const chatMessage = await storage.createChatMessage({ userId, astrologerId, message, sender });
      
      // AI Astrologer Integration
      if (astrologerId === 'ai-astrologer' && sender === 'user') {
        const context: UserContext = {
          birthDetails: {
            date: user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : 'Unknown',
            time: user.timeOfBirth || 'Unknown',
            place: user.placeOfBirth || 'Unknown',
          },
          profession: 'User', // Could be pulled from profile if available
          currentQuery: message
        };
        
        // Let the client know the message was saved, AI response will be fetched on next poll/WS
        // Actually, we can just run it asynchronously or wait for it.
        // Waiting for it returns the AI response immediately to the client:
        const aiResponseText = await runCouncil(context);
        const aiMessage = await storage.createChatMessage({
          userId,
          astrologerId,
          message: aiResponseText,
          sender: 'astrologer'
        });
        
        return res.json({ userMessage: chatMessage, aiMessage: aiMessage });
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
      const consultation = await storage.endConsultation(req.params.id);

      // Set astrologer back to online
      if (consultation.astrologerId) {
        await storage.updateAstrologer(consultation.astrologerId, { availability: 'online' });
      }

      // Create earnings record for astrologer
      const gross = parseFloat(consultation.totalAmount || "0");
      if (gross > 0) {
        const platformFee = (gross * PLATFORM_FEE_PERCENTAGE) / 100;
        const net = gross - platformFee;
        await storage.createEarning({
          astrologerId: consultation.astrologerId,
          consultationId: consultation.id,
          grossAmount: gross.toFixed(2),
          platformFee: platformFee.toFixed(2),
          netAmount: net.toFixed(2),
        });

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
        body: `Your consultation ended. Duration: ${Math.floor((consultation.durationSeconds || 0) / 60)} minutes. Total: ₹${consultation.totalAmount}`,
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
          totalAmount: consultation.totalAmount || '0',
        }).catch((err) => { console.error('[email] consultation summary failed:', err); });
      }

      // AI post-consult follow-up notification (fire-and-forget)
      if (endAstrologer) {
        (async () => {
          try {
            const userKundlis = await storage.getUserKundlis(userId);
            const latestKundli = userKundlis?.[0] ?? null;
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

  app.get('/api/consultations/:id', isAuthenticated, async (req, res) => {
    try {
      const consultation = await storage.getConsultationById(req.params.id);
      if (!consultation) return res.status(404).json({ message: "Not found" });
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

  app.delete('/api/schedule/:id', isAuthenticated, async (req, res) => {
    try {
      const call = await storage.updateScheduledCallStatus(req.params.id, 'cancelled');
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

  app.put('/api/notifications/:id/read', isAuthenticated, async (req, res) => {
    try {
      await storage.markNotificationRead(req.params.id);
      res.json({ success: true });
    } catch { res.status(500).json({ message: "Failed to update notification" }); }
  });

  app.put('/api/notifications/read/all', isAuthenticated, async (req: any, res) => {
    try {
      await storage.markAllNotificationsRead((req.user as any).id);
      res.json({ success: true });
    } catch { res.status(500).json({ message: "Failed to mark notifications" }); }
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

  // Chat with AI Astrologer (Super-Council Orchestrator)
  app.post('/api/ai/chat', isAuthenticated, async (req: any, res) => {
    try {
      const user = req.user as any;
      const { message, sessionId, kundliId } = req.body;
      if (!message) return res.status(400).json({ message: "Message is required" });

      const activeSessionId = sessionId || crypto.randomUUID();

      // Save user message to DB
      await storage.saveAiChatMessage({
        userId: user.id,
        sessionId: activeSessionId,
        role: 'user',
        content: message
      });

      let birthDate = user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : 'Unknown';
      let birthTime = user.timeOfBirth || 'Unknown';
      let birthPlace = user.placeOfBirth || 'Unknown';
      let chartData: any = null;

      if (kundliId) {
        const kundli = await storage.getKundliById(kundliId);
        if (kundli && kundli.userId === user.id) {
          birthDate = kundli.dateOfBirth ? new Date(kundli.dateOfBirth).toISOString().split('T')[0] : 'Unknown';
          birthTime = kundli.timeOfBirth || 'Unknown';
          birthPlace = kundli.placeOfBirth || 'Unknown';
          chartData = {
            ascendant: kundli.ascendant,
            sunSign: kundli.zodiacSign,
            moonSign: kundli.moonSign,
            planets: kundli.chartData,
            dashas: kundli.dashas,
            doshas: kundli.doshas
          };
        }
      }

      // Prepare context for Orchestrator
      const context: UserContext = {
        birthDetails: {
          date: birthDate,
          time: birthTime,
          place: birthPlace,
        },
        chartData,
        profession: 'User',
        currentQuery: message
      };

      // Execute Council parallel logic
      const aiResponseText = await runCouncil(context);

      // Save AI response to DB
      await storage.saveAiChatMessage({
        userId: user.id,
        sessionId: activeSessionId,
        role: 'assistant',
        content: aiResponseText
      });

      res.json({
        sessionId: activeSessionId,
        reply: aiResponseText,
        questionsUsed: 0 // Optional: Could track rate limits here
      });
    } catch (error: any) {
      console.error("AI Chat Error:", error);
      res.status(500).json({ message: "AI Council is currently unavailable. Please try again later." });
    }
  });

  // Interpret a saved Kundli with AI
  app.post('/api/ai/interpret-kundli', isAuthenticated, async (req: any, res) => {
    try {
      const { kundliId } = req.body;
      if (!kundliId) return res.status(400).json({ message: "kundliId is required" });

      const kundli = await storage.getKundliById(kundliId);
      if (!kundli) return res.status(404).json({ message: "Kundli not found" });

      // Ensure the kundli belongs to the requesting user
      if (kundli.userId !== (req.user as any).id) {
        return res.status(403).json({ message: "Access denied" });
      }

      const interpretation = await interpretKundli(kundli);
      res.json(interpretation);
    } catch (error: any) {
      if (error.message?.includes("OPENAI_API_KEY")) {
        return res.status(503).json({ message: "AI features not configured. Set OPENAI_API_KEY." });
      }
      console.error("AI interpret error:", error);
      res.status(500).json({ message: "Failed to generate AI interpretation" });
    }
  });

  // Pre-consultation brief — talking points tailored to user's chart + astrologer
  app.get('/api/ai/pre-consult-brief', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const { astrologerId } = req.query;
      if (!astrologerId) return res.status(400).json({ message: "astrologerId required" });

      const [astrologer, userKundlis] = await Promise.all([
        storage.getAstrologerById(astrologerId as string),
        storage.getUserKundlis(userId),
      ]);
      if (!astrologer) return res.status(404).json({ message: "Astrologer not found" });

      const latestKundli = userKundlis?.[0] ?? null;
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
  app.get('/api/ai/match-astrologer', isAuthenticated, async (req: any, res) => {
    try {
      const userId = (req.user as any).id;
      const userKundlis = await storage.getUserKundlis(userId);
      const latestKundli = userKundlis?.[0];
      if (!latestKundli) return res.status(400).json({ message: "No Kundli found. Create a birth chart first." });

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
      res.json(list);
    } catch { res.status(500).json({ message: 'Failed to fetch astrologers' }); }
  });

  app.put('/api/admin/astrologers/:id', isAdmin, adminLimiter, async (req, res) => {
    try {
      const updated = await storage.updateAstrologer(req.params.id, req.body);
      res.json(updated);
    } catch { res.status(500).json({ message: 'Failed to update astrologer' }); }
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

  return existingServer ?? createServer(app);
}

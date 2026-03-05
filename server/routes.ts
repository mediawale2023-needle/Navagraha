import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import {
  insertKundliSchema,
  insertTransactionSchema,
  insertChatMessageSchema,
  insertConsultationSchema,
  insertReviewSchema,
  insertScheduledCallSchema,
} from "@shared/schema";
import { z } from "zod";
import {
  getKundli,
  getKundliMatching,
  getDailyHoroscope as prokeralaHoroscope,
  getNumerology,
  isProkeralaConfigured,
  buildDatetime,
} from "./prokeralaService";
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
} from "./paymentService";
import { generateAgoraToken, getChannelName } from "./agoraService";
import { notifyUser, notifyAstrologer } from "./websocketService";

// ─────────────────────────────────────────────────────────────
// Mock helpers (kept for fallback)
// ─────────────────────────────────────────────────────────────
const zodiacSigns = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const planets = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];

function generateMockKundliData(dateOfBirth: Date, name: string) {
  const zodiacSign = zodiacSigns[dateOfBirth.getMonth()];
  const moonSign = zodiacSigns[(dateOfBirth.getMonth() + 1) % 12];
  const ascendant = zodiacSigns[(dateOfBirth.getDate() % 12)];
  const chartData = {
    houses: Array.from({ length: 12 }, (_, i) => ({
      house: i + 1,
      sign: zodiacSigns[i % 12],
      planets: i === 0 ? ['Sun', 'Mars'] : i === 2 ? ['Moon'] : i === 6 ? ['Jupiter'] : [],
    })),
    planetaryPositions: planets.map(planet => ({
      planet,
      sign: zodiacSigns[Math.floor(Math.random() * 12)],
      degree: Math.floor(Math.random() * 30),
      house: Math.floor(Math.random() * 12) + 1,
    })),
  };
  const dashas = [
    { planet: 'Sun', period: '2020-2026', status: 'current' },
    { planet: 'Moon', period: '2026-2036', status: 'upcoming' },
    { planet: 'Mars', period: '2036-2043', status: 'upcoming' },
  ];
  const doshas = { mangalDosha: false, kaalSarpDosha: false, pitruDosha: false };
  const remedies = [
    { title: 'Gemstone Recommendation', description: 'Wear Ruby for Sun strength', type: 'gemstone' },
    { title: 'Mantra', description: 'Chant "Om Suryaya Namaha" 108 times daily', type: 'mantra' },
    { title: 'Charity', description: 'Donate wheat on Sundays', type: 'charity' },
    { title: 'Fasting', description: 'Fast on Sundays for better results', type: 'fasting' },
  ];
  return { zodiacSign, moonSign, ascendant, chartData, dashas, doshas, remedies };
}

const horoscopePredictions: Record<string, string> = {
  aries: "Today brings new opportunities. Your confidence will attract positive outcomes. Focus on personal goals and trust your instincts.",
  taurus: "Financial matters require attention. A stable approach will yield the best results. Patience is your strength today.",
  gemini: "Communication flows easily. This is an excellent day for negotiations and creative projects. Share your ideas.",
  cancer: "Emotional balance is key. Spend time with loved ones and nurture important relationships. Trust your intuition.",
  leo: "Leadership opportunities arise. Your charisma draws others to you. Take charge of important situations.",
  virgo: "Attention to detail pays off. Organization and planning will lead to success. Health matters improve.",
  libra: "Harmony and balance guide your day. Relationships flourish with gentle communication. Beauty surrounds you.",
  scorpio: "Transformation is in the air. Deep insights emerge. Trust the process of change and renewal.",
  sagittarius: "Adventure calls. Expand your horizons through learning or travel. Optimism attracts good fortune.",
  capricorn: "Professional success is highlighted. Hard work yields recognition. Build strong foundations for the future.",
  aquarius: "Innovation and originality shine. Connect with like-minded individuals. Your unique perspective is valuable.",
  pisces: "Intuition is heightened. Creative and spiritual pursuits bring fulfillment. Trust your dreams and inner wisdom.",
};

// ─────────────────────────────────────────────────────────────
// Astrologer auth middleware
// ─────────────────────────────────────────────────────────────
function isAstrologerAuthenticated(req: any, res: Response, next: Function) {
  if (!req.session?.astrologerId) {
    return res.status(401).json({ message: "Astrologer authentication required" });
  }
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);

  // ─── Config ───────────────────────────────────────────────
  app.get('/api/config', (_req, res) => {
    res.json({
      googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
      razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
      agoraAppId: process.env.AGORA_APP_ID || '',
    });
  });

  // ─── Auth ─────────────────────────────────────────────────
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.put('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { firstName, lastName, phoneNumber } = req.body;
      const user = await storage.updateUser(userId, { firstName, lastName, phoneNumber });
      res.json(user);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // ─── Kundli ───────────────────────────────────────────────
  app.post('/api/kundli', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertKundliSchema.parse({ ...req.body, userId });
      const dateOfBirth = new Date(validatedData.dateOfBirth);
      const lat = validatedData.latitude ? parseFloat(validatedData.latitude) : 28.6139;
      const lon = validatedData.longitude ? parseFloat(validatedData.longitude) : 77.2090;

      let kundliData;
      if (isProkeralaConfigured()) {
        try {
          const pk = await getKundli(dateOfBirth, validatedData.timeOfBirth, lat, lon);
          kundliData = {
            zodiacSign: pk.zodiacSign,
            moonSign:   pk.moonSign,
            ascendant:  pk.ascendant,
            chartData:  pk.chartData,
            dashas:     pk.dashas,
            doshas:     pk.doshas,
            remedies:   pk.remedies,
          };
        } catch (e) {
          console.error('Prokerala kundli error, falling back to mock:', e);
          kundliData = generateMockKundliData(dateOfBirth, validatedData.name);
        }
      } else {
        kundliData = generateMockKundliData(dateOfBirth, validatedData.name);
      }

      const kundli = await storage.createKundli({ ...validatedData, ...kundliData });
      res.json(kundli);
    } catch (error) {
      if (error instanceof z.ZodError) return res.status(400).json({ message: "Validation error", errors: error.errors });
      console.error('Create kundli error:', error);
      res.status(500).json({ message: "Failed to create kundli" });
    }
  });

  app.get('/api/kundli', isAuthenticated, async (req: any, res) => {
    try {
      const kundlis = await storage.getUserKundlis(req.user.claims.sub);
      res.json(kundlis);
    } catch { res.status(500).json({ message: "Failed to fetch kundlis" }); }
  });

  app.get('/api/kundli/:id', isAuthenticated, async (req, res) => {
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
      if (isProkeralaConfigured()) {
        try {
          const horoscope = await prokeralaHoroscope(sign, 'today', 'general');
          return res.json({ sign, prediction: horoscope.prediction, lucky: horoscope.lucky });
        } catch (e) {
          console.error('Prokerala horoscope error, falling back to mock:', e);
        }
      }
      const prediction = horoscopePredictions[sign] || "The stars are aligned in your favor today.";
      res.json({ sign, prediction, lucky: {} });
    } catch { res.status(500).json({ message: "Failed to fetch horoscope" }); }
  });

  // ─── Matchmaking ──────────────────────────────────────────
  app.post('/api/matchmaking', async (req, res) => {
    try {
      const {
        person1Name, person1Date, person1Time, person1Lat, person1Lon,
        person2Name, person2Date, person2Time, person2Lat, person2Lon,
      } = req.body;

      if (isProkeralaConfigured()) {
        try {
          const result = await getKundliMatching(
            { dateOfBirth: person1Date, timeOfBirth: person1Time || '12:00:00', latitude: parseFloat(person1Lat) || 28.6139, longitude: parseFloat(person1Lon) || 77.2090 },
            { dateOfBirth: person2Date, timeOfBirth: person2Time || '12:00:00', latitude: parseFloat(person2Lat) || 19.0760, longitude: parseFloat(person2Lon) || 72.8777 },
          );
          return res.json({
            totalScore:    result.percentage,
            gunaScore:     result.score,
            maxGunaScore:  result.maxScore,
            compatibility: result.compatibility,
            recommendation: result.recommendation,
            details:       result.details,
            dosha:         result.dosha,
            person1:       person1Name,
            person2:       person2Name,
          });
        } catch (e) {
          console.error('Prokerala matchmaking error, falling back to mock:', e);
        }
      }

      // Fallback mock
      const totalScore = Math.floor(Math.random() * 30) + 70;
      res.json({
        totalScore,
        gunaScore: Math.floor(totalScore * 36 / 100),
        maxGunaScore: 36,
        compatibility: totalScore >= 75 ? 'Good' : 'Average',
        mentalScore:   Math.floor(Math.random() * 20) + 80,
        physicalScore: Math.floor(Math.random() * 30) + 65,
        emotionalScore: Math.floor(Math.random() * 20) + 75,
        financialScore: Math.floor(Math.random() * 30) + 60,
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
      if (isProkeralaConfigured()) {
        try {
          const result = await getNumerology(dateOfBirth, firstName, lastName || '', system);
          return res.json(result);
        } catch (e) {
          console.error('Prokerala numerology error:', e);
          return res.status(502).json({ message: "Numerology API unavailable. Please try again." });
        }
      }
      // Mock fallback
      const mockLifePath = (dateStr: string) => {
        const digits = dateStr.replace(/\D/g, '').split('').map(Number);
        let sum = digits.reduce((a, b) => a + b, 0);
        while (sum > 9 && sum !== 11 && sum !== 22 && sum !== 33) {
          sum = String(sum).split('').map(Number).reduce((a, b) => a + b, 0);
        }
        return sum;
      };
      const lp = mockLifePath(dateOfBirth);
      res.json({ lifePath: lp, destiny: ((lp + 3) % 9) || 9, soul: ((lp + 1) % 9) || 9, personality: ((lp + 5) % 9) || 9, birthday: new Date(dateOfBirth).getUTCDate() % 9 || 9, name: `${firstName} ${lastName || ''}`.trim(), details: {}, raw: {} });
    } catch { res.status(500).json({ message: "Failed to calculate numerology" }); }
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

  app.post('/api/astrologer/auth/register', async (req: any, res) => {
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

  app.post('/api/astrologer/auth/login', async (req: any, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }
      const astrologer = await (storage as any).verifyAstrologerPassword(email, password);
      if (!astrologer) {
        return res.status(401).json({ message: "Invalid email or password" });
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
      const userId = req.user.claims.sub;
      let wallet = await storage.getWallet(userId);
      if (!wallet) wallet = await storage.createWallet(userId);
      res.json(wallet);
    } catch { res.status(500).json({ message: "Failed to fetch wallet" }); }
  });

  // Legacy direct add (for testing / admin)
  app.post('/api/wallet/add', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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

  // ─── Razorpay Payment ────────────────────────────────────

  app.post('/api/payment/razorpay/order', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { amount, packId } = req.body;

      if (!amount || amount < 1) return res.status(400).json({ message: "Invalid amount" });

      // Find bonus if pack
      const pack = RECHARGE_PACKS.find(p => p.id === packId);
      const bonus = pack?.bonus || 0;

      const order = await createRazorpayOrder({
        amount,
        receipt: `wallet_${userId}_${Date.now()}`,
        notes: { userId, bonus: bonus.toString() },
      });

      // Create pending transaction
      await storage.createTransaction({
        userId,
        amount: (amount + bonus).toString(),
        type: 'recharge',
        description: `Wallet recharge${bonus > 0 ? ` (+₹${bonus} bonus)` : ''}`,
        status: 'pending',
        paymentMethod: 'razorpay',
        gatewayOrderId: order.id,
      });

      res.json({
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
      });
    } catch (error: any) {
      console.error("Razorpay order error:", error);
      if (error.message?.includes("must be set")) {
        return res.status(503).json({ message: "Payment gateway not configured. Contact support." });
      }
      res.status(500).json({ message: "Failed to create payment order" });
    }
  });

  app.post('/api/payment/razorpay/verify', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { orderId, paymentId, signature, amount, bonus } = req.body;

      const valid = verifyRazorpaySignature(orderId, paymentId, signature);
      if (!valid) return res.status(400).json({ message: "Payment verification failed" });

      // Add to wallet
      let wallet = await storage.getWallet(userId);
      if (!wallet) wallet = await storage.createWallet(userId);

      const totalCredit = parseFloat(amount) + parseFloat(bonus || "0");
      const newBalance = (parseFloat(wallet.balance || "0") + totalCredit).toFixed(2);
      await storage.updateWalletBalance(userId, newBalance);

      // Update transaction status
      const txns = await storage.getUserTransactions(userId);
      const pendingTxn = txns.find(t => t.gatewayOrderId === orderId && t.status === 'pending');
      if (pendingTxn) {
        await storage.updateTransactionStatus(pendingTxn.id, 'completed', paymentId, signature);
      }

      await storage.createNotification({
        userId,
        type: 'payment',
        title: 'Wallet Recharged',
        body: `₹${totalCredit} added to your wallet successfully.`,
      });

      res.json({ success: true, newBalance: parseFloat(newBalance) });
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

  app.post('/api/payment/snapmint/order', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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

  app.post('/api/payment/lazypay/order', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
      const txns = await storage.getUserTransactions(req.user.claims.sub);
      res.json(txns);
    } catch { res.status(500).json({ message: "Failed to fetch transactions" }); }
  });

  // ─── Chat ─────────────────────────────────────────────────
  app.get('/api/chat/:astrologerId', isAuthenticated, async (req: any, res) => {
    try {
      const messages = await storage.getChatMessages(req.user.claims.sub, req.params.astrologerId);
      res.json(messages);
    } catch { res.status(500).json({ message: "Failed to fetch messages" }); }
  });

  app.post('/api/chat/:astrologerId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { astrologerId } = req.params;
      const { message, sender } = req.body;
      if (!message || !sender) return res.status(400).json({ message: "Message and sender required" });

      const chatMessage = await storage.createChatMessage({ userId, astrologerId, message, sender });
      res.json(chatMessage);
    } catch { res.status(500).json({ message: "Failed to send message" }); }
  });

  // ─── Consultations ────────────────────────────────────────
  app.post('/api/consultations/start', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { astrologerId, type } = req.body;
      if (!astrologerId || !type) return res.status(400).json({ message: "astrologerId and type required" });

      const astrologer = await storage.getAstrologerById(astrologerId);
      if (!astrologer) return res.status(404).json({ message: "Astrologer not found" });
      if (!astrologer.isOnline) return res.status(400).json({ message: "Astrologer is currently offline" });

      // Check wallet balance (minimum 5 minutes)
      const wallet = await storage.getWallet(userId);
      const pricePerMin = parseFloat(astrologer.pricePerMinute || "25");
      const minRequired = pricePerMin * 5;
      if (parseFloat(wallet?.balance || "0") < minRequired) {
        return res.status(400).json({ message: `Insufficient balance. Minimum ₹${minRequired} required for 5 minutes.` });
      }

      const agoraChannel = getChannelName(`${astrologerId}_${Date.now()}`);
      const consultation = await storage.createConsultation({
        userId,
        astrologerId,
        type,
        status: 'active',
        pricePerMinute: pricePerMin.toString(),
        agoraChannel,
      });

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
      const userId = req.user.claims.sub;
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

      res.json(consultation);
    } catch (error) {
      console.error("End consultation error:", error);
      res.status(500).json({ message: "Failed to end consultation" });
    }
  });

  app.get('/api/consultations', isAuthenticated, async (req: any, res) => {
    try {
      const list = await storage.getUserConsultations(req.user.claims.sub);
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
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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

      res.status(201).json(call);
    } catch { res.status(500).json({ message: "Failed to book appointment" }); }
  });

  app.get('/api/schedule', isAuthenticated, async (req: any, res) => {
    try {
      const list = await storage.getUserScheduledCalls(req.user.claims.sub);
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
      const list = await storage.getUserNotifications(req.user.claims.sub);
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
      await storage.markAllNotificationsRead(req.user.claims.sub);
      res.json({ success: true });
    } catch { res.status(500).json({ message: "Failed to mark notifications" }); }
  });

  const httpServer = createServer(app);
  return httpServer;
}

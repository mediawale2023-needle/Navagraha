import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { insertKundliSchema, insertTransactionSchema, insertChatMessageSchema } from "@shared/schema";
import { z } from "zod";

// Mock data for astrology calculations
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

  const doshas = {
    mangalDosha: false,
    kaalSarpDosha: false,
    pitruDosha: false,
  };

  const remedies = [
    { title: 'Gemstone Recommendation', description: 'Wear Ruby for Sun strength', type: 'gemstone' },
    { title: 'Mantra', description: 'Chant "Om Suryaya Namaha" 108 times daily', type: 'mantra' },
    { title: 'Charity', description: 'Donate wheat on Sundays', type: 'charity' },
    { title: 'Fasting', description: 'Fast on Sundays for better results', type: 'fasting' },
  ];

  return {
    zodiacSign,
    moonSign,
    ascendant,
    chartData,
    dashas,
    doshas,
    remedies,
  };
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

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
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

  // Kundli routes
  app.post('/api/kundli', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const validatedData = insertKundliSchema.parse({
        ...req.body,
        userId,
      });

      const dateOfBirth = new Date(validatedData.dateOfBirth);
      const kundliData = generateMockKundliData(dateOfBirth, validatedData.name);

      const kundli = await storage.createKundli({
        ...validatedData,
        ...kundliData,
      });

      res.json(kundli);
    } catch (error) {
      console.error("Error creating kundli:", error);
      if (error instanceof z.ZodError) {
        res.status(400).json({ message: "Validation error", errors: error.errors });
      } else {
        res.status(500).json({ message: "Failed to create kundli" });
      }
    }
  });

  app.get('/api/kundli', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const kundlis = await storage.getUserKundlis(userId);
      res.json(kundlis);
    } catch (error) {
      console.error("Error fetching kundlis:", error);
      res.status(500).json({ message: "Failed to fetch kundlis" });
    }
  });

  app.get('/api/kundli/:id', isAuthenticated, async (req, res) => {
    try {
      const kundli = await storage.getKundliById(req.params.id);
      if (!kundli) {
        return res.status(404).json({ message: "Kundli not found" });
      }
      res.json(kundli);
    } catch (error) {
      console.error("Error fetching kundli:", error);
      res.status(500).json({ message: "Failed to fetch kundli" });
    }
  });

  // Horoscope route
  app.get('/api/horoscope/:sign', async (req, res) => {
    try {
      const sign = req.params.sign.toLowerCase();
      const prediction = horoscopePredictions[sign] || "The stars are aligned in your favor today.";
      res.json({ sign, prediction });
    } catch (error) {
      console.error("Error fetching horoscope:", error);
      res.status(500).json({ message: "Failed to fetch horoscope" });
    }
  });

  // Matchmaking route (public - no auth required)
  app.post('/api/matchmaking', async (req, res) => {
    try {
      // Mock compatibility calculation
      const totalScore = Math.floor(Math.random() * 30) + 70; // 70-100%
      const mentalScore = Math.floor(Math.random() * 20) + 80;
      const physicalScore = Math.floor(Math.random() * 30) + 65;
      const emotionalScore = Math.floor(Math.random() * 20) + 75;
      const financialScore = Math.floor(Math.random() * 30) + 60;

      res.json({
        totalScore,
        mentalScore,
        physicalScore,
        emotionalScore,
        financialScore,
        person1: req.body.person1Name,
        person2: req.body.person2Name,
      });
    } catch (error) {
      console.error("Error calculating matchmaking:", error);
      res.status(500).json({ message: "Failed to calculate compatibility" });
    }
  });

  // Astrologer routes
  app.get('/api/astrologers', async (req, res) => {
    try {
      const astrologers = await storage.getAllAstrologers();
      res.json(astrologers);
    } catch (error) {
      console.error("Error fetching astrologers:", error);
      res.status(500).json({ message: "Failed to fetch astrologers" });
    }
  });

  app.get('/api/astrologers/:id', async (req, res) => {
    try {
      const astrologer = await storage.getAstrologerById(req.params.id);
      if (!astrologer) {
        return res.status(404).json({ message: "Astrologer not found" });
      }
      res.json(astrologer);
    } catch (error) {
      console.error("Error fetching astrologer:", error);
      res.status(500).json({ message: "Failed to fetch astrologer" });
    }
  });

  // Wallet routes
  app.get('/api/wallet', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      let wallet = await storage.getWallet(userId);
      
      if (!wallet) {
        wallet = await storage.createWallet(userId);
      }
      
      res.json(wallet);
    } catch (error) {
      console.error("Error fetching wallet:", error);
      res.status(500).json({ message: "Failed to fetch wallet" });
    }
  });

  app.post('/api/wallet/add', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { amount } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      let wallet = await storage.getWallet(userId);
      if (!wallet) {
        wallet = await storage.createWallet(userId);
      }

      const currentBalance = parseFloat(wallet.balance || "0");
      const newBalance = (currentBalance + parseFloat(amount)).toFixed(2);

      const updatedWallet = await storage.updateWalletBalance(userId, newBalance);

      await storage.createTransaction({
        userId,
        amount: amount.toString(),
        type: 'recharge',
        description: 'Wallet recharge',
        status: 'completed',
      });

      res.json(updatedWallet);
    } catch (error) {
      console.error("Error adding money:", error);
      res.status(500).json({ message: "Failed to add money" });
    }
  });

  // Transaction routes
  app.get('/api/transactions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const transactions = await storage.getUserTransactions(userId);
      res.json(transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ message: "Failed to fetch transactions" });
    }
  });

  // Chat routes
  app.get('/api/chat/:astrologerId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { astrologerId } = req.params;
      const messages = await storage.getChatMessages(userId, astrologerId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching chat messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.post('/api/chat/:astrologerId', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { astrologerId } = req.params;
      const { message, sender } = req.body;

      if (!message || !sender) {
        return res.status(400).json({ message: "Message and sender are required" });
      }

      const chatMessage = await storage.createChatMessage({
        userId,
        astrologerId,
        message,
        sender,
      });

      // Simulate astrologer response after 2 seconds
      if (sender === 'user') {
        setTimeout(async () => {
          const responses = [
            "Thank you for reaching out. Let me analyze your question based on Vedic principles.",
            "I sense positive energies around you. Let's explore this further.",
            "Based on your chart, I can provide some valuable insights.",
            "That's an interesting question. The planets reveal much about this matter.",
          ];
          
          const randomResponse = responses[Math.floor(Math.random() * responses.length)];
          
          await storage.createChatMessage({
            userId,
            astrologerId,
            message: randomResponse,
            sender: 'astrologer',
          });
        }, 2000);
      }

      res.json(chatMessage);
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

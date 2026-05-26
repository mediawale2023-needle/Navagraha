import {
  users,
  kundlis,
  astrologers,
  wallets,
  transactions,
  chatMessages,
  consultations,
  reviews,
  scheduledCalls,
  notifications,
  astrologerEarnings,
  payoutRequests,
  aiChatMessages,
  coupons,
  couponRedemptions,
  referrals,
  pushTokens,
  products,
  orders,
  orderItems,
  reportTypes,
  reportOrders,
  poojas,
  poojaBookings,
  liveStreams,
  streamMessages,
  astrologerFollows,
  consultationQueue,
  type Coupon,
  type InsertCoupon,
  type CouponRedemption,
  type Referral,
  type PushToken,
  type Product,
  type InsertProduct,
  type Order,
  type OrderItem,
  type ReportType,
  type ReportOrder,
  type Pooja,
  type PoojaBooking,
  type LiveStream,
  type StreamMessage,
  type AstrologerFollow,
  type ConsultationQueueEntry,
  type User,
  type UpsertUser,
  type Kundli,
  type InsertKundli,
  type Astrologer,
  type InsertAstrologer,
  type Wallet,
  type Transaction,
  type InsertTransaction,
  type ChatMessage,
  type InsertChatMessage,
  type Consultation,
  type InsertConsultation,
  type Review,
  type InsertReview,
  type ScheduledCall,
  type InsertScheduledCall,
  type Notification,
  type AstrologerEarning,
  type PayoutRequest,
  type AiChatMessage,
  type InsertAiChatMessage,
  predictionFeedbacks,
  type PredictionFeedback,
  type InsertPredictionFeedback,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql, asc } from "drizzle-orm";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { isAdminEmail } from "./adminAccess";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, data: Partial<UpsertUser>): Promise<User>;
  createUserWithPassword(data: { email: string; password: string; firstName?: string; lastName?: string }): Promise<User>;
  verifyUserPassword(email: string, password: string): Promise<User | null>;

  // Kundli operations
  createKundli(kundli: InsertKundli): Promise<Kundli>;
  getUserKundlis(userId: string): Promise<Kundli[]>;
  getKundliById(id: string): Promise<Kundli | undefined>;

  // Astrologer operations
  createAstrologer(astrologer: InsertAstrologer): Promise<Astrologer>;
  getAllAstrologers(): Promise<Astrologer[]>;
  getAstrologerById(id: string): Promise<Astrologer | undefined>;

  // Pattern Matcher / Feedback operations
  createPredictionFeedback(feedback: InsertPredictionFeedback): Promise<PredictionFeedback>;
  getPredictionFeedbacksByUser(userId: string): Promise<PredictionFeedback[]>;
  getPatternStatistics(): Promise<any>;
  getAstrologerByEmail(email: string): Promise<Astrologer | undefined>;
  updateAstrologer(id: string, data: Partial<InsertAstrologer>): Promise<Astrologer>;
  updateAstrologerOnlineStatus(id: string, isOnline: boolean): Promise<void>;

  // Wallet operations
  getWallet(userId: string): Promise<Wallet | undefined>;
  createWallet(userId: string): Promise<Wallet>;
  updateWalletBalance(userId: string, amount: string): Promise<Wallet>;
  hasFreeAccess(userId: string): Promise<boolean>;

  // Transaction operations
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  getUserTransactions(userId: string): Promise<Transaction[]>;
  updateTransactionStatus(id: string, status: string, gatewayPaymentId?: string, gatewaySignature?: string): Promise<Transaction>;

  // Chat operations
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getChatMessages(userId: string, astrologerId: string): Promise<ChatMessage[]>;

  // Consultation operations
  createConsultation(data: InsertConsultation): Promise<Consultation>;
  getConsultationById(id: string): Promise<Consultation | undefined>;
  getActiveConsultation(userId: string, astrologerId: string): Promise<Consultation | undefined>;
  getUserConsultations(userId: string): Promise<Consultation[]>;
  getAstrologerConsultations(astrologerId: string): Promise<Consultation[]>;
  endConsultation(id: string): Promise<Consultation>;
  updateConsultationDuration(id: string, durationSeconds: number, totalAmount: string): Promise<Consultation>;

  // Review operations
  createReview(review: InsertReview): Promise<Review>;
  getAstrologerReviews(astrologerId: string): Promise<(Review & { userName?: string })[]>;
  getUserReviewForConsultation(userId: string, consultationId: string): Promise<Review | undefined>;



  // Schedule operations
  createScheduledCall(data: InsertScheduledCall): Promise<ScheduledCall>;
  getUserScheduledCalls(userId: string): Promise<ScheduledCall[]>;
  getAstrologerScheduledCalls(astrologerId: string): Promise<ScheduledCall[]>;
  updateScheduledCallStatus(id: string, status: string): Promise<ScheduledCall>;

  // Notification operations
  createNotification(data: {
    userId: string;
    recipientType?: string;
    type: string;
    title: string;
    body: string;
    data?: object;
  }): Promise<Notification>;
  getUserNotifications(userId: string): Promise<Notification[]>;
  markNotificationRead(id: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;

  // Astrologer earnings
  createEarning(data: {
    astrologerId: string;
    consultationId?: string;
    grossAmount: string;
    platformFee: string;
    netAmount: string;
  }): Promise<AstrologerEarning>;
  getAstrologerEarnings(astrologerId: string): Promise<AstrologerEarning[]>;
  getAstrologerTotalEarnings(astrologerId: string): Promise<{ total: number; pending: number }>;

  // Payout operations
  createPayoutRequest(astrologerId: string, amount: string, method: string): Promise<PayoutRequest>;
  getAstrologerPayouts(astrologerId: string): Promise<PayoutRequest[]>;

  // AI Chat operations
  saveAiChatMessage(data: InsertAiChatMessage): Promise<AiChatMessage>;
  getAiChatHistory(userId: string, sessionId: string): Promise<AiChatMessage[]>;
  getAiChatSessions(userId: string): Promise<{ sessionId: string; createdAt: Date | null; preview: string }[]>;
}

export class DatabaseStorage implements IStorage {
  // ─── User operations ───────────────────────────────────────

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: { ...userData, updatedAt: new Date() },
      })
      .returning();
    return user;
  }

  async updateUser(id: string, data: Partial<UpsertUser>): Promise<User> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // ─── Kundli operations ─────────────────────────────────────

  async createKundli(kundliData: InsertKundli): Promise<Kundli> {
    const [kundli] = await db.insert(kundlis).values(kundliData).returning();
    return kundli;
  }

  async getUserKundlis(userId: string): Promise<Kundli[]> {
    return await db
      .select()
      .from(kundlis)
      .where(eq(kundlis.userId, userId))
      .orderBy(desc(kundlis.createdAt));
  }

  async getKundliById(id: string): Promise<Kundli | undefined> {
    const [kundli] = await db.select().from(kundlis).where(eq(kundlis.id, id));
    return kundli;
  }

  // ─── Astrologer operations ─────────────────────────────────

  async createAstrologer(data: InsertAstrologer): Promise<Astrologer> {
    const [astrologer] = await db.insert(astrologers).values(data).returning();
    return astrologer;
  }

  async getAllAstrologers(): Promise<Astrologer[]> {
    return await db
      .select()
      .from(astrologers)
      .orderBy(desc(astrologers.rating));
  }

  async getAstrologerById(id: string): Promise<Astrologer | undefined> {
    const [astrologer] = await db
      .select()
      .from(astrologers)
      .where(eq(astrologers.id, id));
    return astrologer;
  }

  async getAstrologerByEmail(email: string): Promise<Astrologer | undefined> {
    const [astrologer] = await db
      .select()
      .from(astrologers)
      .where(eq(astrologers.email, email));
    return astrologer;
  }

  async updateAstrologer(id: string, data: Partial<InsertAstrologer>): Promise<Astrologer> {
    const [astrologer] = await db
      .update(astrologers)
      .set(data)
      .where(eq(astrologers.id, id))
      .returning();
    return astrologer;
  }

  async updateAstrologerOnlineStatus(id: string, isOnline: boolean): Promise<void> {
    await db
      .update(astrologers)
      .set({
        isOnline,
        availability: isOnline ? "online" : "offline",
        lastSeenAt: new Date(),
      })
      .where(eq(astrologers.id, id));
  }

  // ─── Wallet operations ─────────────────────────────────────

  async getWallet(userId: string): Promise<Wallet | undefined> {
    const [wallet] = await db
      .select()
      .from(wallets)
      .where(eq(wallets.userId, userId));
    return wallet;
  }

  async createWallet(userId: string): Promise<Wallet> {
    const [wallet] = await db
      .insert(wallets)
      .values({ userId, balance: "0" })
      .returning();
    return wallet;
  }

  async updateWalletBalance(userId: string, amount: string): Promise<Wallet> {
    const [wallet] = await db
      .update(wallets)
      .set({ balance: amount, updatedAt: new Date() })
      .where(eq(wallets.userId, userId))
      .returning();
    return wallet;
  }

  // ─── Transaction operations ────────────────────────────────

  async createTransaction(data: InsertTransaction): Promise<Transaction> {
    const [transaction] = await db
      .insert(transactions)
      .values(data)
      .returning();
    return transaction;
  }

  async getUserTransactions(userId: string): Promise<Transaction[]> {
    return await db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt));
  }

  async hasCompletedRecharge(userId: string): Promise<boolean> {
    const rows = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "recharge"),
          eq(transactions.status, "completed"),
        ),
      )
      .limit(1);
    return rows.length > 0;
  }

  async updateTransactionStatus(
    id: string,
    status: string,
    gatewayPaymentId?: string,
    gatewaySignature?: string
  ): Promise<Transaction> {
    const [transaction] = await db
      .update(transactions)
      .set({
        status,
        ...(gatewayPaymentId ? { gatewayPaymentId } : {}),
        ...(gatewaySignature ? { gatewaySignature } : {}),
      })
      .where(eq(transactions.id, id))
      .returning();
    return transaction;
  }

  // ─── Chat operations ───────────────────────────────────────

  async createChatMessage(data: InsertChatMessage): Promise<ChatMessage> {
    const [message] = await db
      .insert(chatMessages)
      .values(data)
      .returning();
    return message;
  }

  async getChatMessages(userId: string, astrologerId: string): Promise<ChatMessage[]> {
    return await db
      .select()
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.userId, userId),
          eq(chatMessages.astrologerId, astrologerId)
        )
      )
      .orderBy(chatMessages.createdAt);
  }

  // ─── Consultation operations ───────────────────────────────

  async createConsultation(data: InsertConsultation): Promise<Consultation> {
    const [consultation] = await db
      .insert(consultations)
      .values(data)
      .returning();
    return consultation;
  }

  async getConsultationById(id: string): Promise<Consultation | undefined> {
    const [consultation] = await db
      .select()
      .from(consultations)
      .where(eq(consultations.id, id));
    return consultation;
  }

  async getActiveConsultation(
    userId: string,
    astrologerId: string
  ): Promise<Consultation | undefined> {
    const [consultation] = await db
      .select()
      .from(consultations)
      .where(
        and(
          eq(consultations.userId, userId),
          eq(consultations.astrologerId, astrologerId),
          eq(consultations.status, "active")
        )
      );
    return consultation;
  }

  async getUserConsultations(userId: string): Promise<Consultation[]> {
    return await db
      .select()
      .from(consultations)
      .where(eq(consultations.userId, userId))
      .orderBy(desc(consultations.createdAt));
  }

  async getAstrologerConsultations(astrologerId: string): Promise<Consultation[]> {
    return await db
      .select()
      .from(consultations)
      .where(eq(consultations.astrologerId, astrologerId))
      .orderBy(desc(consultations.createdAt));
  }

  async endConsultation(id: string): Promise<Consultation> {
    const [consultation] = await db
      .select()
      .from(consultations)
      .where(eq(consultations.id, id));

    const durationSeconds = consultation?.startedAt
      ? Math.floor((Date.now() - new Date(consultation.startedAt).getTime()) / 1000)
      : 0;

    const pricePerMin = parseFloat(consultation?.pricePerMinute || "0");
    const totalAmount = ((durationSeconds / 60) * pricePerMin).toFixed(2);

    const [updated] = await db
      .update(consultations)
      .set({
        status: "ended",
        endedAt: new Date(),
        durationSeconds,
        totalAmount,
      })
      .where(eq(consultations.id, id))
      .returning();
    return updated;
  }

  async updateConsultationDuration(
    id: string,
    durationSeconds: number,
    totalAmount: string
  ): Promise<Consultation> {
    const [updated] = await db
      .update(consultations)
      .set({ durationSeconds, totalAmount })
      .where(eq(consultations.id, id))
      .returning();
    return updated;
  }

  // ─── Review operations ─────────────────────────────────────

  async createReview(data: InsertReview): Promise<Review> {
    const [review] = await db.insert(reviews).values(data).returning();

    // Update astrologer's average rating
    const allReviews = await db
      .select()
      .from(reviews)
      .where(eq(reviews.astrologerId, data.astrologerId));
    const avg = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;

    await db
      .update(astrologers)
      .set({
        rating: avg.toFixed(2),
        totalConsultations: sql`${astrologers.totalConsultations} + 1`,
      })
      .where(eq(astrologers.id, data.astrologerId));

    return review;
  }

  async getAstrologerReviews(
    astrologerId: string
  ): Promise<(Review & { userName?: string })[]> {
    const result = await db
      .select({
        id: reviews.id,
        userId: reviews.userId,
        astrologerId: reviews.astrologerId,
        consultationId: reviews.consultationId,
        rating: reviews.rating,
        comment: reviews.comment,
        isPublic: reviews.isPublic,
        createdAt: reviews.createdAt,
        userName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
      })
      .from(reviews)
      .leftJoin(users, eq(reviews.userId, users.id))
      .where(and(eq(reviews.astrologerId, astrologerId), eq(reviews.isPublic, true)))
      .orderBy(desc(reviews.createdAt));
    return result;
  }

  async getUserReviewForConsultation(
    userId: string,
    consultationId: string
  ): Promise<Review | undefined> {
    const [review] = await db
      .select()
      .from(reviews)
      .where(
        and(eq(reviews.userId, userId), eq(reviews.consultationId, consultationId))
      );
    return review;
  }

  // ─── Schedule operations ───────────────────────────────────

  async createScheduledCall(data: InsertScheduledCall): Promise<ScheduledCall> {
    const [call] = await db.insert(scheduledCalls).values(data).returning();
    return call;
  }

  async getUserScheduledCalls(userId: string): Promise<ScheduledCall[]> {
    return await db
      .select()
      .from(scheduledCalls)
      .where(eq(scheduledCalls.userId, userId))
      .orderBy(scheduledCalls.scheduledAt);
  }

  async getAstrologerScheduledCalls(astrologerId: string): Promise<ScheduledCall[]> {
    return await db
      .select()
      .from(scheduledCalls)
      .where(eq(scheduledCalls.astrologerId, astrologerId))
      .orderBy(scheduledCalls.scheduledAt);
  }

  async updateScheduledCallStatus(id: string, status: string): Promise<ScheduledCall> {
    const [call] = await db
      .update(scheduledCalls)
      .set({ status })
      .where(eq(scheduledCalls.id, id))
      .returning();
    return call;
  }

  // ─── Notification operations ───────────────────────────────

  async createNotification(data: {
    userId: string;
    recipientType?: string;
    type: string;
    title: string;
    body: string;
    data?: object;
  }): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values({
        userId: data.userId,
        recipientType: data.recipientType || "user",
        type: data.type,
        title: data.title,
        body: data.body,
        data: data.data || null,
      })
      .returning();
    return notification;
  }

  async getUserNotifications(userId: string): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }

  async markNotificationRead(id: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  // ─── Astrologer earnings ───────────────────────────────────

  async createEarning(data: {
    astrologerId: string;
    consultationId?: string;
    grossAmount: string;
    platformFee: string;
    netAmount: string;
  }): Promise<AstrologerEarning> {
    const [earning] = await db
      .insert(astrologerEarnings)
      .values(data)
      .returning();

    // Update astrologer's total and pending earnings
    await db
      .update(astrologers)
      .set({
        totalEarnings: sql`${astrologers.totalEarnings} + ${data.netAmount}`,
        pendingPayout: sql`${astrologers.pendingPayout} + ${data.netAmount}`,
      })
      .where(eq(astrologers.id, data.astrologerId));

    return earning;
  }

  async getAstrologerEarnings(astrologerId: string): Promise<AstrologerEarning[]> {
    return await db
      .select()
      .from(astrologerEarnings)
      .where(eq(astrologerEarnings.astrologerId, astrologerId))
      .orderBy(desc(astrologerEarnings.createdAt));
  }

  async getAstrologerTotalEarnings(
    astrologerId: string
  ): Promise<{ total: number; pending: number }> {
    const [astrologer] = await db
      .select({ totalEarnings: astrologers.totalEarnings, pendingPayout: astrologers.pendingPayout })
      .from(astrologers)
      .where(eq(astrologers.id, astrologerId));
    return {
      total: parseFloat(astrologer?.totalEarnings || "0"),
      pending: parseFloat(astrologer?.pendingPayout || "0"),
    };
  }

  // ─── Payout operations ─────────────────────────────────────

  async createPayoutRequest(
    astrologerId: string,
    amount: string,
    method: string
  ): Promise<PayoutRequest> {
    const [payout] = await db
      .insert(payoutRequests)
      .values({ astrologerId, amount, method })
      .returning();
    return payout;
  }

  async getAstrologerPayouts(astrologerId: string): Promise<PayoutRequest[]> {
    return await db
      .select()
      .from(payoutRequests)
      .where(eq(payoutRequests.astrologerId, astrologerId))
      .orderBy(desc(payoutRequests.createdAt));
  }

  // ─── Astrologer Auth (password-based for astrologers) ─────

  async createAstrologerWithPassword(data: {
    name: string;
    email: string;
    password: string;
    phoneNumber?: string;
  }): Promise<Astrologer> {
    const passwordHash = crypto
      .createHash("sha256")
      .update(data.password)
      .digest("hex");
    const [astrologer] = await db
      .insert(astrologers)
      .values({
        name: data.name,
        email: data.email,
        passwordHash,
        phoneNumber: data.phoneNumber,
        availability: "offline",
        isVerified: false,
      })
      .returning();
    return astrologer;
  }

  async verifyAstrologerPassword(email: string, password: string): Promise<Astrologer | null> {
    const astrologer = await this.getAstrologerByEmail(email);
    if (!astrologer || !astrologer.passwordHash) return null;
    const hash = crypto.createHash("sha256").update(password).digest("hex");
    return hash === astrologer.passwordHash ? astrologer : null;
  }

  // ─── User email auth ───────────────────────────────────────

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUserWithPassword(data: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  }): Promise<User> {
    const passwordHash = await bcrypt.hash(data.password, 12);
    const [user] = await db
      .insert(users)
      .values({
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        passwordHash,
        authProvider: "email",
      })
      .returning();
    return user;
  }

  async verifyUserPassword(email: string, password: string): Promise<User | null> {
    const user = await this.getUserByEmail(email);
    if (!user || !user.passwordHash) return null;
    const valid = await bcrypt.compare(password, user.passwordHash);
    return valid ? user : null;
  }

  // ─── AI Chat operations ────────────────────────────────────

  async saveAiChatMessage(data: InsertAiChatMessage): Promise<AiChatMessage> {
    const [msg] = await db.insert(aiChatMessages).values(data).returning();
    return msg;
  }

  async getAiChatHistory(userId: string, sessionId: string): Promise<AiChatMessage[]> {
    return await db
      .select()
      .from(aiChatMessages)
      .where(and(eq(aiChatMessages.userId, userId), eq(aiChatMessages.sessionId, sessionId)))
      .orderBy(aiChatMessages.createdAt);
  }

  async getAiChatSessions(
    userId: string
  ): Promise<{ sessionId: string; createdAt: Date | null; preview: string }[]> {
    // Return the latest message from each session as a preview
    const rows = await db
      .select()
      .from(aiChatMessages)
      .where(eq(aiChatMessages.userId, userId))
      .orderBy(desc(aiChatMessages.createdAt));

    const seen = new Set<string>();
    const sessions: { sessionId: string; createdAt: Date | null; preview: string }[] = [];
    for (const row of rows) {
      if (!seen.has(row.sessionId)) {
        seen.add(row.sessionId);
        sessions.push({
          sessionId: row.sessionId,
          createdAt: row.createdAt,
          preview: row.content.slice(0, 80),
        });
      }
    }
    return sessions;
  }

  // ─── Pattern Matcher & Bayesian Feedback ───────────────────────────

  async createPredictionFeedback(feedback: InsertPredictionFeedback): Promise<PredictionFeedback> {
    const [row] = await db.insert(predictionFeedbacks).values(feedback).returning();
    return row;
  }

  async getPredictionFeedbacksByUser(userId: string): Promise<PredictionFeedback[]> {
    return await db.select().from(predictionFeedbacks).where(eq(predictionFeedbacks.userId, userId));
  }

  async getPatternStatistics(): Promise<any> {
    // Collect aggregates directly to determine algorithm confidence intervals
    const all = await db.select().from(predictionFeedbacks);
    
    let total = all.length;
    if (total === 0) return { total: 0, accuracy: 0, dashaStats: {} };

    let accurate = 0;
    const dashaStats: Record<string, { total: number; accurate: number }> = {};

    for (const p of all) {
      if (p.wasAccurate) accurate++;
      if (!dashaStats[p.dashaSystemUsed]) {
        dashaStats[p.dashaSystemUsed] = { total: 0, accurate: 0 };
      }
      dashaStats[p.dashaSystemUsed].total++;
      if (p.wasAccurate) dashaStats[p.dashaSystemUsed].accurate++;
    }

    // Format output
    for (const sys in dashaStats) {
      (dashaStats[sys] as any).percentage = 
        Math.round((dashaStats[sys].accurate / dashaStats[sys].total) * 100);
    }

    return {
      total,
      accuracy: Math.round((accurate / total) * 100),
      dashaStats
    };
  }

  // ─── Coupons / Offers ──────────────────────────────────────
  async getActiveCoupons(walletOnly = false): Promise<Coupon[]> {
    const now = new Date();
    const rows = await db.select().from(coupons).where(eq(coupons.isActive, true));
    return rows.filter((c) => {
      if (walletOnly && !c.showOnWallet) return false;
      if (c.validFrom && new Date(c.validFrom) > now) return false;
      if (c.validUntil && new Date(c.validUntil) < now) return false;
      if (c.usageLimit != null && (c.timesUsed ?? 0) >= c.usageLimit) return false;
      return true;
    });
  }

  async getAllCoupons(): Promise<Coupon[]> {
    return await db.select().from(coupons).orderBy(desc(coupons.createdAt));
  }

  async getCouponByCode(code: string): Promise<Coupon | undefined> {
    const [row] = await db
      .select()
      .from(coupons)
      .where(sql`upper(${coupons.code}) = upper(${code})`);
    return row;
  }

  async createCoupon(data: InsertCoupon): Promise<Coupon> {
    const [row] = await db.insert(coupons).values(data as any).returning();
    return row;
  }

  async updateCoupon(id: string, data: Partial<InsertCoupon>): Promise<Coupon> {
    const [row] = await db.update(coupons).set(data as any).where(eq(coupons.id, id)).returning();
    return row;
  }

  async deleteCoupon(id: string): Promise<void> {
    await db.delete(coupons).where(eq(coupons.id, id));
  }

  // Count only redemptions tied to a COMPLETED recharge, so abandoned
  // payment attempts don't consume a user's offer eligibility.
  async getUserCouponRedemptionCount(userId: string, couponId: string): Promise<number> {
    const rows = await db
      .select({ id: couponRedemptions.id })
      .from(couponRedemptions)
      .innerJoin(transactions, eq(transactions.id, couponRedemptions.transactionId))
      .where(
        and(
          eq(couponRedemptions.userId, userId),
          eq(couponRedemptions.couponId, couponId),
          eq(transactions.status, "completed"),
        ),
      );
    return rows.length;
  }

  async recordCouponRedemption(data: {
    couponId: string;
    userId: string;
    transactionId?: string;
    discountAmount: string;
  }): Promise<CouponRedemption> {
    const [row] = await db.insert(couponRedemptions).values(data).returning();
    return row;
  }

  // Increment the global usage counter once a recharge actually completes.
  async incrementCouponUsage(couponId: string): Promise<void> {
    await db
      .update(coupons)
      .set({ timesUsed: sql`coalesce(${coupons.timesUsed}, 0) + 1` })
      .where(eq(coupons.id, couponId));
  }

  // ─── Referrals ─────────────────────────────────────────────
  async getOrCreateReferralCode(userId: string): Promise<string> {
    const user = await this.getUser(userId);
    if (user?.referralCode) return user.referralCode;
    // Generate a short, human-friendly unique code
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = `NG${crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 6)}`;
      const existing = await db.select().from(users).where(eq(users.referralCode, code));
      if (existing.length === 0) {
        await db.update(users).set({ referralCode: code }).where(eq(users.id, userId));
        return code;
      }
    }
    throw new Error("Could not generate a unique referral code");
  }

  async getUserByReferralCode(code: string): Promise<User | undefined> {
    const [row] = await db
      .select()
      .from(users)
      .where(sql`upper(${users.referralCode}) = upper(${code})`);
    return row;
  }

  async getReferralByReferee(refereeId: string): Promise<Referral | undefined> {
    const [row] = await db.select().from(referrals).where(eq(referrals.refereeId, refereeId));
    return row;
  }

  async createReferral(data: {
    referrerId: string;
    refereeId: string;
  }): Promise<Referral> {
    const [row] = await db.insert(referrals).values(data).returning();
    return row;
  }

  async getReferralsByReferrer(referrerId: string): Promise<Referral[]> {
    return await db
      .select()
      .from(referrals)
      .where(eq(referrals.referrerId, referrerId))
      .orderBy(desc(referrals.createdAt));
  }

  async markReferralRewarded(
    id: string,
    referrerReward: string,
    refereeReward: string,
  ): Promise<Referral> {
    const [row] = await db
      .update(referrals)
      .set({ status: "rewarded", referrerReward, refereeReward, rewardedAt: new Date() })
      .where(eq(referrals.id, id))
      .returning();
    return row;
  }

  // ─── Push notification tokens ──────────────────────────────
  async savePushToken(data: {
    ownerId: string;
    ownerType: string;
    token: string;
    platform?: string;
  }): Promise<PushToken> {
    const [row] = await db
      .insert(pushTokens)
      .values(data)
      .onConflictDoUpdate({
        target: pushTokens.token,
        set: {
          ownerId: data.ownerId,
          ownerType: data.ownerType,
          platform: data.platform || "web",
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }

  async getPushTokens(ownerId: string, ownerType: string): Promise<PushToken[]> {
    return await db
      .select()
      .from(pushTokens)
      .where(and(eq(pushTokens.ownerId, ownerId), eq(pushTokens.ownerType, ownerType)));
  }

  async deletePushToken(token: string): Promise<void> {
    await db.delete(pushTokens).where(eq(pushTokens.token, token));
  }

  // ─── Wallet helper ─────────────────────────────────────────
  // Atomically debit the wallet; returns null when balance is insufficient.
  // Admin accounts get free access to all paid features (for testing): record
  // a zero-cost transaction for traceability but never decrement the balance.
  async hasFreeAccess(userId: string): Promise<boolean> {
    const user = await this.getUser(userId);
    return isAdminEmail(user?.email);
  }

  async debitWallet(userId: string, cost: number, description: string): Promise<{ balance: string } | null> {
    let wallet = await this.getWallet(userId);
    if (!wallet) wallet = await this.createWallet(userId);

    if (await this.hasFreeAccess(userId)) {
      await this.createTransaction({
        userId,
        amount: "0",
        type: "debit",
        description: `${description} (free access)`,
        status: "completed",
      });
      return { balance: wallet.balance || "0" };
    }

    const balance = parseFloat(wallet.balance || "0");
    if (balance < cost) return null;
    const newBalance = (balance - cost).toFixed(2);
    await this.updateWalletBalance(userId, newBalance);
    await this.createTransaction({
      userId,
      amount: (-cost).toString(),
      type: "debit",
      description,
      status: "completed",
    });
    return { balance: newBalance };
  }

  // ─── Astromall ─────────────────────────────────────────────
  async getProducts(): Promise<Product[]> {
    return await db
      .select()
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(asc(products.sortOrder), desc(products.createdAt));
  }

  async getAllProducts(): Promise<Product[]> {
    return await db.select().from(products).orderBy(asc(products.sortOrder));
  }

  async getProductBySlug(slug: string): Promise<Product | undefined> {
    const [row] = await db.select().from(products).where(eq(products.slug, slug));
    return row;
  }

  async getProductById(id: string): Promise<Product | undefined> {
    const [row] = await db.select().from(products).where(eq(products.id, id));
    return row;
  }

  async createProduct(data: InsertProduct): Promise<Product> {
    const [row] = await db.insert(products).values(data as any).returning();
    return row;
  }

  async updateProduct(id: string, data: Partial<InsertProduct>): Promise<Product> {
    const [row] = await db.update(products).set(data as any).where(eq(products.id, id)).returning();
    return row;
  }

  async deleteProduct(id: string): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  async createOrder(
    order: {
      userId: string;
      totalAmount: string;
      paymentMethod?: string;
      shippingName?: string;
      shippingPhone?: string;
      shippingAddress?: string;
      shippingCity?: string;
      shippingState?: string;
      shippingPincode?: string;
    },
    items: { productId: string; productName: string; quantity: number; price: string }[],
  ): Promise<Order> {
    const [created] = await db.insert(orders).values(order).returning();
    if (items.length > 0) {
      await db.insert(orderItems).values(items.map((i) => ({ ...i, orderId: created.id })));
    }
    return created;
  }

  async getUserOrders(userId: string): Promise<(Order & { items: OrderItem[] })[]> {
    const userOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));
    const result = [];
    for (const o of userOrders) {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
      result.push({ ...o, items });
    }
    return result;
  }

  async updateOrderStatus(id: string, status: string): Promise<Order> {
    const [row] = await db.update(orders).set({ status }).where(eq(orders.id, id)).returning();
    return row;
  }

  // ─── Reports ───────────────────────────────────────────────
  async getReportTypes(): Promise<ReportType[]> {
    return await db
      .select()
      .from(reportTypes)
      .where(eq(reportTypes.isActive, true))
      .orderBy(asc(reportTypes.sortOrder));
  }

  async getReportTypeById(id: string): Promise<ReportType | undefined> {
    const [row] = await db.select().from(reportTypes).where(eq(reportTypes.id, id));
    return row;
  }

  async createReportOrder(data: {
    userId: string;
    reportTypeId: string;
    kundliId?: string;
    amount: string;
  }): Promise<ReportOrder> {
    const [row] = await db.insert(reportOrders).values(data).returning();
    return row;
  }

  async setReportOrderContent(id: string, content: object): Promise<ReportOrder> {
    const [row] = await db
      .update(reportOrders)
      .set({ content, status: "ready", readyAt: new Date() })
      .where(eq(reportOrders.id, id))
      .returning();
    return row;
  }

  async markReportOrderFailed(id: string): Promise<void> {
    await db.update(reportOrders).set({ status: "failed" }).where(eq(reportOrders.id, id));
  }

  async getUserReportOrders(userId: string): Promise<ReportOrder[]> {
    return await db
      .select()
      .from(reportOrders)
      .where(eq(reportOrders.userId, userId))
      .orderBy(desc(reportOrders.createdAt));
  }

  async getReportOrderById(id: string): Promise<ReportOrder | undefined> {
    const [row] = await db.select().from(reportOrders).where(eq(reportOrders.id, id));
    return row;
  }

  // ─── Poojas ────────────────────────────────────────────────
  async getPoojas(): Promise<Pooja[]> {
    return await db
      .select()
      .from(poojas)
      .where(eq(poojas.isActive, true))
      .orderBy(asc(poojas.sortOrder));
  }

  async getPoojaById(id: string): Promise<Pooja | undefined> {
    const [row] = await db.select().from(poojas).where(eq(poojas.id, id));
    return row;
  }

  async createPoojaBooking(data: {
    userId: string;
    poojaId: string;
    poojaName: string;
    amount: string;
    devoteeName: string;
    gotra?: string;
    preferredDate?: Date | null;
    sankalpNotes?: string;
  }): Promise<PoojaBooking> {
    const [row] = await db.insert(poojaBookings).values(data).returning();
    return row;
  }

  async getUserPoojaBookings(userId: string): Promise<PoojaBooking[]> {
    return await db
      .select()
      .from(poojaBookings)
      .where(eq(poojaBookings.userId, userId))
      .orderBy(desc(poojaBookings.createdAt));
  }

  // ─── Live streaming ────────────────────────────────────────
  async createLiveStream(data: { astrologerId: string; title: string; agoraChannel: string }): Promise<LiveStream> {
    const [row] = await db.insert(liveStreams).values(data).returning();
    return row;
  }

  async getActiveLiveStreams(): Promise<(LiveStream & { astrologerName?: string; astrologerImage?: string; specializations?: string[] | null })[]> {
    const rows = await db
      .select({
        stream: liveStreams,
        astrologerName: astrologers.name,
        astrologerImage: astrologers.profileImageUrl,
        specializations: astrologers.specializations,
      })
      .from(liveStreams)
      .innerJoin(astrologers, eq(astrologers.id, liveStreams.astrologerId))
      .where(eq(liveStreams.status, "live"))
      .orderBy(desc(liveStreams.viewerCount));
    return rows.map((r) => ({
      ...r.stream,
      astrologerName: r.astrologerName ?? undefined,
      astrologerImage: r.astrologerImage ?? undefined,
      specializations: r.specializations,
    }));
  }

  async getLiveStreamById(id: string): Promise<LiveStream | undefined> {
    const [row] = await db.select().from(liveStreams).where(eq(liveStreams.id, id));
    return row;
  }

  async getActiveLiveStreamByAstrologer(astrologerId: string): Promise<LiveStream | undefined> {
    const [row] = await db
      .select()
      .from(liveStreams)
      .where(and(eq(liveStreams.astrologerId, astrologerId), eq(liveStreams.status, "live")));
    return row;
  }

  async endLiveStream(id: string): Promise<LiveStream> {
    const [row] = await db
      .update(liveStreams)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(liveStreams.id, id))
      .returning();
    return row;
  }

  async incrementStreamViewers(id: string): Promise<LiveStream> {
    const [row] = await db
      .update(liveStreams)
      .set({
        viewerCount: sql`coalesce(${liveStreams.viewerCount}, 0) + 1`,
        peakViewers: sql`greatest(coalesce(${liveStreams.peakViewers}, 0), coalesce(${liveStreams.viewerCount}, 0) + 1)`,
      })
      .where(eq(liveStreams.id, id))
      .returning();
    return row;
  }

  async decrementStreamViewers(id: string): Promise<void> {
    await db
      .update(liveStreams)
      .set({ viewerCount: sql`greatest(0, coalesce(${liveStreams.viewerCount}, 0) - 1)` })
      .where(eq(liveStreams.id, id));
  }

  async addStreamGiftTotal(id: string, amount: number): Promise<void> {
    await db
      .update(liveStreams)
      .set({ totalGifts: sql`coalesce(${liveStreams.totalGifts}, 0) + ${amount}` })
      .where(eq(liveStreams.id, id));
  }

  async createStreamMessage(data: {
    streamId: string;
    senderId: string;
    senderType: string;
    senderName: string;
    type: string;
    message?: string;
    giftName?: string;
    giftAmount?: string;
  }): Promise<StreamMessage> {
    const [row] = await db.insert(streamMessages).values(data).returning();
    return row;
  }

  async getStreamMessages(streamId: string, limit = 80): Promise<StreamMessage[]> {
    const rows = await db
      .select()
      .from(streamMessages)
      .where(eq(streamMessages.streamId, streamId))
      .orderBy(desc(streamMessages.createdAt))
      .limit(limit);
    return rows.reverse();
  }

  // ─── Follow / favourite astrologers ────────────────────────
  async followAstrologer(userId: string, astrologerId: string): Promise<void> {
    await db
      .insert(astrologerFollows)
      .values({ userId, astrologerId })
      .onConflictDoNothing();
  }

  async unfollowAstrologer(userId: string, astrologerId: string): Promise<void> {
    await db
      .delete(astrologerFollows)
      .where(and(eq(astrologerFollows.userId, userId), eq(astrologerFollows.astrologerId, astrologerId)));
  }

  async isFollowing(userId: string, astrologerId: string): Promise<boolean> {
    const rows = await db
      .select({ id: astrologerFollows.id })
      .from(astrologerFollows)
      .where(and(eq(astrologerFollows.userId, userId), eq(astrologerFollows.astrologerId, astrologerId)))
      .limit(1);
    return rows.length > 0;
  }

  async getFollowedAstrologerIds(userId: string): Promise<string[]> {
    const rows = await db
      .select({ astrologerId: astrologerFollows.astrologerId })
      .from(astrologerFollows)
      .where(eq(astrologerFollows.userId, userId));
    return rows.map((r) => r.astrologerId);
  }

  async getFollowerUserIds(astrologerId: string): Promise<string[]> {
    const rows = await db
      .select({ userId: astrologerFollows.userId })
      .from(astrologerFollows)
      .where(eq(astrologerFollows.astrologerId, astrologerId));
    return rows.map((r) => r.userId);
  }

  // ─── Consultation waitlist ─────────────────────────────────
  async joinQueue(userId: string, astrologerId: string, type: string): Promise<ConsultationQueueEntry> {
    // Remove any prior waiting entry for the same pair, then add fresh
    await db
      .delete(consultationQueue)
      .where(and(
        eq(consultationQueue.userId, userId),
        eq(consultationQueue.astrologerId, astrologerId),
        eq(consultationQueue.status, "waiting"),
      ));
    const [row] = await db.insert(consultationQueue).values({ userId, astrologerId, type }).returning();
    return row;
  }

  async leaveQueue(userId: string, astrologerId: string): Promise<void> {
    await db
      .delete(consultationQueue)
      .where(and(eq(consultationQueue.userId, userId), eq(consultationQueue.astrologerId, astrologerId)));
  }

  async getQueuePosition(userId: string, astrologerId: string): Promise<number | null> {
    const waiting = await db
      .select()
      .from(consultationQueue)
      .where(and(eq(consultationQueue.astrologerId, astrologerId), eq(consultationQueue.status, "waiting")))
      .orderBy(asc(consultationQueue.createdAt));
    const idx = waiting.findIndex((e) => e.userId === userId);
    return idx === -1 ? null : idx + 1;
  }

  async getWaitingQueue(astrologerId: string): Promise<ConsultationQueueEntry[]> {
    return await db
      .select()
      .from(consultationQueue)
      .where(and(eq(consultationQueue.astrologerId, astrologerId), eq(consultationQueue.status, "waiting")))
      .orderBy(asc(consultationQueue.createdAt));
  }

  async markQueueNotified(astrologerId: string): Promise<void> {
    await db
      .update(consultationQueue)
      .set({ status: "notified" })
      .where(and(eq(consultationQueue.astrologerId, astrologerId), eq(consultationQueue.status, "waiting")));
  }

  // ─── Admin fulfilment ──────────────────────────────────────
  async getAllOrders(): Promise<(Order & { items: OrderItem[] })[]> {
    const all = await db.select().from(orders).orderBy(desc(orders.createdAt));
    const result = [];
    for (const o of all) {
      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, o.id));
      result.push({ ...o, items });
    }
    return result;
  }

  async getAllPoojaBookings(): Promise<PoojaBooking[]> {
    return await db.select().from(poojaBookings).orderBy(desc(poojaBookings.createdAt));
  }

  async updatePoojaBookingStatus(id: string, status: string): Promise<PoojaBooking> {
    const [row] = await db.update(poojaBookings).set({ status }).where(eq(poojaBookings.id, id)).returning();
    return row;
  }

  // ─── Astrologer KYC ────────────────────────────────────────
  async submitAstrologerKyc(astrologerId: string, data: {
    panNumber?: string;
    aadhaarLast4?: string;
    bankAccountName?: string;
    bankAccountNumber?: string;
    bankIfsc?: string;
    upiId?: string;
  }): Promise<Astrologer> {
    const [row] = await db
      .update(astrologers)
      .set({ ...data, kycStatus: "pending", kycSubmittedAt: new Date() })
      .where(eq(astrologers.id, astrologerId))
      .returning();
    return row;
  }

  async getAstrologersByKycStatus(status: string): Promise<Astrologer[]> {
    return await db
      .select()
      .from(astrologers)
      .where(eq(astrologers.kycStatus, status))
      .orderBy(desc(astrologers.kycSubmittedAt));
  }

  async reviewAstrologerKyc(astrologerId: string, approve: boolean, notes?: string): Promise<Astrologer> {
    const [row] = await db
      .update(astrologers)
      .set({
        kycStatus: approve ? "approved" : "rejected",
        isVerified: approve,
        kycNotes: notes,
        kycReviewedAt: new Date(),
      })
      .where(eq(astrologers.id, astrologerId))
      .returning();
    return row;
  }
}


export const storage = new DatabaseStorage();

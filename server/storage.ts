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
  aiCompanies,
  aiEmployees,
  aiInitiatives,
  aiDirectives,
  type AiCompany,
  type AiEmployee,
  type AiInitiative,
  type AiDirective,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, sql } from "drizzle-orm";
import crypto from "crypto";
import bcrypt from "bcryptjs";

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

  // Corporate operations
  createAiCompany(company: any): Promise<AiCompany>;
  getAiCompanyByUserId(userId: string): Promise<AiCompany | undefined>;
  getAiCompanyById(id: number): Promise<AiCompany | undefined>;
  getAiEmployees(companyId: number): Promise<AiEmployee[]>;
  createAiEmployee(employee: any): Promise<AiEmployee>;
  updateAiEmployee(id: number, data: Partial<AiEmployee>): Promise<AiEmployee>;
  createAiInitiative(initiative: any): Promise<AiInitiative>;
  getAiInitiativesByCompany(companyId: number): Promise<AiInitiative[]>;
  createAiDirective(directive: any): Promise<AiDirective>;
  getAiDirectivesByInitiative(initiativeId: number): Promise<AiDirective[]>;
  getAiDirectivesByEmployee(employeeId: number): Promise<AiDirective[]>;


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
    consultationId: string;
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
    consultationId: string;
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

  // ── Navagraha Corporate Implementation ────────────────
  async createAiCompany(company: any): Promise<AiCompany> {
    const [row] = await db.insert(aiCompanies).values(company).returning();
    return row;
  }

  async getAiCompanyByUserId(userId: string): Promise<AiCompany | undefined> {
    const [row] = await db.select().from(aiCompanies).where(eq(aiCompanies.userId, userId));
    return row;
  }

  async getAiCompanyById(id: number): Promise<AiCompany | undefined> {
    const [row] = await db.select().from(aiCompanies).where(eq(aiCompanies.id, id));
    return row;
  }

  async getAiEmployees(companyId: number): Promise<AiEmployee[]> {
    return await db.select().from(aiEmployees).where(eq(aiEmployees.companyId, companyId));
  }

  async createAiEmployee(employee: any): Promise<AiEmployee> {
    const [row] = await db.insert(aiEmployees).values(employee).returning();
    return row;
  }

  async updateAiEmployee(id: number, data: Partial<AiEmployee>): Promise<AiEmployee> {
    const [row] = await db.update(aiEmployees).set(data).where(eq(aiEmployees.id, id)).returning();
    return row;
  }

  async createAiInitiative(initiative: any): Promise<AiInitiative> {
    const [row] = await db.insert(aiInitiatives).values(initiative).returning();
    return row;
  }

  async getAiInitiativesByCompany(companyId: number): Promise<AiInitiative[]> {
    return await db.select().from(aiInitiatives).where(eq(aiInitiatives.companyId, companyId));
  }

  async createAiDirective(directive: any): Promise<AiDirective> {
    const [row] = await db.insert(aiDirectives).values(directive).returning();
    return row;
  }

  async getAiDirectivesByInitiative(initiativeId: number): Promise<AiDirective[]> {
    return await db.select().from(aiDirectives).where(eq(aiDirectives.initiativeId, initiativeId));
  }

  async getAiDirectivesByEmployee(employeeId: number): Promise<AiDirective[]> {
    return await db.select().from(aiDirectives).where(eq(aiDirectives.assigneeId, employeeId));
  }
}


export const storage = new DatabaseStorage();

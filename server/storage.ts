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
  userMemories,
  coupons,
  couponRedemptions,
  referrals,
  pushTokens,
  products,
  orders,
  orderItems,
  reportTypes,
  reportOrders,
  dailyHoroscopes,
  poojas,
  poojaBookings,
  liveStreams,
  streamMessages,
  astrologerFollows,
  consultationQueue,
  jyotishClientProfiles,
  jyotishReadings,
  jyotishSessionQueries,
  askUsage,
  entitlements,
  emailVerificationTokens,
  aiUsageDaily,
  aiBudgetDaily,
  type AskUsage,
  type JyotishClientProfile,
  type InsertJyotishClientProfile,
  type JyotishReading,
  type InsertJyotishReading,
  type JyotishSessionQuery,
  type InsertJyotishSessionQuery,
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
  type DailyHoroscope,
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
  type UserMemory,
  type InsertAiChatMessage,
  predictionFeedbacks,
  type PredictionFeedback,
  type InsertPredictionFeedback,
} from "@shared/schema";
import { db, pool } from "./db";
import { eq, desc, and, sql, asc, inArray, type SQL } from "drizzle-orm";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { isAdminAccount, normalizeEmail } from "./adminAccess";
import { evaluateCoupon, packBonusFor, type GatewayPayment } from "./paymentService";

export interface PendingRechargeInput {
  userId: string;
  orderId: string;
  amountPaise: number;
  packBonus: number;
  coupon?: { id: string; code: string; bonus: number };
  quotedCredit: number;
  description: string;
}

// A reservation not settled within this long is treated as released (its request died).
export const ASK_RESERVATION_TTL_MS = 10 * 60 * 1000;
const ASK_RESERVATION_TTL_SQL = "10 minutes";

export interface AskReserveInput {
  userId: string;
  chartKey: string;
  sessionId: string;
  idempotencyKey: string;
  freeQuestions: number;
  freeFollowUps: number;
  /** Refuse when no allowance is left (otherwise the question is recorded as unmetered). */
  enforce: boolean;
  /** Admin accounts: recorded, never drawn from an allowance. */
  unlimited: boolean;
}

export type AskReservation =
  | { kind: "reserved"; usage: AskUsage }
  | { kind: "replay"; usage: AskUsage }
  | { kind: "in_flight" }
  | { kind: "exhausted" };

export interface EmailVerificationLimits { ttlS: number; minIntervalS: number; perDay: number }
export type EmailVerificationOutcome = "verified" | "already" | "expired" | "invalid" | "conflict";

export interface AskAllowanceCounts {
  freeQuestionsUsed: number;
  freeQuestionsRemaining: number;
  paidQuestionsRemaining: number;
  followUpsRemaining: number | null;
}

// Reports an admin (free access) account may generate per rolling day: each costs real model spend.
export const FREE_ACCESS_REPORTS_PER_DAY = 5;

export type RechargeSettlement =
  | { kind: "settled"; transaction: Transaction; balance: string; paidRupees: number; coupon: "applied" | "void" | "none"; couponVoidReason?: string }
  | { kind: "mismatch"; transaction: Transaction; reason: string }
  | { kind: "none" };

/** Why a gateway payment cannot settle this recharge, or null when it matches. */
export function paymentMismatch(row: Pick<Transaction, "gatewayOrderId" | "gatewayAmountPaise" | "gatewayCurrency">, payment: GatewayPayment): string | null {
  if (payment.orderId !== row.gatewayOrderId) return `payment belongs to order ${payment.orderId}`;
  if (payment.currency !== (row.gatewayCurrency ?? "INR")) return `currency ${payment.currency || "missing"}, expected ${row.gatewayCurrency ?? "INR"}`;
  if (!(payment.amountPaise > 0)) return `amount ${payment.amountPaise} paise`;
  if ((payment.amountRefundedPaise ?? 0) > 0) return `payment refunded ${payment.amountRefundedPaise} paise`;
  if (row.gatewayAmountPaise != null && payment.amountPaise !== row.gatewayAmountPaise) {
    return `amount ${payment.amountPaise} paise, expected ${row.gatewayAmountPaise}`;
  }
  return null;
}

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
  persistLegacyUpgrade(id: string, expectedChartData: unknown, data: Pick<Kundli, 'zodiacSign' | 'moonSign' | 'ascendant' | 'chartData' | 'dashas' | 'doshas' | 'remedies'>): Promise<Kundli | undefined>;

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
  tryDebitBalance(userId: string, cost: number): Promise<string | null>;
  creditWallet(userId: string, amount: number): Promise<string>;
  createPendingRecharge(data: PendingRechargeInput): Promise<Transaction>;
  countOpenRecharges(userId: string, since: Date): Promise<number>;
  settleRechargeOrder(payment: GatewayPayment, opts?: { signature?: string; userId?: string }): Promise<RechargeSettlement>;
  getRechargeByOrderId(orderId: string): Promise<Transaction | undefined>;
  getStalePendingRecharges(createdBefore: Date, createdAfter?: Date): Promise<Transaction[]>;
  rewardReferral(referral: { id: string; referrerId: string; refereeId: string }, referrerReward: number, refereeReward: number, referrerMonthlyCap?: number): Promise<{ refereeBalance: string; referrerPaid: boolean } | null>;
  failPendingRecharge(id: string): Promise<boolean>;
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
  cancelUserScheduledCall(id: string, userId: string): Promise<ScheduledCall | undefined>;

  // Notification operations
  closeActiveConsultations(): Promise<Array<{ id: string; userId: string; astrologerId: string; isFree: boolean | null }>>;
  setAllAstrologersOffline(): Promise<number>;
  restoreFreeChat(userIds: string[]): Promise<void>;
  endActiveLiveStreams(): Promise<number>;
  cancelOpenScheduledCalls(): Promise<Array<{ id: string; userId: string }>>;
  cancelWaitingQueue(): Promise<number>;
  getOpenPaidMarketplaceItems(): Promise<{
    poojaBookings: Array<{ id: string; userId: string; poojaName: string; amount: string; status: string | null; createdAt: Date | null }>;
    storeOrders: Array<{ id: string; userId: string; totalAmount: string; status: string | null; createdAt: Date | null }>;
    billedClosedConsultations: Array<{ id: string; userId: string; astrologerId: string; endedAt: Date | null; billed: string }>;
  }>;
  createNotification(data: {
    userId: string;
    recipientType?: string;
    type: string;
    title: string;
    body: string;
    data?: object;
  }): Promise<Notification>;
  getUserNotifications(userId: string): Promise<Notification[]>;
  markNotificationRead(id: string, userId: string): Promise<void>;
  markAllNotificationsRead(userId: string): Promise<void>;

  // Astrologer earnings
  hasEarningForConsultation(consultationId: string): Promise<boolean>;
  getBilledAmountForConsultation(consultationId: string): Promise<number>;
  createEarning(data: {
    astrologerId: string;
    consultationId?: string;
    grossAmount: string;
    platformFee: string;
    netAmount: string;
  }): Promise<AstrologerEarning | null>;
  getAstrologerEarnings(astrologerId: string): Promise<AstrologerEarning[]>;
  getAstrologerTotalEarnings(astrologerId: string): Promise<{ total: number; pending: number }>;

  // Payout operations
  createPayoutRequest(astrologerId: string, amount: string, method: string): Promise<PayoutRequest>;
  getAstrologerPayouts(astrologerId: string): Promise<PayoutRequest[]>;

  // AI Chat operations
  saveAiChatMessage(data: InsertAiChatMessage): Promise<AiChatMessage>;
  getAiChatHistory(userId: string, sessionId: string): Promise<AiChatMessage[]>;
  getAiChatMessage(userId: string, id: string): Promise<AiChatMessage | undefined>;
  reserveAskUsage(input: AskReserveInput): Promise<AskReservation>;
  settleAskUsage(id: string, outcome: "consumed" | "released", replyMessageId?: string): Promise<AskUsage | null>;
  releaseStaleAskReservations(): Promise<number>;
  recordAiUsage(u: { subject: string; day: string; feature: string; inputTokens: number; outputTokens: number; costMicroUsd: number }): Promise<void>;
  getAiUsageToday(subject: string, day: string): Promise<{ calls: number; costMicroUsd: number }>;
  reserveAiBudget(r: { subject: string; day: string; microUsd: number; costLimitMicroUsd: number; callLimit: number }): Promise<boolean>;
  settleAiBudget(r: { subject: string; day: string; reservedMicroUsd: number; actualMicroUsd: number }): Promise<void>;
  getAskAllowance(userId: string, opts: { freeQuestions: number; sessionId?: string; chartKey?: string }): Promise<AskAllowanceCounts>;
  issueEmailVerificationToken(userId: string, email: string, tokenHash: string, limits: EmailVerificationLimits): Promise<{ issued: true } | { throttled: true; retryAfterS: number }>;
  consumeEmailVerificationToken(tokenHash: string): Promise<EmailVerificationOutcome>;
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

  // Compare-and-swap: writes only if the stored chartData is still exactly what the upgrade was
  // computed from, so a concurrent writer (another instance, a retry) can never be overwritten.
  async persistLegacyUpgrade(id: string, expectedChartData: unknown, data: Pick<Kundli, 'zodiacSign' | 'moonSign' | 'ascendant' | 'chartData' | 'dashas' | 'doshas' | 'remedies'>): Promise<Kundli | undefined> {
    const [kundli] = await db.update(kundlis).set(data)
      .where(and(eq(kundlis.id, id), sql`${kundlis.chartData} = ${JSON.stringify(expectedChartData ?? null)}::jsonb`))
      .returning();
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

  /** A completed gateway recharge (referral bonuses are recorded as recharges without an order). */
  async hasCompletedRecharge(userId: string): Promise<boolean> {
    const rows = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.userId, userId),
          eq(transactions.type, "recharge"),
          eq(transactions.status, "completed"),
          sql`${transactions.gatewayOrderId} IS NOT NULL`,
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
    // Only an active consultation is timed and priced; ending one already closed (by the
    // billing loop, or cancelled when the marketplace was paused) changes nothing.
    if (!consultation || consultation.status !== "active") return consultation;

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
      .where(and(eq(consultations.id, id), eq(consultations.status, "active")))
      .returning();
    return updated ?? (await this.getConsultationById(id))!;
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

  async cancelUserScheduledCall(id: string, userId: string): Promise<ScheduledCall | undefined> {
    const [call] = await db
      .update(scheduledCalls)
      .set({ status: 'cancelled' })
      .where(and(eq(scheduledCalls.id, id), eq(scheduledCalls.userId, userId), sql`${scheduledCalls.status} in ('pending', 'confirmed')`))
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

  // ─── Pausing the marketplace ───────────────────────────────
  // Closes open marketplace activity without touching money: totals, transactions and
  // earnings are left exactly as billed. "cancelled" (not "ended") marks a consultation
  // closed by the pause, so a late end call from a client cannot bill or earn on it.

  async closeActiveConsultations(): Promise<Array<{ id: string; userId: string; astrologerId: string; isFree: boolean | null }>> {
    return db
      .update(consultations)
      .set({ status: "cancelled", endedAt: new Date() })
      .where(eq(consultations.status, "active"))
      .returning({ id: consultations.id, userId: consultations.userId, astrologerId: consultations.astrologerId, isFree: consultations.isFree });
  }

  async setAllAstrologersOffline(): Promise<number> {
    const rows = await db
      .update(astrologers)
      .set({ isOnline: false, availability: "offline" })
      .where(sql`${astrologers.isOnline} = true or ${astrologers.availability} <> 'offline'`)
      .returning({ id: astrologers.id });
    return rows.length;
  }

  async restoreFreeChat(userIds: string[]): Promise<void> {
    if (!userIds.length) return;
    await db.update(users).set({ freeChatUsed: false }).where(inArray(users.id, userIds));
  }

  async endActiveLiveStreams(): Promise<number> {
    const rows = await db
      .update(liveStreams)
      .set({ status: "ended", endedAt: new Date() })
      .where(eq(liveStreams.status, "live"))
      .returning({ id: liveStreams.id });
    return rows.length;
  }

  async cancelOpenScheduledCalls(): Promise<Array<{ id: string; userId: string }>> {
    return db
      .update(scheduledCalls)
      .set({ status: "cancelled" })
      .where(sql`${scheduledCalls.status} in ('pending', 'confirmed')`)
      .returning({ id: scheduledCalls.id, userId: scheduledCalls.userId });
  }

  async cancelWaitingQueue(): Promise<number> {
    const rows = await db
      .update(consultationQueue)
      .set({ status: "cancelled" })
      .where(eq(consultationQueue.status, "waiting"))
      .returning({ id: consultationQueue.id });
    return rows.length;
  }

  /** Paid marketplace purchases not yet fulfilled: each needs fulfilling or refunding. */
  async getOpenPaidMarketplaceItems() {
    const [poojaRows, orderRows] = await Promise.all([
      db.select({
        id: poojaBookings.id, userId: poojaBookings.userId, poojaName: poojaBookings.poojaName,
        amount: poojaBookings.amount, status: poojaBookings.status, createdAt: poojaBookings.createdAt,
      }).from(poojaBookings).where(sql`${poojaBookings.status} in ('booked', 'scheduled')`).orderBy(asc(poojaBookings.createdAt)),
      db.select({
        id: orders.id, userId: orders.userId, totalAmount: orders.totalAmount, status: orders.status, createdAt: orders.createdAt,
      }).from(orders).where(sql`${orders.status} in ('placed', 'confirmed', 'shipped')`).orderBy(asc(orders.createdAt)),
    ]);
    // Consultations closed by the pause whose billed minutes were neither paid to the
    // astrologer nor refunded: each needs one of the two.
    const { rows: billedRows } = await pool.query(`
      SELECT c.id, c.user_id AS "userId", c.astrologer_id AS "astrologerId", c.ended_at AS "endedAt",
             sum(abs(t.amount::numeric))::text AS billed
        FROM consultations c
        JOIN transactions t ON t.consultation_id = c.id AND t.type = 'debit' AND t.status = 'completed'
       WHERE c.status = 'cancelled'
         AND NOT EXISTS (SELECT 1 FROM astrologer_earnings e WHERE e.consultation_id = c.id)
         AND NOT EXISTS (SELECT 1 FROM transactions r WHERE r.consultation_id = c.id AND r.type = 'refund')
       GROUP BY c.id
      HAVING sum(abs(t.amount::numeric)) > 0
       ORDER BY c.ended_at`);
    return { poojaBookings: poojaRows, storeOrders: orderRows, billedClosedConsultations: billedRows as Array<{ id: string; userId: string; astrologerId: string; endedAt: Date | null; billed: string }> };
  }

  async getUserNotifications(userId: string): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }

  async markNotificationRead(id: string, userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  // ─── Astrologer earnings ───────────────────────────────────

  /** What the user was actually charged for a consultation (its per-minute debits). */
  async getBilledAmountForConsultation(consultationId: string): Promise<number> {
    const [row] = await db
      .select({ total: sql<string>`coalesce(sum(abs(${transactions.amount})), 0)` })
      .from(transactions)
      .where(and(
        eq(transactions.consultationId, consultationId),
        eq(transactions.type, "debit"),
        eq(transactions.status, "completed"),
      ));
    return parseFloat(row?.total ?? "0");
  }

  async hasEarningForConsultation(consultationId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: astrologerEarnings.id })
      .from(astrologerEarnings)
      .where(eq(astrologerEarnings.consultationId, consultationId))
      .limit(1);
    return Boolean(row);
  }

  async createEarning(data: {
    astrologerId: string;
    consultationId?: string;
    grossAmount: string;
    platformFee: string;
    netAmount: string;
  }): Promise<AstrologerEarning | null> {
    // The earning and the astrologer's totals move together. A consultation earns once: the
    // per-consultation lock holds even where the unique index could not be created.
    return db.transaction(async (tx) => {
      if (data.consultationId) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"earning:" + data.consultationId}))`);
        const [existing] = await tx
          .select({ id: astrologerEarnings.id })
          .from(astrologerEarnings)
          .where(eq(astrologerEarnings.consultationId, data.consultationId))
          .limit(1);
        if (existing) return null;
      }
      const [earning] = await tx.insert(astrologerEarnings).values(data).returning();
      await tx
        .update(astrologers)
        .set({
          totalEarnings: sql`${astrologers.totalEarnings} + ${data.netAmount}`,
          pendingPayout: sql`${astrologers.pendingPayout} + ${data.netAmount}`,
        })
        .where(eq(astrologers.id, data.astrologerId));
      return earning;
    });
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

  // Case-insensitive: "A@x.com" and "a@x.com" are one address. Rows that differ only by
  // case can predate this rule, so an exact match wins, then the canonical form.
  private async getUsersByEmailAnyCase(email: string): Promise<User[]> {
    const canonical = normalizeEmail(email);
    const rows = await db.select().from(users)
      .where(sql`lower(${users.email}) = ${canonical}`)
      .orderBy(asc(users.createdAt));
    const rank = (u: User) => (u.email === email.trim() ? 0 : u.email === canonical ? 1 : 2);
    return rows.sort((a, b) => rank(a) - rank(b));
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await this.getUsersByEmailAnyCase(email);
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
        email: normalizeEmail(data.email),
        firstName: data.firstName,
        lastName: data.lastName,
        passwordHash,
        authProvider: "email",
      })
      .returning();
    return user;
  }

  async verifyUserPassword(email: string, password: string): Promise<User | null> {
    for (const user of await this.getUsersByEmailAnyCase(email)) {
      if (user.passwordHash && await bcrypt.compare(password, user.passwordHash)) return user;
    }
    return null;
  }

  // ─── AI Chat operations ────────────────────────────────────

  async saveAiChatMessage(data: InsertAiChatMessage): Promise<AiChatMessage> {
    const [msg] = await db.insert(aiChatMessages).values(data).returning();
    return msg;
  }

  async getAiChatMessage(userId: string, id: string): Promise<AiChatMessage | undefined> {
    const [row] = await db.select().from(aiChatMessages).where(and(eq(aiChatMessages.id, id), eq(aiChatMessages.userId, userId)));
    return row;
  }

  // ─── Ask Your Kundli metering ──────────────────────────────
  // Reservations are taken before the answer is generated and settled after it: consumed when
  // a model answer was delivered, released (never counted) when generation failed. All
  // decisions for one user run under a per-user lock, so concurrent messages cannot both take
  // the last free question or the last follow-up.

  async reserveAskUsage(input: AskReserveInput): Promise<AskReservation> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"ask:" + input.userId}))`);
      const [existing] = await tx
        .select({ usage: askUsage, stale: sql<boolean>`${askUsage.createdAt} <= now() - ${ASK_RESERVATION_TTL_SQL}::interval` })
        .from(askUsage)
        .where(and(eq(askUsage.userId, input.userId), eq(askUsage.idempotencyKey, input.idempotencyKey)));
      if (existing?.usage.status === "consumed") return { kind: "replay", usage: existing.usage };
      if (existing?.usage.status === "reserved" && !existing.stale) return { kind: "in_flight" };
      if (existing) {
        // A retry after a failed or abandoned attempt: that attempt is released (a paid question
        // goes back to its entitlement) and kept under another key, and this one starts afresh.
        const old = existing.usage;
        await tx.update(askUsage)
          .set({ status: "released", settledAt: old.settledAt ?? new Date(), idempotencyKey: `${old.idempotencyKey}#${old.id}` })
          .where(eq(askUsage.id, old.id));
        if (old.status === "reserved" && old.kind === "question" && old.entitlementId) {
          await tx.update(entitlements).set({ used: sql`${entitlements.used} - 1` })
            .where(and(eq(entitlements.id, old.entitlementId), sql`${entitlements.used} > 0`));
        }
      }

      const counting = sql`(${askUsage.status} = 'consumed' OR (${askUsage.status} = 'reserved' AND ${askUsage.createdAt} > now() - ${ASK_RESERVATION_TTL_SQL}::interval))`;
      const [parent] = await tx.select().from(askUsage)
        .where(and(
          eq(askUsage.userId, input.userId), eq(askUsage.sessionId, input.sessionId), eq(askUsage.chartKey, input.chartKey),
          eq(askUsage.kind, "question"), counting,
        ))
        .orderBy(desc(askUsage.createdAt))
        .limit(1);
      if (parent) {
        const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(askUsage)
          .where(and(eq(askUsage.parentId, parent.id), counting));
        if (n < parent.followUpsAllowed) {
          const [usage] = await tx.insert(askUsage).values({
            userId: input.userId, chartKey: input.chartKey, sessionId: input.sessionId, kind: "follow_up", parentId: parent.id,
            entitlement: parent.entitlement, followUpsAllowed: 0, idempotencyKey: input.idempotencyKey,
          }).returning();
          return { kind: "reserved", usage };
        }
      }

      let entitlement: "free" | "paid" | "unmetered" | "admin";
      let entitlementId: string | null = null;
      let followUpsAllowed = input.freeFollowUps;
      if (input.unlimited) {
        entitlement = "admin";
      } else {
        const [{ n: freeUsed }] = await tx.select({ n: sql<number>`count(*)::int` }).from(askUsage)
          .where(and(eq(askUsage.userId, input.userId), eq(askUsage.kind, "question"), eq(askUsage.entitlement, "free"), counting));
        if (freeUsed < input.freeQuestions) {
          entitlement = "free";
        } else {
          const [paid] = await tx.execute(sql`
            UPDATE entitlements SET used = used + 1
            WHERE id = (
              SELECT id FROM entitlements
              WHERE user_id = ${input.userId} AND kind = 'ask_questions' AND used < quantity AND (expires_at IS NULL OR expires_at > now())
              ORDER BY expires_at ASC NULLS LAST, created_at ASC
              LIMIT 1
              FOR UPDATE
            )
            RETURNING id, follow_ups_each`).then((r: any) => r.rows ?? r);
          if (paid) {
            entitlement = "paid";
            entitlementId = String(paid.id);
            followUpsAllowed = Number(paid.follow_ups_each);
          } else if (input.enforce) {
            return { kind: "exhausted" };
          } else {
            entitlement = "unmetered";
          }
        }
      }
      const [usage] = await tx.insert(askUsage).values({
        userId: input.userId, chartKey: input.chartKey, sessionId: input.sessionId, kind: "question",
        entitlement, entitlementId, followUpsAllowed, idempotencyKey: input.idempotencyKey,
      }).returning();
      return { kind: "reserved", usage };
    });
  }

  /** Settles a reservation once. Releasing a paid question returns it to its entitlement. */
  async settleAskUsage(id: string, outcome: "consumed" | "released", replyMessageId?: string): Promise<AskUsage | null> {
    return db.transaction(async (tx) => {
      const [row] = await tx.update(askUsage)
        .set({ status: outcome, settledAt: new Date(), ...(replyMessageId ? { replyMessageId } : {}) })
        .where(and(eq(askUsage.id, id), eq(askUsage.status, "reserved")))
        .returning();
      if (!row) return null;
      if (outcome === "released" && row.kind === "question" && row.entitlementId) {
        await tx.update(entitlements).set({ used: sql`${entitlements.used} - 1` })
          .where(and(eq(entitlements.id, row.entitlementId), sql`${entitlements.used} > 0`));
      }
      return row;
    });
  }

  /** Releases reservations whose request never settled (process restart mid-answer). */
  async releaseStaleAskReservations(): Promise<number> {
    const stale = await db.select({ id: askUsage.id }).from(askUsage)
      .where(and(eq(askUsage.status, "reserved"), sql`${askUsage.createdAt} <= now() - ${ASK_RESERVATION_TTL_SQL}::interval`))
      .limit(500);
    let released = 0;
    for (const { id } of stale) if (await this.settleAskUsage(id, "released")) released++;
    return released;
  }

  async getAskAllowance(userId: string, opts: { freeQuestions: number; sessionId?: string; chartKey?: string }): Promise<AskAllowanceCounts> {
    const counting = sql`(${askUsage.status} = 'consumed' OR (${askUsage.status} = 'reserved' AND ${askUsage.createdAt} > now() - ${ASK_RESERVATION_TTL_SQL}::interval))`;
    const [{ n: freeUsed }] = await db.select({ n: sql<number>`count(*)::int` }).from(askUsage)
      .where(and(eq(askUsage.userId, userId), eq(askUsage.kind, "question"), eq(askUsage.entitlement, "free"), counting));
    const [{ n: paidRemaining }] = await db.select({ n: sql<number>`coalesce(sum(${entitlements.quantity} - ${entitlements.used}), 0)::int` }).from(entitlements)
      .where(and(eq(entitlements.userId, userId), eq(entitlements.kind, "ask_questions"), sql`(${entitlements.expiresAt} IS NULL OR ${entitlements.expiresAt} > now())`));
    let followUpsRemaining: number | null = null;
    if (opts.sessionId && opts.chartKey) {
      const [parent] = await db.select().from(askUsage)
        .where(and(eq(askUsage.userId, userId), eq(askUsage.sessionId, opts.sessionId), eq(askUsage.chartKey, opts.chartKey), eq(askUsage.kind, "question"), counting))
        .orderBy(desc(askUsage.createdAt)).limit(1);
      if (parent) {
        const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(askUsage).where(and(eq(askUsage.parentId, parent.id), counting));
        followUpsRemaining = Math.max(0, parent.followUpsAllowed - n);
      }
    }
    return { freeQuestionsUsed: freeUsed, freeQuestionsRemaining: Math.max(0, opts.freeQuestions - freeUsed), paidQuestionsRemaining: paidRemaining, followUpsRemaining };
  }

  // ─── Email verification ────────────────────────────────────
  // One account's links are issued one at a time (per-user lock), so the resend limits hold
  // across instances. A new link ends the previous unused one.

  async issueEmailVerificationToken(userId: string, email: string, tokenHash: string, limits: EmailVerificationLimits): Promise<{ issued: true } | { throttled: true; retryAfterS: number }> {
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"email-verify:" + userId}))`);
      const t = emailVerificationTokens;
      const [w] = await tx.select({
        sinceLast: sql<number | null>`extract(epoch from now() - max(${t.createdAt}))::float`,
        today: sql<number>`count(*) filter (where ${t.createdAt} > now() - interval '1 day')::int`,
        dayFreesIn: sql<number | null>`extract(epoch from min(${t.createdAt}) filter (where ${t.createdAt} > now() - interval '1 day') + interval '1 day' - now())::float`,
      }).from(t).where(eq(t.userId, userId));
      if (w.today >= limits.perDay) return { throttled: true as const, retryAfterS: Math.max(1, Math.ceil(w.dayFreesIn ?? 86400)) };
      if (w.sinceLast !== null && w.sinceLast < limits.minIntervalS) {
        return { throttled: true as const, retryAfterS: Math.max(1, Math.ceil(limits.minIntervalS - w.sinceLast)) };
      }
      await tx.update(t).set({ expiresAt: sql`least(${t.expiresAt}, now())` })
        .where(and(eq(t.userId, userId), sql`${t.usedAt} IS NULL`));
      await tx.insert(t).values({ userId, email, tokenHash, expiresAt: sql`now() + make_interval(secs => ${limits.ttlS})` });
      return { issued: true as const };
    });
  }

  /**
   * Spends a link once and verifies the address it was issued for. A link for an address the
   * account no longer has, or one another verified account already holds (case variants from
   * before emails were normalised), verifies nothing.
   */
  async consumeEmailVerificationToken(tokenHash: string): Promise<EmailVerificationOutcome> {
    return db.transaction(async (tx) => {
      const t = emailVerificationTokens;
      const [claimed] = await tx.update(t).set({ usedAt: sql`now()` })
        .where(and(eq(t.tokenHash, tokenHash), sql`${t.usedAt} IS NULL`, sql`${t.expiresAt} > now()`))
        .returning();
      if (!claimed) {
        const [row] = await tx.select().from(t).where(eq(t.tokenHash, tokenHash));
        if (!row) return "invalid";
        if (!row.usedAt) return "expired";
        const [u] = await tx.select({ verifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, row.userId));
        return u?.verifiedAt ? "already" : "invalid";
      }
      const [user] = await tx.select().from(users).where(eq(users.id, claimed.userId)).for("update");
      if (!user?.email || normalizeEmail(user.email) !== claimed.email) return "invalid";
      if (user.emailVerifiedAt) return "already";
      const [taken] = await tx.select({ id: users.id }).from(users)
        .where(and(sql`lower(${users.email}) = ${claimed.email}`, sql`${users.id} <> ${user.id}`, sql`${users.emailVerifiedAt} IS NOT NULL`))
        .limit(1);
      if (taken) return "conflict";
      await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, user.id));
      return "verified";
    });
  }

  // ─── AI usage (shared across instances) ────────────────────
  async recordAiUsage(u: { subject: string; day: string; feature: string; inputTokens: number; outputTokens: number; costMicroUsd: number }): Promise<void> {
    await db.insert(aiUsageDaily)
      .values({ subject: u.subject, day: u.day, feature: u.feature, calls: 1, inputTokens: u.inputTokens, outputTokens: u.outputTokens, costMicroUsd: u.costMicroUsd })
      .onConflictDoUpdate({
        target: [aiUsageDaily.subject, aiUsageDaily.day, aiUsageDaily.feature],
        set: {
          calls: sql`${aiUsageDaily.calls} + 1`,
          inputTokens: sql`${aiUsageDaily.inputTokens} + ${u.inputTokens}`,
          outputTokens: sql`${aiUsageDaily.outputTokens} + ${u.outputTokens}`,
          costMicroUsd: sql`${aiUsageDaily.costMicroUsd} + ${u.costMicroUsd}`,
        },
      });
  }

  /**
   * Reserves `microUsd` of a subject's daily AI budget, or refuses (false) when it would pass
   * either limit. One statement: the row lock on the conflict serialises concurrent calls.
   */
  async reserveAiBudget(r: { subject: string; day: string; microUsd: number; costLimitMicroUsd: number; callLimit: number }): Promise<boolean> {
    const result: any = await db.execute(sql`
      INSERT INTO ai_budget_daily (subject, day, cost_micro_usd, calls)
      SELECT ${r.subject}, ${r.day}, ${r.microUsd}, 1
      WHERE ${r.microUsd} <= ${r.costLimitMicroUsd} AND 1 <= ${r.callLimit}
      ON CONFLICT (subject, day) DO UPDATE
        SET cost_micro_usd = ai_budget_daily.cost_micro_usd + EXCLUDED.cost_micro_usd,
            calls = ai_budget_daily.calls + 1
        WHERE ai_budget_daily.cost_micro_usd + EXCLUDED.cost_micro_usd <= ${r.costLimitMicroUsd}
          AND ai_budget_daily.calls + 1 <= ${r.callLimit}
      RETURNING cost_micro_usd`);
    return (result.rows ?? result).length > 0;
  }

  /** Replaces a reservation with the call's real cost. */
  async settleAiBudget(r: { subject: string; day: string; reservedMicroUsd: number; actualMicroUsd: number }): Promise<void> {
    await db.update(aiBudgetDaily)
      .set({ costMicroUsd: sql`greatest(${aiBudgetDaily.costMicroUsd} - ${r.reservedMicroUsd} + ${r.actualMicroUsd}, 0)` })
      .where(and(eq(aiBudgetDaily.subject, r.subject), eq(aiBudgetDaily.day, r.day)));
  }

  /** Today's budgeted AI use for a subject (paid report generation is not budgeted). */
  async getAiUsageToday(subject: string, day: string): Promise<{ calls: number; costMicroUsd: number }> {
    const [row] = await db.select().from(aiBudgetDaily).where(and(eq(aiBudgetDaily.subject, subject), eq(aiBudgetDaily.day, day)));
    return { calls: row?.calls ?? 0, costMicroUsd: row?.costMicroUsd ?? 0 };
  }

  // ─── Long-term user memory ─────────────────────────────────
  async addUserMemory(data: { userId: string; kind?: string; content: string; sourceSessionId?: string }): Promise<UserMemory> {
    const [row] = await db.insert(userMemories).values({
      userId: data.userId,
      kind: data.kind || "fact",
      content: data.content,
      sourceSessionId: data.sourceSessionId,
    }).returning();
    return row;
  }

  async getUserMemories(userId: string, limit = 40): Promise<UserMemory[]> {
    return await db
      .select()
      .from(userMemories)
      .where(eq(userMemories.userId, userId))
      .orderBy(desc(userMemories.createdAt))
      .limit(limit);
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

  // Redemptions that were paid out: applied at settlement, or (rows from before settlement-time
  // checks) tied to a completed recharge. Staged and voided ones do not use up the offer.
  // The same rule settlement applies.
  async getUserCouponRedemptionCount(userId: string, couponId: string): Promise<number> {
    const rows = await db
      .select({ id: couponRedemptions.id })
      .from(couponRedemptions)
      .leftJoin(transactions, eq(transactions.id, couponRedemptions.transactionId))
      .where(
        and(
          eq(couponRedemptions.userId, userId),
          eq(couponRedemptions.couponId, couponId),
          sql`(${couponRedemptions.status} = 'applied' OR (${couponRedemptions.status} IS NULL AND ${transactions.status} = 'completed'))`,
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

  /**
   * Pays a referral exactly once and atomically: the pending referral is claimed and both
   * wallets credited (with their transactions) in one DB transaction, so a failure leaves
   * the reward unpaid and still claimable rather than claimed and lost. Returns the
   * referee's new balance, or null when it was already rewarded.
   */
  async rewardReferral(
    referral: { id: string; referrerId: string; refereeId: string },
    referrerReward: number,
    refereeReward: number,
    referrerMonthlyCap = Infinity,
  ): Promise<{ refereeBalance: string; referrerPaid: boolean } | null> {
    return db.transaction(async (tx) => {
      // Serialises one inviter's rewards so the monthly cap cannot be overrun by concurrent payments.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"referrer:" + referral.referrerId}))`);
      const [{ n: recent }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(referrals)
        .where(and(
          eq(referrals.referrerId, referral.referrerId), eq(referrals.status, "rewarded"),
          sql`${referrals.referrerReward} > 0`, sql`${referrals.rewardedAt} > now() - interval '30 days'`,
        ));
      const referrerPaid = recent < referrerMonthlyCap && referrerReward > 0;
      const paidToReferrer = referrerPaid ? referrerReward : 0;
      const [claimed] = await tx
        .update(referrals)
        .set({ status: "rewarded", referrerReward: paidToReferrer.toString(), refereeReward: refereeReward.toString(), rewardedAt: new Date() })
        .where(and(eq(referrals.id, referral.id), eq(referrals.status, "pending")))
        .returning({ id: referrals.id });
      if (!claimed) return null;
      const refereeBalance = await this.creditWallet(referral.refereeId, refereeReward, tx);
      const rows = [{ userId: referral.refereeId, amount: refereeReward.toString(), type: "recharge", description: "Referral bonus", status: "completed" }];
      if (referrerPaid) {
        await this.creditWallet(referral.referrerId, paidToReferrer, tx);
        rows.push({ userId: referral.referrerId, amount: paidToReferrer.toString(), type: "recharge", description: "Referral reward", status: "completed" });
      }
      await tx.insert(transactions).values(rows);
      return { refereeBalance, referrerPaid };
    });
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
  // ─── Atomic wallet arithmetic ──────────────────────────────
  // Balances change only by relative, conditional UPDATEs, never read-then-write, so
  // concurrent debits and credits (a report bought mid-chat, a webhook racing the
  // browser's verify call) cannot overdraw a wallet or lose an update.

  /** Debits `cost` if the balance covers it; returns the new balance, or null (no change). */
  async tryDebitBalance(userId: string, cost: number, exec: any = db): Promise<string | null> {
    if (!(cost > 0) || !Number.isFinite(cost)) return null;
    const amount = cost.toFixed(2);
    await exec.insert(wallets).values({ userId, balance: "0" }).onConflictDoNothing({ target: wallets.userId });
    const [row] = await exec
      .update(wallets)
      .set({ balance: sql`coalesce(${wallets.balance}, 0) - ${amount}::numeric`, updatedAt: new Date() })
      .where(and(eq(wallets.userId, userId), sql`coalesce(${wallets.balance}, 0) >= ${amount}::numeric`))
      .returning({ balance: wallets.balance });
    return row ? String(row.balance) : null;
  }

  /** Adds `amount` to the wallet (created if missing); returns the new balance. */
  async creditWallet(userId: string, amount: number, exec: any = db): Promise<string> {
    if (!(amount > 0) || !Number.isFinite(amount)) throw new Error(`Invalid credit amount: ${amount}`);
    const value = amount.toFixed(2);
    const [row] = await exec
      .insert(wallets)
      .values({ userId, balance: value })
      .onConflictDoUpdate({
        target: wallets.userId,
        set: { balance: sql`coalesce(${wallets.balance}, 0) + ${value}::numeric`, updatedAt: new Date() },
      })
      .returning({ balance: wallets.balance });
    return String(row.balance);
  }

  /** Creates a pending recharge and stages its coupon redemption in one DB transaction. */
  async createPendingRecharge(data: PendingRechargeInput): Promise<Transaction> {
    return db.transaction(async (tx) => {
      const [txn] = await tx.insert(transactions).values({
        userId: data.userId,
        amount: data.quotedCredit.toFixed(2),
        type: "recharge",
        description: data.description,
        status: "pending",
        paymentMethod: "razorpay",
        gatewayOrderId: data.orderId,
        gatewayAmountPaise: data.amountPaise,
        gatewayCurrency: "INR",
        packBonus: data.packBonus.toFixed(2),
        couponBonus: data.coupon ? data.coupon.bonus.toFixed(2) : "0.00",
        couponCode: data.coupon?.code,
      }).returning();
      if (data.coupon) {
        await tx.insert(couponRedemptions).values({
          couponId: data.coupon.id, userId: data.userId, transactionId: txn.id,
          discountAmount: data.coupon.bonus.toFixed(2), status: "staged",
        });
      }
      return txn;
    });
  }

  /** Recharges a user has started but not completed since `since` (bounds order spam). */
  async countOpenRecharges(userId: string, since: Date): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(transactions)
      .where(and(eq(transactions.userId, userId), eq(transactions.type, "recharge"), eq(transactions.status, "pending"), sql`${transactions.createdAt} >= ${since}`));
    return row?.n ?? 0;
  }

  /**
   * Credits a captured Razorpay payment to its pending recharge, exactly once. Only the
   * gateway's own report of the payment is trusted: its order must be this recharge's order,
   * its currency INR, and its amount exactly what the order was created for. A payment that
   * does not match is not credited; the recharge is set to 'review' with the reason.
   *
   * Bonuses are re-derived here, not taken from the order: the pack bonus fixed at order time,
   * and the coupon only if it is still eligible now (validity, global and per-user limits,
   * first-recharge rule), checked under a row lock on the coupon so concurrent settlements
   * cannot both take its last use. The user's settlements are serialised so two payments
   * cannot both count as a "first recharge".
   *
   * Recharges created before these checks (no gatewayAmountPaise) are credited the payment
   * plus the bonuses it can justify, never more than the amount recorded on the row.
   */
  async settleRechargeOrder(payment: GatewayPayment, opts: { signature?: string; userId?: string } = {}): Promise<RechargeSettlement> {
    if (payment.status !== "captured") return { kind: "none" };
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"recharge:" + payment.orderId}))`);
      const [row] = await tx
        .select()
        .from(transactions)
        .where(and(
          eq(transactions.gatewayOrderId, payment.orderId),
          eq(transactions.type, "recharge"),
          sql`${transactions.status} in ('pending', 'failed')`,
          ...(opts.userId ? [eq(transactions.userId, opts.userId)] : []),
        ))
        .limit(1)
        .for("update");
      if (!row) {
        // A second captured payment on an order already credited is never credited, but it is
        // recorded for review so the payer can be refunded, not silently dropped.
        const [done] = await tx.select().from(transactions)
          .where(and(eq(transactions.gatewayOrderId, payment.orderId), eq(transactions.type, "recharge"), eq(transactions.status, "completed")))
          .limit(1);
        if (!done || !done.gatewayPaymentId || done.gatewayPaymentId === payment.id || (opts.userId && done.userId !== opts.userId)) return { kind: "none" };
        const reason = `second payment on order already credited by ${done.gatewayPaymentId}`;
        const [flagged] = await tx.insert(transactions).values({
          userId: done.userId, amount: "0.00", type: "recharge", status: "review", description: "Payment held for review",
          paymentMethod: "razorpay", gatewayOrderId: payment.orderId, gatewayPaymentId: payment.id,
          gatewayAmountPaise: payment.amountPaise, gatewayCurrency: payment.currency, reviewReason: reason,
        }).onConflictDoNothing().returning();
        return flagged ? { kind: "mismatch", transaction: flagged, reason } : { kind: "none" };
      }
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"recharge-user:" + row.userId}))`);

      const reason = paymentMismatch(row, payment);
      if (reason) {
        const [flagged] = await tx.update(transactions)
          .set({ status: "review", reviewReason: reason, gatewayPaymentId: payment.id })
          .where(eq(transactions.id, row.id))
          .returning();
        return { kind: "mismatch", transaction: flagged, reason };
      }

      const paid = payment.amountPaise / 100;
      const legacy = row.gatewayAmountPaise == null;
      const packBonus = row.packBonus != null ? parseFloat(row.packBonus) : packBonusFor(paid);

      let couponBonus = 0;
      let coupon: "applied" | "void" | "none" = "none";
      let voidReason: string | undefined;
      const [redemption] = await tx.select().from(couponRedemptions).where(eq(couponRedemptions.transactionId, row.id)).limit(1);
      if (redemption) {
        const [c] = await tx.select().from(coupons).where(eq(coupons.id, redemption.couponId)).for("update");
        const [{ n: priorUses }] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(couponRedemptions)
          .leftJoin(transactions, eq(transactions.id, couponRedemptions.transactionId))
          .where(and(
            eq(couponRedemptions.userId, row.userId),
            eq(couponRedemptions.couponId, redemption.couponId),
            sql`${couponRedemptions.id} <> ${redemption.id}`,
            sql`(${couponRedemptions.status} = 'applied' OR (${couponRedemptions.status} IS NULL AND ${transactions.status} = 'completed'))`,
          ));
        const [earlier] = await tx
          .select({ id: transactions.id })
          .from(transactions)
          .where(and(
            eq(transactions.userId, row.userId), eq(transactions.type, "recharge"), eq(transactions.status, "completed"),
            sql`${transactions.gatewayOrderId} IS NOT NULL`, sql`${transactions.id} <> ${row.id}`,
          ))
          .limit(1);
        // The offer's dates and active flag are judged when it was quoted (the order), so a
        // payment that settles late keeps what it was promised; usage limits and the
        // first-recharge rule are judged now, under the locks.
        const verdict = c
          ? evaluateCoupon({ ...c, isActive: true }, paid, { isFirstRecharge: !earlier, userRedemptionCount: priorUses }, row.createdAt ?? new Date())
          : { ok: false, bonus: 0, message: "This offer no longer exists." };
        if (verdict.ok) {
          couponBonus = Math.min(verdict.bonus, parseFloat(redemption.discountAmount));
          coupon = "applied";
          await tx.update(coupons).set({ timesUsed: sql`coalesce(${coupons.timesUsed}, 0) + 1` }).where(eq(coupons.id, redemption.couponId));
          await tx.update(couponRedemptions).set({ status: "applied", discountAmount: couponBonus.toFixed(2) }).where(eq(couponRedemptions.id, redemption.id));
        } else {
          coupon = "void";
          voidReason = verdict.message;
          await tx.update(couponRedemptions).set({ status: "void" }).where(eq(couponRedemptions.id, redemption.id));
        }
      }

      let credit = Math.round((paid + packBonus + couponBonus) * 100) / 100;
      if (legacy) credit = Math.min(credit, parseFloat(row.amount));
      const [settled] = await tx.update(transactions)
        .set({
          status: "completed",
          settlementVerifiedAt: new Date(),
          amount: credit.toFixed(2),
          gatewayPaymentId: payment.id,
          ...(opts.signature ? { gatewaySignature: opts.signature } : {}),
          gatewayAmountPaise: payment.amountPaise,
          gatewayCurrency: payment.currency,
          packBonus: packBonus.toFixed(2),
          couponBonus: couponBonus.toFixed(2),
          ...(voidReason ? { description: `${row.description ?? "Wallet recharge"} (offer not applied: ${voidReason})` } : {}),
        })
        .where(eq(transactions.id, row.id))
        .returning();
      const balance = await this.creditWallet(row.userId, credit, tx);
      return { kind: "settled", transaction: settled, balance, paidRupees: paid, coupon, ...(voidReason ? { couponVoidReason: voidReason } : {}) };
    });
  }

  async getRechargeByOrderId(orderId: string): Promise<Transaction | undefined> {
    const [row] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.gatewayOrderId, orderId), eq(transactions.type, "recharge")))
      .orderBy(sql`(${transactions.status} = 'completed') DESC`, desc(transactions.createdAt))
      .limit(1);
    return row;
  }

  async getRechargesForReview(): Promise<Array<Pick<Transaction, "id" | "userId" | "amount" | "gatewayOrderId" | "gatewayPaymentId" | "gatewayAmountPaise" | "gatewayCurrency" | "reviewReason" | "createdAt">>> {
    return db
      .select({
        id: transactions.id, userId: transactions.userId, amount: transactions.amount, gatewayOrderId: transactions.gatewayOrderId,
        gatewayPaymentId: transactions.gatewayPaymentId, gatewayAmountPaise: transactions.gatewayAmountPaise,
        gatewayCurrency: transactions.gatewayCurrency, reviewReason: transactions.reviewReason, createdAt: transactions.createdAt,
      })
      .from(transactions)
      .where(and(eq(transactions.type, "recharge"), eq(transactions.status, "review")))
      .orderBy(desc(transactions.createdAt))
      .limit(200);
  }

  async getStalePendingRecharges(createdBefore: Date, createdAfter?: Date): Promise<Transaction[]> {
    return db
      .select()
      .from(transactions)
      .where(and(
        eq(transactions.type, "recharge"),
        eq(transactions.status, "pending"),
        eq(transactions.paymentMethod, "razorpay"),
        sql`${transactions.createdAt} < ${createdBefore}`,
        ...(createdAfter ? [sql`${transactions.createdAt} >= ${createdAfter}`] : []),
      ))
      .orderBy(asc(transactions.createdAt))
      .limit(100);
  }

  /** Marks a still-pending recharge failed; false when it was settled meanwhile. */
  async failPendingRecharge(id: string): Promise<boolean> {
    const rows = await db
      .update(transactions)
      .set({ status: "failed" })
      .where(and(eq(transactions.id, id), eq(transactions.status, "pending")))
      .returning({ id: transactions.id });
    return rows.length > 0;
  }

  async hasFreeAccess(userId: string): Promise<boolean> {
    const user = await this.getUser(userId);
    return isAdminAccount(user);
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

    return db.transaction(async (tx) => {
      const balance = await this.tryDebitBalance(userId, cost, tx);
      if (balance === null) return null;
      await tx.insert(transactions).values({
        userId,
        amount: (-cost).toString(),
        type: "debit",
        description,
        status: "completed",
      });
      return { balance };
    });
  }

  /** Kundli PDF: the first completed download is free, later ones cost `price`. Serialised per
   * user so concurrent requests cannot both claim the free download or lose a debit. */
  async purchaseKundliPdf(userId: string, price: number, description: string): Promise<{ balance: string; free: boolean } | null> {
    let wallet = await this.getWallet(userId);
    if (!wallet) wallet = await this.createWallet(userId);
    return db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"kundli-pdf:" + userId}))`);
      const [used] = await tx
        .select({ id: transactions.id })
        .from(transactions)
        .where(and(eq(transactions.userId, userId), eq(transactions.description, description), eq(transactions.status, "completed")))
        .limit(1);
      if (!used) {
        await tx.insert(transactions).values({ userId, amount: "0", type: "deduction", description, status: "completed" });
        const [current] = await tx.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.userId, userId));
        return { balance: current?.balance ?? "0", free: true };
      }
      const balance = await this.tryDebitBalance(userId, price, tx);
      if (balance === null) return null;
      await tx.insert(transactions).values({ userId, amount: (-price).toString(), type: "deduction", description, status: "completed" });
      return { balance, free: false };
    });
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
    subjectName?: string;
    amount: string;
  }): Promise<ReportOrder> {
    const [row] = await db.insert(reportOrders).values(data).returning();
    return row;
  }

  /**
   * Debits the wallet and creates the order in one DB transaction, so a charge never exists
   * without its order. Free-access accounts are charged ₹0. Null on insufficient balance.
   */
  async placeReportOrder(data: {
    userId: string;
    reportTypeId: string;
    kundliId?: string;
    subjectName?: string;
    price: number;
    description: string;
  }): Promise<{ order: ReportOrder; balance: string } | { refused: "duplicate" | "free_daily_limit"; order?: ReportOrder } | null> {
    const free = await this.hasFreeAccess(data.userId);
    if (!(await this.getWallet(data.userId))) await this.createWallet(data.userId);
    return db.transaction(async (tx) => {
      // One user's orders are placed one at a time, so a double submit cannot buy the same
      // report twice and concurrent free orders cannot pass the daily cap together.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"report-order:" + data.userId}))`);
      const [inProgress] = await tx.select().from(reportOrders).where(and(
        eq(reportOrders.userId, data.userId),
        eq(reportOrders.reportTypeId, data.reportTypeId),
        eq(reportOrders.status, "processing"),
        sql`coalesce(${reportOrders.kundliId}, '') = ${data.kundliId ?? ""}`,
        sql`coalesce(${reportOrders.subjectName}, '') = ${data.subjectName ?? ""}`,
      )).limit(1);
      if (inProgress) return { refused: "duplicate" as const, order: inProgress };
      if (free) {
        const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(reportOrders).where(and(
          eq(reportOrders.userId, data.userId), sql`${reportOrders.chargedAmount} = 0`, sql`${reportOrders.createdAt} > now() - interval '1 day'`,
        ));
        if (n >= FREE_ACCESS_REPORTS_PER_DAY) return { refused: "free_daily_limit" as const };
      }
      const charged = free ? 0 : data.price;
      let balance: string | null;
      if (charged > 0) {
        balance = await this.tryDebitBalance(data.userId, charged, tx);
        if (balance === null) return null;
      } else {
        const [w] = await tx.select({ balance: wallets.balance }).from(wallets).where(eq(wallets.userId, data.userId));
        balance = w?.balance ?? "0";
      }
      await tx.insert(transactions).values({
        userId: data.userId,
        amount: (-charged).toString(),
        type: "debit",
        description: free ? `${data.description} (free access)` : data.description,
        status: "completed",
      });
      const [order] = await tx.insert(reportOrders).values({
        userId: data.userId,
        reportTypeId: data.reportTypeId,
        kundliId: data.kundliId,
        subjectName: data.subjectName,
        amount: data.price.toFixed(2),
        chargedAmount: charged.toFixed(2),
      }).returning();
      return { order, balance };
    });
  }

  /** Delivers a report; a no-op (undefined) if the order already failed or was refunded. */
  async setReportOrderContent(id: string, content: object): Promise<ReportOrder | undefined> {
    const [row] = await db
      .update(reportOrders)
      .set({ content, status: "ready", readyAt: new Date() })
      .where(and(eq(reportOrders.id, id), eq(reportOrders.status, "processing")))
      .returning();
    return row;
  }

  async markReportOrderFailed(id: string): Promise<void> {
    await db.update(reportOrders).set({ status: "failed" }).where(eq(reportOrders.id, id));
  }

  /**
   * Fails an order that was not delivered and returns what it charged to the wallet, exactly
   * once. A delivered order is never refunded here.
   */
  async failAndRefundReportOrder(id: string, reason: string) {
    return this.refundReportOrder(id, sql`${reportOrders.status} in ('processing', 'failed')`, { status: "failed", failureReason: reason.slice(0, 1000) });
  }

  /** Admin refund of a delivered order whose content is the old templated placeholder; once only. */
  async refundPlaceholderReport(id: string) {
    return this.refundReportOrder(id, eq(reportOrders.status, "ready"), { failureReason: "templated placeholder content" });
  }

  // The claim on refunded_at and the credit share a transaction, so an order is refunded once.
  // Orders from before refunds existed carry no charged amount: their price is refunded unless
  // the account rides free.
  private async refundReportOrder(id: string, statusCondition: SQL, set: Partial<ReportOrder>): Promise<{ order: ReportOrder; refunded: number } | null> {
    const existing = await this.getReportOrderById(id);
    if (!existing) return null;
    const legacyCharge = existing.chargedAmount == null ? await this.legacyReportCharge(existing) : null;
    return db.transaction(async (tx) => {
      const [order] = await tx
        .update(reportOrders)
        .set({ ...set, refundedAt: new Date() })
        .where(and(eq(reportOrders.id, id), statusCondition, sql`${reportOrders.refundedAt} is null`))
        .returning();
      if (!order) return null;
      const refunded = Number(order.chargedAmount ?? legacyCharge ?? order.amount);
      if (refunded > 0) await this.creditWallet(order.userId, refunded, tx);
      await tx.insert(transactions).values({
        userId: order.userId,
        amount: refunded.toFixed(2),
        type: "refund",
        description: `Refund: report order ${order.id}`,
        status: "completed",
      });
      return { order, refunded };
    });
  }

  // Orders placed before charged_amount existed: the route debited the wallet just before
  // creating the order, so the nearest preceding "Report: …" debit is what was charged (₹0 for
  // a free-access account at the time).
  private async legacyReportCharge(order: ReportOrder): Promise<number | null> {
    if (!order.createdAt) return null;
    const { rows } = await pool.query(
      `SELECT abs(amount::numeric)::float AS charged FROM transactions
        WHERE user_id = $1 AND type = 'debit' AND description LIKE 'Report: %'
          AND created_at BETWEEN $2::timestamp - interval '5 minutes' AND $2::timestamp + interval '1 minute'
        ORDER BY abs(extract(epoch FROM created_at - $2::timestamp)) LIMIT 1`,
      [order.userId, order.createdAt],
    );
    return rows.length ? Number(rows[0].charged) : null;
  }

  /** Orders still marked processing long after generation could have finished (e.g. a restart). */
  async getStaleProcessingReportOrders(createdBefore: Date): Promise<ReportOrder[]> {
    return db
      .select()
      .from(reportOrders)
      .where(and(eq(reportOrders.status, "processing"), sql`${reportOrders.createdAt} < ${createdBefore}`))
      .orderBy(asc(reportOrders.createdAt))
      .limit(100);
  }

  /**
   * For the admin review: failed orders that were never refunded, and delivered orders whose
   * content is the old templated placeholder rather than a reading.
   */
  async getReportOrdersNeedingReview(): Promise<{ unrefundedFailures: ReportOrder[]; placeholderReports: ReportOrder[] }> {
    const [unrefundedFailures, placeholderReports] = await Promise.all([
      db.select().from(reportOrders)
        .where(and(eq(reportOrders.status, "failed"), sql`${reportOrders.refundedAt} is null`))
        .orderBy(asc(reportOrders.createdAt)),
      db.select().from(reportOrders)
        .where(and(eq(reportOrders.status, "ready"), sql`${reportOrders.refundedAt} is null`, sql`(
          exists (
            select 1 from jsonb_array_elements(coalesce(${reportOrders.content}->'sections', '[]'::jsonb)) s
            where s->>'body' ~ '^Analysis of .* based on your ascendant')
          or jsonb_array_length(coalesce(${reportOrders.content}->'sections', '[]'::jsonb)) < 5
          or (${reportOrders.reportTypeId} in (select id from report_types where category = 'life_complete')
              and jsonb_array_length(coalesce(${reportOrders.content}->'sections', '[]'::jsonb)) < 42))`))
        .orderBy(asc(reportOrders.createdAt)),
    ]);
    return { unrefundedFailures, placeholderReports };
  }

  /** A user's orders with the report's name, which stays known after a type is withdrawn. */
  async getUserReportOrders(userId: string): Promise<Array<ReportOrder & { reportName: string | null }>> {
    const rows = await db
      .select({ order: reportOrders, reportName: reportTypes.name })
      .from(reportOrders)
      .leftJoin(reportTypes, eq(reportTypes.id, reportOrders.reportTypeId))
      .where(eq(reportOrders.userId, userId))
      .orderBy(desc(reportOrders.createdAt));
    return rows.map((r) => ({ ...r.order, reportName: r.reportName }));
  }

  async getReportOrderById(id: string): Promise<ReportOrder | undefined> {
    const [row] = await db.select().from(reportOrders).where(eq(reportOrders.id, id));
    return row;
  }

  // ─── Daily horoscope (personalised, cached per user per day) ──
  async getDailyHoroscope(userId: string, horoDate: string): Promise<DailyHoroscope | undefined> {
    const [row] = await db
      .select()
      .from(dailyHoroscopes)
      .where(and(eq(dailyHoroscopes.userId, userId), eq(dailyHoroscopes.horoDate, horoDate)));
    return row;
  }

  async saveDailyHoroscope(data: {
    userId: string;
    kundliId?: string;
    horoDate: string;
    language: string;
    content: object;
  }): Promise<DailyHoroscope> {
    const existing = await this.getDailyHoroscope(data.userId, data.horoDate);
    if (existing) {
      const [row] = await db
        .update(dailyHoroscopes)
        .set({ kundliId: data.kundliId, language: data.language, content: data.content, createdAt: new Date() })
        .where(eq(dailyHoroscopes.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(dailyHoroscopes).values(data).returning();
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

  // ─── Jyotish AI Reading (admin + Astrologer Pro) ────────────
  async createJyotishProfile(data: InsertJyotishClientProfile): Promise<JyotishClientProfile> {
    const [row] = await db.insert(jyotishClientProfiles).values(data).returning();
    return row;
  }

  async getJyotishProfiles(createdByUserId: string): Promise<JyotishClientProfile[]> {
    return await db
      .select()
      .from(jyotishClientProfiles)
      .where(eq(jyotishClientProfiles.createdByUserId, createdByUserId))
      .orderBy(desc(jyotishClientProfiles.createdAt));
  }

  async getJyotishProfilesByAstrologer(astrologerId: string): Promise<JyotishClientProfile[]> {
    return await db
      .select()
      .from(jyotishClientProfiles)
      .where(eq(jyotishClientProfiles.astrologerId, astrologerId))
      .orderBy(desc(jyotishClientProfiles.createdAt));
  }

  async getJyotishProfileById(id: string): Promise<JyotishClientProfile | undefined> {
    const [row] = await db.select().from(jyotishClientProfiles).where(eq(jyotishClientProfiles.id, id));
    return row;
  }

  /** Studio tier soft cap — resets calendar-monthly. Returns remaining credits. */
  /**
   * Takes `cost` Pro AI credits in one conditional UPDATE (the month rolls over in the same
   * statement), so concurrent requests cannot both take the last credit.
   */
  async consumeProAiCredit(astrologerId: string, cost = 1, monthlyLimit = 80): Promise<{ ok: boolean; used: number; limit: number }> {
    const newMonth = sql`(${astrologers.proAiCreditsResetAt} IS NULL OR date_trunc('month', ${astrologers.proAiCreditsResetAt}) <> date_trunc('month', now() AT TIME ZONE 'UTC'))`;
    const nextUsed = sql`(CASE WHEN ${newMonth} THEN ${cost} ELSE coalesce(${astrologers.proAiCreditsUsed}, 0) + ${cost} END)`;
    const [row] = await db
      .update(astrologers)
      .set({
        proAiCreditsUsed: nextUsed,
        proAiCreditsResetAt: sql`(CASE WHEN ${newMonth} THEN now() AT TIME ZONE 'UTC' ELSE ${astrologers.proAiCreditsResetAt} END)`,
      })
      .where(and(eq(astrologers.id, astrologerId), sql`${nextUsed} <= ${monthlyLimit}`))
      .returning({ used: astrologers.proAiCreditsUsed });
    if (row) return { ok: true, used: Number(row.used), limit: monthlyLimit };
    const usage = await this.getProAiUsage(astrologerId, monthlyLimit);
    return { ok: false, used: usage.used, limit: monthlyLimit };
  }

  /** Returns credits taken for a generation that failed. */
  async refundProAiCredit(astrologerId: string, cost = 1): Promise<void> {
    await db.update(astrologers)
      .set({ proAiCreditsUsed: sql`greatest(coalesce(${astrologers.proAiCreditsUsed}, 0) - ${cost}, 0)` })
      .where(eq(astrologers.id, astrologerId));
  }

  async getProAiUsage(astrologerId: string, monthlyLimit = 80): Promise<{ used: number; limit: number; remaining: number }> {
    const astro = await this.getAstrologerById(astrologerId);
    const now = new Date();
    let used = astro?.proAiCreditsUsed ?? 0;
    const resetAt = astro?.proAiCreditsResetAt ? new Date(astro.proAiCreditsResetAt) : null;
    const needsReset = !resetAt || resetAt.getUTCFullYear() !== now.getUTCFullYear() || resetAt.getUTCMonth() !== now.getUTCMonth();
    if (needsReset) used = 0;
    return { used, limit: monthlyLimit, remaining: Math.max(0, monthlyLimit - used) };
  }

  async createJyotishReading(data: InsertJyotishReading): Promise<JyotishReading> {
    const [row] = await db.insert(jyotishReadings).values(data).returning();
    return row;
  }

  async updateJyotishReading(id: string, data: Partial<InsertJyotishReading>): Promise<JyotishReading> {
    const [row] = await db
      .update(jyotishReadings)
      .set(data)
      .where(eq(jyotishReadings.id, id))
      .returning();
    return row;
  }

  async getJyotishReadingById(id: string): Promise<JyotishReading | undefined> {
    const [row] = await db.select().from(jyotishReadings).where(eq(jyotishReadings.id, id));
    return row;
  }

  async listJyotishReadingsForProfile(profileId: string): Promise<JyotishReading[]> {
    return await db
      .select()
      .from(jyotishReadings)
      .where(eq(jyotishReadings.profileId, profileId))
      .orderBy(desc(jyotishReadings.createdAt));
  }

  async createJyotishSessionQuery(data: InsertJyotishSessionQuery): Promise<JyotishSessionQuery> {
    const [row] = await db.insert(jyotishSessionQueries).values(data).returning();
    return row;
  }

  async updateJyotishSessionQueryAnswer(id: string, answer: string): Promise<JyotishSessionQuery> {
    const [row] = await db
      .update(jyotishSessionQueries)
      .set({ answer })
      .where(eq(jyotishSessionQueries.id, id))
      .returning();
    return row;
  }

  async listJyotishSessionQueries(profileId: string): Promise<JyotishSessionQuery[]> {
    return await db
      .select()
      .from(jyotishSessionQueries)
      .where(eq(jyotishSessionQueries.profileId, profileId))
      .orderBy(desc(jyotishSessionQueries.createdAt));
  }
}


export const storage = new DatabaseStorage();

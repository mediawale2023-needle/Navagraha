import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
  integer,
  boolean,
  decimal,
  serial,
  numeric,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (connect-pg-simple)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  phoneNumber: varchar("phone_number"),
  dateOfBirth: timestamp("date_of_birth"),
  timeOfBirth: varchar("time_of_birth"),
  placeOfBirth: varchar("place_of_birth"),
  passwordHash: varchar("password_hash"), // for email/password auth
  authProvider: varchar("auth_provider").default("google"), // google | email
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Kundli table
export const kundlis = pgTable("kundlis", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  name: varchar("name").notNull(),
  dateOfBirth: timestamp("date_of_birth").notNull(),
  timeOfBirth: varchar("time_of_birth").notNull(),
  placeOfBirth: varchar("place_of_birth").notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 7 }),
  longitude: decimal("longitude", { precision: 10, scale: 7 }),
  gender: varchar("gender"),
  zodiacSign: varchar("zodiac_sign"),
  moonSign: varchar("moon_sign"),
  ascendant: varchar("ascendant"),
  chartData: jsonb("chart_data"),
  dashas: jsonb("dashas"),
  doshas: jsonb("doshas"),
  remedies: jsonb("remedies"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertKundliSchema = createInsertSchema(kundlis).omit({
  id: true,
  createdAt: true,
}).extend({
  dateOfBirth: z.union([z.date(), z.string().transform((str) => new Date(str))]),
  latitude: z.union([z.string(), z.number().transform((num) => num.toString())]).optional(),
  longitude: z.union([z.string(), z.number().transform((num) => num.toString())]).optional(),
});

export type InsertKundli = z.infer<typeof insertKundliSchema>;
export type Kundli = typeof kundlis.$inferSelect;

// Astrologers table — extended with auth + earnings fields
export const astrologers = pgTable("astrologers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  email: varchar("email").unique(),
  passwordHash: varchar("password_hash"),
  profileImageUrl: varchar("profile_image_url"),
  specializations: text("specializations").array(),
  experience: integer("experience"),
  rating: decimal("rating", { precision: 3, scale: 2 }),
  totalConsultations: integer("total_consultations").default(0),
  pricePerMinute: decimal("price_per_minute", { precision: 10, scale: 2 }),
  availability: varchar("availability").default("offline"), // online | busy | offline
  languages: text("languages").array(),
  about: text("about"),
  certifications: text("certifications").array(),
  // New fields
  isVerified: boolean("is_verified").default(false),
  isOnline: boolean("is_online").default(false),
  totalEarnings: decimal("total_earnings", { precision: 12, scale: 2 }).default("0"),
  pendingPayout: decimal("pending_payout", { precision: 12, scale: 2 }).default("0"),
  bankAccountName: varchar("bank_account_name"),
  bankAccountNumber: varchar("bank_account_number"),
  bankIfsc: varchar("bank_ifsc"),
  upiId: varchar("upi_id"),
  phoneNumber: varchar("phone_number"),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAstrologerSchema = createInsertSchema(astrologers).omit({
  id: true,
  createdAt: true,
});

export type InsertAstrologer = z.infer<typeof insertAstrologerSchema>;
export type Astrologer = typeof astrologers.$inferSelect;

// Wallet table
export const wallets = pgTable("wallets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull().unique(),
  balance: decimal("balance", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type Wallet = typeof wallets.$inferSelect;

// Transactions table — extended with payment gateway fields
export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  type: varchar("type").notNull(), // recharge | debit | refund
  description: text("description"),
  status: varchar("status").default("pending"), // pending | completed | failed
  // Payment gateway fields
  paymentMethod: varchar("payment_method"), // razorpay | snapmint | lazypay | wallet
  gatewayOrderId: varchar("gateway_order_id"),
  gatewayPaymentId: varchar("gateway_payment_id"),
  gatewaySignature: varchar("gateway_signature"),
  // Consultation reference
  consultationId: varchar("consultation_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactions).omit({
  id: true,
  createdAt: true,
});

export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

// Chat messages table
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  astrologerId: varchar("astrologer_id").references(() => astrologers.id).notNull(),
  message: text("message").notNull(),
  sender: varchar("sender").notNull(), // user | astrologer
  messageType: varchar("message_type").default("text"), // text | image | audio
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

// Consultations table — tracks live sessions with billing
export const consultations = pgTable("consultations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  astrologerId: varchar("astrologer_id").references(() => astrologers.id).notNull(),
  type: varchar("type").notNull(), // chat | voice | video
  status: varchar("status").default("active"), // active | ended | cancelled
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
  durationSeconds: integer("duration_seconds").default(0),
  pricePerMinute: decimal("price_per_minute", { precision: 10, scale: 2 }),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).default("0"),
  // Agora channel for calls
  agoraChannel: varchar("agora_channel"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertConsultationSchema = createInsertSchema(consultations).omit({
  id: true,
  createdAt: true,
  startedAt: true,
});

export type InsertConsultation = z.infer<typeof insertConsultationSchema>;
export type Consultation = typeof consultations.$inferSelect;

// Reviews table
export const reviews = pgTable("reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  astrologerId: varchar("astrologer_id").references(() => astrologers.id).notNull(),
  consultationId: varchar("consultation_id").references(() => consultations.id),
  rating: integer("rating").notNull(), // 1-5
  comment: text("comment"),
  isPublic: boolean("is_public").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertReviewSchema = createInsertSchema(reviews).omit({
  id: true,
  createdAt: true,
});

export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviews.$inferSelect;

// Scheduled calls table
export const scheduledCalls = pgTable("scheduled_calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  astrologerId: varchar("astrologer_id").references(() => astrologers.id).notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  type: varchar("type").notNull(), // chat | voice | video
  durationMinutes: integer("duration_minutes").default(30),
  status: varchar("status").default("pending"), // pending | confirmed | cancelled | completed
  notes: text("notes"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertScheduledCallSchema = createInsertSchema(scheduledCalls).omit({
  id: true,
  createdAt: true,
}).extend({
  scheduledAt: z.union([z.date(), z.string().transform((str) => new Date(str))]),
});

export type InsertScheduledCall = z.infer<typeof insertScheduledCallSchema>;
export type ScheduledCall = typeof scheduledCalls.$inferSelect;

// Notifications table
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"), // can be user or astrologer ID
  recipientType: varchar("recipient_type").default("user"), // user | astrologer
  type: varchar("type").notNull(), // session_start | payment | review | schedule | system
  title: varchar("title").notNull(),
  body: text("body").notNull(),
  data: jsonb("data"),
  isRead: boolean("is_read").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Notification = typeof notifications.$inferSelect;

// Astrologer earnings table
export const astrologerEarnings = pgTable("astrologer_earnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  astrologerId: varchar("astrologer_id").references(() => astrologers.id).notNull(),
  consultationId: varchar("consultation_id").references(() => consultations.id),
  grossAmount: decimal("gross_amount", { precision: 10, scale: 2 }).notNull(),
  platformFee: decimal("platform_fee", { precision: 10, scale: 2 }).notNull(),
  netAmount: decimal("net_amount", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status").default("pending"), // pending | paid
  createdAt: timestamp("created_at").defaultNow(),
});

export type AstrologerEarning = typeof astrologerEarnings.$inferSelect;

// Payout requests table
export const payoutRequests = pgTable("payout_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  astrologerId: varchar("astrologer_id").references(() => astrologers.id).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  method: varchar("method").notNull(), // bank | upi
  status: varchar("status").default("pending"), // pending | processing | paid | rejected
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  processedAt: timestamp("processed_at"),
});

export type PayoutRequest = typeof payoutRequests.$inferSelect;

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  kundlis: many(kundlis),
  wallet: one(wallets),
  transactions: many(transactions),
  chatMessages: many(chatMessages),
  consultations: many(consultations),
  reviews: many(reviews),
  scheduledCalls: many(scheduledCalls),
}));

export const kundlisRelations = relations(kundlis, ({ one }) => ({
  user: one(users, {
    fields: [kundlis.userId],
    references: [users.id],
  }),
}));

export const walletsRelations = relations(wallets, ({ one }) => ({
  user: one(users, {
    fields: [wallets.userId],
    references: [users.id],
  }),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  user: one(users, {
    fields: [transactions.userId],
    references: [users.id],
  }),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  user: one(users, {
    fields: [chatMessages.userId],
    references: [users.id],
  }),
  astrologer: one(astrologers, {
    fields: [chatMessages.astrologerId],
    references: [astrologers.id],
  }),
}));

export const consultationsRelations = relations(consultations, ({ one }) => ({
  user: one(users, {
    fields: [consultations.userId],
    references: [users.id],
  }),
  astrologer: one(astrologers, {
    fields: [consultations.astrologerId],
    references: [astrologers.id],
  }),
}));

export const reviewsRelations = relations(reviews, ({ one }) => ({
  user: one(users, {
    fields: [reviews.userId],
    references: [users.id],
  }),
  astrologer: one(astrologers, {
    fields: [reviews.astrologerId],
    references: [astrologers.id],
  }),
}));

export const scheduledCallsRelations = relations(scheduledCalls, ({ one }) => ({
  user: one(users, {
    fields: [scheduledCalls.userId],
    references: [users.id],
  }),
  astrologer: one(astrologers, {
    fields: [scheduledCalls.astrologerId],
    references: [astrologers.id],
  }),
}));

export const astrologersRelations = relations(astrologers, ({ many }) => ({
  chatMessages: many(chatMessages),
  consultations: many(consultations),
  reviews: many(reviews),
  scheduledCalls: many(scheduledCalls),
  earnings: many(astrologerEarnings),
}));

export const astrologerEarningsRelations = relations(astrologerEarnings, ({ one }) => ({
  astrologer: one(astrologers, {
    fields: [astrologerEarnings.astrologerId],
    references: [astrologers.id],
  }),
}));

// Homepage CMS content table
export const homepageContent = pgTable("homepage_content", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  section: varchar("section").notNull(), // 'banner' | 'service' | 'free_service'
  title: varchar("title").notNull(),
  subtitle: text("subtitle"),
  icon: varchar("icon"), // lucide icon name e.g. 'MessageCircle'
  href: varchar("href"),
  gradient: varchar("gradient"), // CSS gradient class for banners
  cta: varchar("cta"), // CTA button text (banners)
  sortOrder: integer("sort_order").default(0),
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertHomepageContentSchema = createInsertSchema(homepageContent).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertHomepageContent = z.infer<typeof insertHomepageContentSchema>;
export type HomepageContent = typeof homepageContent.$inferSelect;

// AI Chat Messages table — conversations with the AI astrologer
export const aiChatMessages = pgTable("ai_chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  sessionId: varchar("session_id").notNull(), // groups a conversation
  role: varchar("role").notNull(), // user | assistant
  content: text("content").notNull(),
  kundliId: varchar("kundli_id").references(() => kundlis.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAiChatMessageSchema = createInsertSchema(aiChatMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertAiChatMessage = z.infer<typeof insertAiChatMessageSchema>;
export type AiChatMessage = typeof aiChatMessages.$inferSelect;

// ─── Phase 3, Sprint 4: Bayesian Feedback Loop ─────────────────────────────

export const predictionFeedbacks = pgTable("prediction_feedbacks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  kundliId: varchar("kundli_id").references(() => kundlis.id),
  predictionCategory: text("prediction_category").notNull(), // 'career', 'marriage', 'health', 'finance'
  predictedDate: timestamp("predicted_date"),
  actualOccurrenceDate: timestamp("actual_occurrence_date"),
  wasAccurate: boolean("was_accurate").notNull(),
  dashaSystemUsed: text("dasha_system_used").notNull(), // 'Vimshottari', 'Yogini', 'Chara'
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Navagraha Corporate (The C-Suite) ─────────────────
export const aiCompanies = pgTable("ai_companies", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),   // varchar UUID from users.id
  name: text("name").notNull(),
  mission: text("mission").notNull(),
  industry: text("industry").notNull(),
  targetRevenue: numeric("target_revenue", { precision: 12, scale: 2 }),
  targetCurrency: text("target_currency").default("INR"),
  targetDeadline: timestamp("target_deadline"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aiEmployees = pgTable("ai_employees", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => aiCompanies.id).notNull(),
  role: text("role").notNull(), // CEO, CTO, CFO, CMO, BRAND, SALES
  name: text("name").notNull(),
  personality: text("personality").notNull(),
  status: text("status").default("active"), // active, paused, thinking
  lastOutput: text("last_output"),
  tokenSpend: integer("token_spend").default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const aiInitiatives = pgTable("ai_initiatives", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => aiCompanies.id).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  priority: text("priority").default("medium"), // high, medium, low
  status: text("status").default("pending"), // pending, active, completed, failed
  deadline: timestamp("deadline"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const aiDirectives = pgTable("ai_directives", {
  id: serial("id").primaryKey(),
  initiativeId: integer("initiative_id").references(() => aiInitiatives.id).notNull(),
  issuerId: integer("issuer_id").references(() => aiEmployees.id).notNull(),
  assigneeId: integer("assignee_id").references(() => aiEmployees.id), // Can be null if global
  content: text("content").notNull(),
  type: text("type").notNull(), // STRATEGY, TASK, REPORT
  status: text("status").default("pending"), // pending, approved, completed, rejected
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Zod Schemas for Corporate ─────────────────────────
export const insertAiCompanySchema = createInsertSchema(aiCompanies);
export const insertAiEmployeeSchema = createInsertSchema(aiEmployees);
export const insertAiInitiativeSchema = createInsertSchema(aiInitiatives);
export const insertAiDirectiveSchema = createInsertSchema(aiDirectives);

export type AiCompany = typeof aiCompanies.$inferSelect;
export type AiEmployee = typeof aiEmployees.$inferSelect;
export type AiInitiative = typeof aiInitiatives.$inferSelect;
export type AiDirective = typeof aiDirectives.$inferSelect;


export const insertPredictionFeedbackSchema = createInsertSchema(predictionFeedbacks);

export const predictionFeedbacksRelations = relations(predictionFeedbacks, ({ one }) => ({
  user: one(users, {
    fields: [predictionFeedbacks.userId],
    references: [users.id],
  }),
  kundli: one(kundlis, {
    fields: [predictionFeedbacks.kundliId],
    references: [kundlis.id],
  }),
}));

export type PredictionFeedback = typeof predictionFeedbacks.$inferSelect;
export type InsertPredictionFeedback = z.infer<typeof insertPredictionFeedbackSchema>;

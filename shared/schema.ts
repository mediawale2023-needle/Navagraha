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
  referralCode: varchar("referral_code").unique(),
  referredBy: varchar("referred_by"), // referralCode of the inviter
  freeChatUsed: boolean("free_chat_used").default(false),
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
  // Applied coupon (if any) on a recharge
  couponCode: varchar("coupon_code"),
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
  // First-chat-free promotion
  isFree: boolean("is_free").default(false),
  freeMinutes: integer("free_minutes").default(0),
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

// ─── Offers / Coupons ──────────────────────────────────────
export const coupons = pgTable("coupons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code").notNull().unique(),
  description: text("description"),
  discountType: varchar("discount_type").notNull().default("percent"), // percent | flat
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(),
  maxDiscount: decimal("max_discount", { precision: 10, scale: 2 }), // cap for percent type
  minAmount: decimal("min_amount", { precision: 10, scale: 2 }).default("0"),
  usageLimit: integer("usage_limit"), // total redemptions (null = unlimited)
  perUserLimit: integer("per_user_limit").default(1),
  firstRechargeOnly: boolean("first_recharge_only").default(false),
  timesUsed: integer("times_used").default(0),
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  isActive: boolean("is_active").default(true),
  showOnWallet: boolean("show_on_wallet").default(true), // surface to users
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCouponSchema = createInsertSchema(coupons).omit({
  id: true,
  timesUsed: true,
  createdAt: true,
}).extend({
  validFrom: z.union([z.date(), z.string().transform((s) => new Date(s))]).optional().nullable(),
  validUntil: z.union([z.date(), z.string().transform((s) => new Date(s))]).optional().nullable(),
});

export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type Coupon = typeof coupons.$inferSelect;

export const couponRedemptions = pgTable("coupon_redemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  couponId: varchar("coupon_id").references(() => coupons.id).notNull(),
  userId: varchar("user_id").references(() => users.id).notNull(),
  transactionId: varchar("transaction_id"),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type CouponRedemption = typeof couponRedemptions.$inferSelect;

// ─── Push notification tokens (FCM) ────────────────────────
export const pushTokens = pgTable("push_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  ownerId: varchar("owner_id").notNull(), // user or astrologer id
  ownerType: varchar("owner_type").notNull().default("user"), // user | astrologer
  token: varchar("token").notNull().unique(),
  platform: varchar("platform").default("web"), // web | android | ios
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type PushToken = typeof pushTokens.$inferSelect;

// ─── Referrals ─────────────────────────────────────────────
export const referrals = pgTable("referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerId: varchar("referrer_id").references(() => users.id).notNull(),
  refereeId: varchar("referee_id").references(() => users.id).notNull().unique(),
  status: varchar("status").default("pending"), // pending | rewarded
  referrerReward: decimal("referrer_reward", { precision: 10, scale: 2 }).default("0"),
  refereeReward: decimal("referee_reward", { precision: 10, scale: 2 }).default("0"),
  rewardedAt: timestamp("rewarded_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Referral = typeof referrals.$inferSelect;

// ─── Astromall (e-commerce store) ──────────────────────────
export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  slug: varchar("slug").notNull().unique(),
  description: text("description"),
  category: varchar("category").notNull(), // gemstone | rudraksha | yantra | bracelet | mala | other
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  mrp: decimal("mrp", { precision: 10, scale: 2 }),
  imageUrl: varchar("image_url"),
  images: text("images").array(),
  stock: integer("stock").default(100),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("4.5"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProductSchema = createInsertSchema(products).omit({ id: true, createdAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  status: varchar("status").default("placed"), // placed | confirmed | shipped | delivered | cancelled
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: varchar("payment_method").default("wallet"),
  shippingName: varchar("shipping_name"),
  shippingPhone: varchar("shipping_phone"),
  shippingAddress: text("shipping_address"),
  shippingCity: varchar("shipping_city"),
  shippingState: varchar("shipping_state"),
  shippingPincode: varchar("shipping_pincode"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Order = typeof orders.$inferSelect;

export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").references(() => orders.id).notNull(),
  productId: varchar("product_id").references(() => products.id).notNull(),
  productName: varchar("product_name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
});

export type OrderItem = typeof orderItems.$inferSelect;

// ─── Paid Reports ──────────────────────────────────────────
export const reportTypes = pgTable("report_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug").notNull().unique(),
  name: varchar("name").notNull(),
  description: text("description"),
  category: varchar("category").default("life"), // career | marriage | finance | health | year_ahead | life
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  icon: varchar("icon"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export type ReportType = typeof reportTypes.$inferSelect;

export const reportOrders = pgTable("report_orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  reportTypeId: varchar("report_type_id").references(() => reportTypes.id).notNull(),
  kundliId: varchar("kundli_id").references(() => kundlis.id),
  status: varchar("status").default("processing"), // processing | ready | failed
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  content: jsonb("content"), // generated report payload
  createdAt: timestamp("created_at").defaultNow(),
  readyAt: timestamp("ready_at"),
});

export type ReportOrder = typeof reportOrders.$inferSelect;

// ─── Book a Pooja ──────────────────────────────────────────
export const poojas = pgTable("poojas", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar("slug").notNull().unique(),
  name: varchar("name").notNull(),
  description: text("description"),
  benefits: text("benefits").array(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  durationText: varchar("duration_text"), // e.g. "Performed within 7 days"
  imageUrl: varchar("image_url"),
  isActive: boolean("is_active").default(true),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Pooja = typeof poojas.$inferSelect;

export const poojaBookings = pgTable("pooja_bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  poojaId: varchar("pooja_id").references(() => poojas.id).notNull(),
  poojaName: varchar("pooja_name").notNull(),
  status: varchar("status").default("booked"), // booked | scheduled | performed | cancelled
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  devoteeName: varchar("devotee_name").notNull(),
  gotra: varchar("gotra"),
  preferredDate: timestamp("preferred_date"),
  sankalpNotes: text("sankalp_notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type PoojaBooking = typeof poojaBookings.$inferSelect;

// ─── Live Streaming ────────────────────────────────────────
export const liveStreams = pgTable("live_streams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  astrologerId: varchar("astrologer_id").references(() => astrologers.id).notNull(),
  title: varchar("title").notNull(),
  status: varchar("status").default("live"), // live | ended
  agoraChannel: varchar("agora_channel").notNull(),
  viewerCount: integer("viewer_count").default(0),
  peakViewers: integer("peak_viewers").default(0),
  totalGifts: decimal("total_gifts", { precision: 12, scale: 2 }).default("0"),
  startedAt: timestamp("started_at").defaultNow(),
  endedAt: timestamp("ended_at"),
});

export type LiveStream = typeof liveStreams.$inferSelect;

export const streamMessages = pgTable("stream_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  streamId: varchar("stream_id").references(() => liveStreams.id).notNull(),
  senderId: varchar("sender_id").notNull(),
  senderType: varchar("sender_type").notNull().default("user"), // user | astrologer
  senderName: varchar("sender_name").notNull(),
  type: varchar("type").notNull().default("chat"), // chat | gift | join
  message: text("message"),
  giftName: varchar("gift_name"),
  giftAmount: decimal("gift_amount", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export type StreamMessage = typeof streamMessages.$inferSelect;

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

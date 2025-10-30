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
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table - Required for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table - Required for Replit Auth
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
});

export type InsertKundli = z.infer<typeof insertKundliSchema>;
export type Kundli = typeof kundlis.$inferSelect;

// Astrologers table
export const astrologers = pgTable("astrologers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  email: varchar("email").unique(),
  profileImageUrl: varchar("profile_image_url"),
  specializations: text("specializations").array(),
  experience: integer("experience"),
  rating: decimal("rating", { precision: 3, scale: 2 }),
  totalConsultations: integer("total_consultations").default(0),
  pricePerMinute: decimal("price_per_minute", { precision: 10, scale: 2 }),
  availability: varchar("availability").default("available"),
  languages: text("languages").array(),
  about: text("about"),
  certifications: text("certifications").array(),
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

// Transactions table
export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  type: varchar("type").notNull(),
  description: text("description"),
  status: varchar("status").default("completed"),
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
  sender: varchar("sender").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  kundlis: many(kundlis),
  wallet: one(wallets),
  transactions: many(transactions),
  chatMessages: many(chatMessages),
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

export const astrologersRelations = relations(astrologers, ({ many }) => ({
  chatMessages: many(chatMessages),
}));

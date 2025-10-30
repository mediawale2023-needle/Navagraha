import {
  users,
  kundlis,
  astrologers,
  wallets,
  transactions,
  chatMessages,
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
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Kundli operations
  createKundli(kundli: InsertKundli): Promise<Kundli>;
  getUserKundlis(userId: string): Promise<Kundli[]>;
  getKundliById(id: string): Promise<Kundli | undefined>;
  
  // Astrologer operations
  createAstrologer(astrologer: InsertAstrologer): Promise<Astrologer>;
  getAllAstrologers(): Promise<Astrologer[]>;
  getAstrologerById(id: string): Promise<Astrologer | undefined>;
  
  // Wallet operations
  getWallet(userId: string): Promise<Wallet | undefined>;
  createWallet(userId: string): Promise<Wallet>;
  updateWalletBalance(userId: string, amount: string): Promise<Wallet>;
  
  // Transaction operations
  createTransaction(transaction: InsertTransaction): Promise<Transaction>;
  getUserTransactions(userId: string): Promise<Transaction[]>;
  
  // Chat operations
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  getChatMessages(userId: string, astrologerId: string): Promise<ChatMessage[]>;
}

export class DatabaseStorage implements IStorage {
  // User operations
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
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Kundli operations
  async createKundli(kundliData: InsertKundli): Promise<Kundli> {
    const [kundli] = await db
      .insert(kundlis)
      .values(kundliData)
      .returning();
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
    const [kundli] = await db
      .select()
      .from(kundlis)
      .where(eq(kundlis.id, id));
    return kundli;
  }

  // Astrologer operations
  async createAstrologer(astrologerData: InsertAstrologer): Promise<Astrologer> {
    const [astrologer] = await db
      .insert(astrologers)
      .values(astrologerData)
      .returning();
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

  // Wallet operations
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
      .set({ 
        balance: amount,
        updatedAt: new Date()
      })
      .where(eq(wallets.userId, userId))
      .returning();
    return wallet;
  }

  // Transaction operations
  async createTransaction(transactionData: InsertTransaction): Promise<Transaction> {
    const [transaction] = await db
      .insert(transactions)
      .values(transactionData)
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

  // Chat operations
  async createChatMessage(messageData: InsertChatMessage): Promise<ChatMessage> {
    const [message] = await db
      .insert(chatMessages)
      .values(messageData)
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
}

export const storage = new DatabaseStorage();

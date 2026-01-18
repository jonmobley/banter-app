import { type User, type InsertUser, type Contact, type InsertContact, contacts, type ExpectedParticipant, type InsertExpectedParticipant, type UpdateExpectedParticipant, expectedParticipants, verificationCodes, type ScheduledBanter, type InsertScheduledBanter, type UpdateScheduledBanter, scheduledBanters } from "@shared/schema";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, gt, lt, lte, sql } from "drizzle-orm";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Unexpected database pool error:', err);
});

export const db = drizzle(pool);

export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const result = await db.execute(sql`SELECT 1 as test`);
    console.log("Database connection test successful");
    return true;
  } catch (error) {
    console.error("Database connection test failed:", error);
    return false;
  }
}

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Contacts
  getContacts(): Promise<Contact[]>;
  getContactByPhone(phone: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  deleteContact(id: string): Promise<void>;
  
  // Expected Participants
  getExpectedParticipants(): Promise<ExpectedParticipant[]>;
  getExpectedParticipant(id: string): Promise<ExpectedParticipant | undefined>;
  addExpectedParticipant(participant: InsertExpectedParticipant): Promise<ExpectedParticipant>;
  updateExpectedParticipant(id: string, data: UpdateExpectedParticipant): Promise<ExpectedParticipant | undefined>;
  removeExpectedParticipant(id: string): Promise<void>;
  
  // Verification codes
  createVerificationCode(phone: string, code: string, expiresAt: Date): Promise<void>;
  verifyCode(phone: string, code: string): Promise<boolean>;
  deleteVerificationCodes(phone: string): Promise<void>;
  
  // Scheduled Banters
  getScheduledBanters(): Promise<ScheduledBanter[]>;
  getScheduledBanter(id: string): Promise<ScheduledBanter | undefined>;
  createScheduledBanter(banter: InsertScheduledBanter): Promise<ScheduledBanter>;
  updateScheduledBanter(id: string, data: UpdateScheduledBanter): Promise<ScheduledBanter | undefined>;
  deleteScheduledBanter(id: string): Promise<void>;
  getPendingBantersForTime(time: Date): Promise<ScheduledBanter[]>;
  getBantersNeedingReminder(time: Date): Promise<ScheduledBanter[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    return undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    return { ...insertUser, id };
  }

  async getContacts(): Promise<Contact[]> {
    return await db.select().from(contacts);
  }

  async getContactByPhone(phone: string): Promise<Contact | undefined> {
    // Normalize phone for matching
    const normalizedPhone = phone.replace(/\D/g, '');
    const allContacts = await db.select().from(contacts);
    return allContacts.find(c => c.phone.replace(/\D/g, '') === normalizedPhone || 
                                  c.phone.replace(/\D/g, '').endsWith(normalizedPhone) ||
                                  normalizedPhone.endsWith(c.phone.replace(/\D/g, '')));
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    const [newContact] = await db.insert(contacts).values(contact).returning();
    return newContact;
  }

  async deleteContact(id: string): Promise<void> {
    await db.delete(contacts).where(eq(contacts.id, id));
  }

  async getExpectedParticipants(): Promise<ExpectedParticipant[]> {
    return await db.select().from(expectedParticipants);
  }

  async getExpectedParticipant(id: string): Promise<ExpectedParticipant | undefined> {
    const [participant] = await db.select().from(expectedParticipants).where(eq(expectedParticipants.id, id));
    return participant;
  }

  async addExpectedParticipant(participant: InsertExpectedParticipant): Promise<ExpectedParticipant> {
    const [newParticipant] = await db.insert(expectedParticipants).values(participant).returning();
    return newParticipant;
  }

  async updateExpectedParticipant(id: string, data: UpdateExpectedParticipant): Promise<ExpectedParticipant | undefined> {
    const [updated] = await db.update(expectedParticipants).set(data).where(eq(expectedParticipants.id, id)).returning();
    return updated;
  }

  async removeExpectedParticipant(id: string): Promise<void> {
    await db.delete(expectedParticipants).where(eq(expectedParticipants.id, id));
  }

  async createVerificationCode(phone: string, code: string, expiresAt: Date): Promise<void> {
    // Delete any existing codes for this phone first
    await db.delete(verificationCodes).where(eq(verificationCodes.phone, phone));
    // Insert new code
    await db.insert(verificationCodes).values({ phone, code, expiresAt });
  }

  async verifyCode(phone: string, code: string): Promise<boolean> {
    const now = new Date();
    const [match] = await db.select().from(verificationCodes).where(
      and(
        eq(verificationCodes.phone, phone),
        eq(verificationCodes.code, code),
        gt(verificationCodes.expiresAt, now)
      )
    );
    return !!match;
  }

  async deleteVerificationCodes(phone: string): Promise<void> {
    await db.delete(verificationCodes).where(eq(verificationCodes.phone, phone));
  }

  async getScheduledBanters(): Promise<ScheduledBanter[]> {
    return await db.select().from(scheduledBanters);
  }

  async getScheduledBanter(id: string): Promise<ScheduledBanter | undefined> {
    const [banter] = await db.select().from(scheduledBanters).where(eq(scheduledBanters.id, id));
    return banter;
  }

  async createScheduledBanter(banter: InsertScheduledBanter): Promise<ScheduledBanter> {
    const [newBanter] = await db.insert(scheduledBanters).values(banter).returning();
    return newBanter;
  }

  async updateScheduledBanter(id: string, data: UpdateScheduledBanter): Promise<ScheduledBanter | undefined> {
    const [updated] = await db.update(scheduledBanters).set(data).where(eq(scheduledBanters.id, id)).returning();
    return updated;
  }

  async deleteScheduledBanter(id: string): Promise<void> {
    await db.delete(scheduledBanters).where(eq(scheduledBanters.id, id));
  }

  async getPendingBantersForTime(time: Date): Promise<ScheduledBanter[]> {
    // Get banters that are pending and scheduled at or before the given time
    return await db.select().from(scheduledBanters).where(
      and(
        eq(scheduledBanters.status, 'pending'),
        lte(scheduledBanters.scheduledAt, time)
      )
    );
  }

  async getBantersNeedingReminder(time: Date): Promise<ScheduledBanter[]> {
    // Get banters that need a reminder (5 min before start, reminder enabled, still pending)
    const fiveMinutesFromNow = new Date(time.getTime() + 5 * 60 * 1000);
    return await db.select().from(scheduledBanters).where(
      and(
        eq(scheduledBanters.status, 'pending'),
        eq(scheduledBanters.reminderEnabled, 'true'),
        lte(scheduledBanters.scheduledAt, fiveMinutesFromNow),
        gt(scheduledBanters.scheduledAt, time)
      )
    );
  }
}

export const storage = new DatabaseStorage();

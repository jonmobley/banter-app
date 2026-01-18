import { type User, type InsertUser, type Contact, type InsertContact, contacts, type ExpectedParticipant, type InsertExpectedParticipant, expectedParticipants } from "@shared/schema";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import pg from "pg";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool);

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
  addExpectedParticipant(participant: InsertExpectedParticipant): Promise<ExpectedParticipant>;
  removeExpectedParticipant(id: string): Promise<void>;
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

  async addExpectedParticipant(participant: InsertExpectedParticipant): Promise<ExpectedParticipant> {
    const [newParticipant] = await db.insert(expectedParticipants).values(participant).returning();
    return newParticipant;
  }

  async removeExpectedParticipant(id: string): Promise<void> {
    await db.delete(expectedParticipants).where(eq(expectedParticipants.id, id));
  }
}

export const storage = new DatabaseStorage();

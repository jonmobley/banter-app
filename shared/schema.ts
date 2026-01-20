import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
});

export const insertContactSchema = createInsertSchema(contacts).pick({
  name: true,
  phone: true,
});

export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

export const participantRoles = ['host', 'participant', 'listener'] as const;
export type ParticipantRole = typeof participantRoles[number];

export const expectedParticipants = pgTable("expected_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  role: text("role").notNull().default('participant'),
});

export const insertExpectedParticipantSchema = createInsertSchema(expectedParticipants).pick({
  name: true,
  phone: true,
  email: true,
  role: true,
});

export const updateExpectedParticipantSchema = createInsertSchema(expectedParticipants).pick({
  name: true,
  phone: true,
  email: true,
  role: true,
}).partial();

export type InsertExpectedParticipant = z.infer<typeof insertExpectedParticipantSchema>;
export type UpdateExpectedParticipant = z.infer<typeof updateExpectedParticipantSchema>;
export type ExpectedParticipant = typeof expectedParticipants.$inferSelect;

export const verificationCodes = pgTable("verification_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phone: text("phone").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const insertVerificationCodeSchema = createInsertSchema(verificationCodes).pick({
  phone: true,
  code: true,
  expiresAt: true,
});

export type InsertVerificationCode = z.infer<typeof insertVerificationCodeSchema>;
export type VerificationCode = typeof verificationCodes.$inferSelect;

// Utility function for normalizing phone numbers to E.164 format
export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    digits = '1' + digits;
  }
  if (!digits.startsWith('1') && digits.length === 10) {
    digits = '1' + digits;
  }
  return '+' + digits;
}

// Scheduled Banters
export const scheduledBanters = pgTable("scheduled_banters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  autoCallEnabled: text("auto_call_enabled").notNull().default('false'),
  reminderEnabled: text("reminder_enabled").notNull().default('false'),
  reminderSentAt: timestamp("reminder_sent_at"),
  status: text("status").notNull().default('pending'), // pending, active, completed, cancelled
  participantIds: text("participant_ids").array().notNull().default(sql`ARRAY[]::text[]`),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertScheduledBanterSchema = createInsertSchema(scheduledBanters).pick({
  name: true,
  scheduledAt: true,
  autoCallEnabled: true,
  reminderEnabled: true,
  participantIds: true,
});

export const updateScheduledBanterSchema = createInsertSchema(scheduledBanters).pick({
  name: true,
  scheduledAt: true,
  autoCallEnabled: true,
  reminderEnabled: true,
  reminderSentAt: true,
  status: true,
  participantIds: true,
}).partial();

export type InsertScheduledBanter = z.infer<typeof insertScheduledBanterSchema>;
export type UpdateScheduledBanter = z.infer<typeof updateScheduledBanterSchema>;
export type ScheduledBanter = typeof scheduledBanters.$inferSelect;

// Beta Access Requests
export const betaRequests = pgTable("beta_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertBetaRequestSchema = createInsertSchema(betaRequests).pick({
  email: true,
});

export type InsertBetaRequest = z.infer<typeof insertBetaRequestSchema>;
export type BetaRequest = typeof betaRequests.$inferSelect;

// Contact Groups
export const groups = pgTable("groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertGroupSchema = createInsertSchema(groups).pick({
  name: true,
});

export type InsertGroup = z.infer<typeof insertGroupSchema>;
export type Group = typeof groups.$inferSelect;

// Group Members (junction table)
export const groupMembers = pgTable("group_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  groupId: varchar("group_id").notNull(),
  participantId: varchar("participant_id").notNull(),
});

export const insertGroupMemberSchema = createInsertSchema(groupMembers).pick({
  groupId: true,
  participantId: true,
});

export type InsertGroupMember = z.infer<typeof insertGroupMemberSchema>;
export type GroupMember = typeof groupMembers.$inferSelect;

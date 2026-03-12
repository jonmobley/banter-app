import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const contacts = pgTable("contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phone: text("phone").notNull().unique(),
  email: text("email"),
});

export const insertContactSchema = createInsertSchema(contacts).pick({
  name: true,
  phone: true,
  email: true,
});

export type InsertContact = z.infer<typeof insertContactSchema>;
export type Contact = typeof contacts.$inferSelect;

export const participantRoles = ['host', 'participant', 'listener'] as const;
export type ParticipantRole = typeof participantRoles[number];

export const expectedParticipants = pgTable("expected_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(''),
  email: text("email"),
  role: text("role").notNull().default('participant'),
  banterId: varchar("banter_id"),
});

export const insertExpectedParticipantSchema = createInsertSchema(expectedParticipants).pick({
  name: true,
  phone: true,
  email: true,
  role: true,
  banterId: true,
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
  phone: text("phone"),
  email: text("email"),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const insertVerificationCodeSchema = createInsertSchema(verificationCodes).pick({
  phone: true,
  email: true,
  code: true,
  expiresAt: true,
});

export type InsertVerificationCode = z.infer<typeof insertVerificationCodeSchema>;
export type VerificationCode = typeof verificationCodes.$inferSelect;

export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    digits = '1' + digits;
  }
  return '+' + digits;
}

export const scheduledBanters = pgTable("scheduled_banters", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  scheduledAt: timestamp("scheduled_at").notNull(),
  autoCallEnabled: text("auto_call_enabled").notNull().default('false'),
  reminderEnabled: text("reminder_enabled").notNull().default('false'),
  reminderSentAt: timestamp("reminder_sent_at"),
  status: text("status").notNull().default('pending'),
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

export const channels = pgTable("channels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  number: integer("number").notNull(),
  name: text("name").notNull(),
  banterId: varchar("banter_id"),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertChannelSchema = createInsertSchema(channels).pick({
  number: true,
  name: true,
  banterId: true,
});

export type InsertChannel = z.infer<typeof insertChannelSchema>;
export type Channel = typeof channels.$inferSelect;

export const channelAssignments = pgTable("channel_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  channelId: varchar("channel_id").notNull(),
  participantIdentity: text("participant_identity").notNull(),
  banterId: varchar("banter_id"),
});

export const insertChannelAssignmentSchema = createInsertSchema(channelAssignments).pick({
  channelId: true,
  participantIdentity: true,
  banterId: true,
});

export type InsertChannelAssignment = z.infer<typeof insertChannelAssignmentSchema>;
export type ChannelAssignment = typeof channelAssignments.$inferSelect;

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phone: text("phone").unique(),
  email: text("email").unique(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertUserSchema = createInsertSchema(users).pick({
  name: true,
  phone: true,
  email: true,
});

export const updateUserSchema = createInsertSchema(users).pick({
  name: true,
  phone: true,
  email: true,
}).partial();

export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type User = typeof users.$inferSelect;

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  banterId: varchar("banter_id"),
  senderIdentity: text("sender_identity").notNull(),
  senderName: text("sender_name").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().default(sql`now()`),
});

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});

export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export function generateSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

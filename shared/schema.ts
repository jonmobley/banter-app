import { sql } from "drizzle-orm";
import { pgTable, text, varchar } from "drizzle-orm/pg-core";
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

export const expectedParticipants = pgTable("expected_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
});

export const insertExpectedParticipantSchema = createInsertSchema(expectedParticipants).pick({
  name: true,
  phone: true,
  email: true,
});

export const updateExpectedParticipantSchema = createInsertSchema(expectedParticipants).pick({
  name: true,
  phone: true,
  email: true,
}).partial();

export type InsertExpectedParticipant = z.infer<typeof insertExpectedParticipantSchema>;
export type UpdateExpectedParticipant = z.infer<typeof updateExpectedParticipantSchema>;
export type ExpectedParticipant = typeof expectedParticipants.$inferSelect;

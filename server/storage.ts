import { type Contact, type InsertContact, contacts, type ExpectedParticipant, type InsertExpectedParticipant, type UpdateExpectedParticipant, expectedParticipants, verificationCodes, type ScheduledBanter, type InsertScheduledBanter, type UpdateScheduledBanter, scheduledBanters, betaRequests, type Group, type InsertGroup, groups, type GroupMember, groupMembers, type Channel, type InsertChannel, channels, type ChannelAssignment, channelAssignments, normalizePhone, generateSlug } from "@shared/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, and, gt, lt, lte, sql, isNull } from "drizzle-orm";
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
  getContacts(): Promise<Contact[]>;
  getContactByPhone(phone: string): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  deleteContact(id: string): Promise<void>;
  
  getExpectedParticipants(banterId?: string | null): Promise<ExpectedParticipant[]>;
  getExpectedParticipant(id: string): Promise<ExpectedParticipant | undefined>;
  addExpectedParticipant(participant: InsertExpectedParticipant): Promise<ExpectedParticipant>;
  updateExpectedParticipant(id: string, data: UpdateExpectedParticipant): Promise<ExpectedParticipant | undefined>;
  removeExpectedParticipant(id: string): Promise<void>;
  
  createVerificationCode(phone: string, code: string, expiresAt: Date): Promise<void>;
  verifyCode(phone: string, code: string): Promise<boolean>;
  deleteVerificationCodes(phone: string): Promise<void>;
  
  createEmailVerificationCode(email: string, code: string, expiresAt: Date): Promise<void>;
  verifyEmailCode(email: string, code: string): Promise<boolean>;
  deleteEmailVerificationCodes(email: string): Promise<void>;
  
  getScheduledBanters(): Promise<ScheduledBanter[]>;
  getScheduledBanter(id: string): Promise<ScheduledBanter | undefined>;
  getScheduledBanterBySlug(slug: string): Promise<ScheduledBanter | undefined>;
  createScheduledBanter(banter: InsertScheduledBanter): Promise<ScheduledBanter>;
  updateScheduledBanter(id: string, data: UpdateScheduledBanter): Promise<ScheduledBanter | undefined>;
  deleteScheduledBanter(id: string): Promise<void>;
  getPendingBantersForTime(time: Date): Promise<ScheduledBanter[]>;
  getBantersNeedingReminder(time: Date): Promise<ScheduledBanter[]>;
  
  createBetaRequest(email: string): Promise<void>;
  getBetaRequests(): Promise<{ id: string; email: string; createdAt: Date }[]>;
  
  getGroups(): Promise<Group[]>;
  getGroup(id: string): Promise<Group | undefined>;
  createGroup(group: InsertGroup): Promise<Group>;
  updateGroup(id: string, name: string): Promise<Group | undefined>;
  deleteGroup(id: string): Promise<void>;
  getGroupMembers(groupId: string): Promise<GroupMember[]>;
  addGroupMember(groupId: string, participantId: string): Promise<GroupMember>;
  removeGroupMember(groupId: string, participantId: string): Promise<void>;
  getGroupsWithMembers(): Promise<(Group & { memberIds: string[] })[]>;
  
  getChannels(banterId?: string | null): Promise<Channel[]>;
  getChannel(id: string): Promise<Channel | undefined>;
  createChannel(channel: InsertChannel): Promise<Channel>;
  updateChannel(id: string, number: number, name: string): Promise<Channel | undefined>;
  deleteChannel(id: string): Promise<void>;
  getChannelAssignments(banterId?: string | null): Promise<ChannelAssignment[]>;
  assignToChannel(channelId: string, participantIdentity: string, banterId?: string | null): Promise<ChannelAssignment>;
  removeFromChannel(participantIdentity: string, banterId?: string | null): Promise<void>;
  getParticipantChannel(participantIdentity: string, banterId?: string | null): Promise<Channel | undefined>;
}

export class DatabaseStorage implements IStorage {

  async getContacts(): Promise<Contact[]> {
    return await db.select().from(contacts);
  }

  async getContactByPhone(phone: string): Promise<Contact | undefined> {
    const normalized = normalizePhone(phone);
    const allContacts = await db.select().from(contacts);
    return allContacts.find(c => normalizePhone(c.phone) === normalized);
  }

  async createContact(contact: InsertContact): Promise<Contact> {
    const [newContact] = await db.insert(contacts).values(contact).returning();
    return newContact;
  }

  async deleteContact(id: string): Promise<void> {
    await db.delete(contacts).where(eq(contacts.id, id));
  }

  async getExpectedParticipants(banterId?: string | null): Promise<ExpectedParticipant[]> {
    if (banterId) {
      return await db.select().from(expectedParticipants).where(eq(expectedParticipants.banterId, banterId));
    }
    return await db.select().from(expectedParticipants).where(isNull(expectedParticipants.banterId));
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
    await db.transaction(async (tx) => {
      await tx.delete(groupMembers).where(eq(groupMembers.participantId, id));
      await tx.delete(expectedParticipants).where(eq(expectedParticipants.id, id));
    });
  }

  async createVerificationCode(phone: string, code: string, expiresAt: Date): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(verificationCodes).where(eq(verificationCodes.phone, phone));
      await tx.insert(verificationCodes).values({ phone, code, expiresAt });
    });
  }

  async createEmailVerificationCode(email: string, code: string, expiresAt: Date): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(verificationCodes).where(eq(verificationCodes.email, email));
      await tx.insert(verificationCodes).values({ email, code, expiresAt });
    });
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

  async verifyEmailCode(email: string, code: string): Promise<boolean> {
    const now = new Date();
    const [match] = await db.select().from(verificationCodes).where(
      and(
        eq(verificationCodes.email, email),
        eq(verificationCodes.code, code),
        gt(verificationCodes.expiresAt, now)
      )
    );
    return !!match;
  }

  async deleteVerificationCodes(phone: string): Promise<void> {
    await db.delete(verificationCodes).where(eq(verificationCodes.phone, phone));
  }

  async deleteEmailVerificationCodes(email: string): Promise<void> {
    await db.delete(verificationCodes).where(eq(verificationCodes.email, email));
  }

  async getScheduledBanters(): Promise<ScheduledBanter[]> {
    return await db.select().from(scheduledBanters);
  }

  async getScheduledBanter(id: string): Promise<ScheduledBanter | undefined> {
    const [banter] = await db.select().from(scheduledBanters).where(eq(scheduledBanters.id, id));
    return banter;
  }

  async getScheduledBanterBySlug(slug: string): Promise<ScheduledBanter | undefined> {
    const [banter] = await db.select().from(scheduledBanters).where(eq(scheduledBanters.slug, slug));
    return banter;
  }

  async createScheduledBanter(banter: InsertScheduledBanter): Promise<ScheduledBanter> {
    const slug = generateSlug();
    const [newBanter] = await db.insert(scheduledBanters).values({ ...banter, slug }).returning();
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
    return await db.select().from(scheduledBanters).where(
      and(
        eq(scheduledBanters.status, 'pending'),
        lte(scheduledBanters.scheduledAt, time)
      )
    );
  }

  async getBantersNeedingReminder(time: Date): Promise<ScheduledBanter[]> {
    const fifteenMinutesFromNow = new Date(time.getTime() + 15 * 60 * 1000);
    const results = await db.select().from(scheduledBanters).where(
      and(
        eq(scheduledBanters.status, 'pending'),
        eq(scheduledBanters.reminderEnabled, 'true'),
        lte(scheduledBanters.scheduledAt, fifteenMinutesFromNow),
        gt(scheduledBanters.scheduledAt, time)
      )
    );
    return results.filter(b => b.reminderSentAt === null);
  }

  async getBetaRequests(): Promise<{ id: string; email: string; createdAt: Date }[]> {
    return await db.select().from(betaRequests).orderBy(betaRequests.createdAt);
  }

  async createBetaRequest(email: string): Promise<void> {
    await db.insert(betaRequests).values({ email });
  }

  async getGroups(): Promise<Group[]> {
    return await db.select().from(groups).orderBy(groups.name);
  }

  async getGroup(id: string): Promise<Group | undefined> {
    const [group] = await db.select().from(groups).where(eq(groups.id, id));
    return group;
  }

  async createGroup(group: InsertGroup): Promise<Group> {
    const [newGroup] = await db.insert(groups).values(group).returning();
    return newGroup;
  }

  async updateGroup(id: string, name: string): Promise<Group | undefined> {
    const [updated] = await db.update(groups).set({ name }).where(eq(groups.id, id)).returning();
    return updated;
  }

  async deleteGroup(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(groupMembers).where(eq(groupMembers.groupId, id));
      await tx.delete(groups).where(eq(groups.id, id));
    });
  }

  async getGroupMembers(groupId: string): Promise<GroupMember[]> {
    return await db.select().from(groupMembers).where(eq(groupMembers.groupId, groupId));
  }

  async addGroupMember(groupId: string, participantId: string): Promise<GroupMember> {
    const [member] = await db.insert(groupMembers).values({ groupId, participantId }).returning();
    return member;
  }

  async removeGroupMember(groupId: string, participantId: string): Promise<void> {
    await db.delete(groupMembers).where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.participantId, participantId)
      )
    );
  }

  async getGroupsWithMembers(): Promise<(Group & { memberIds: string[] })[]> {
    const allGroups = await this.getGroups();
    const allMembers = await db.select().from(groupMembers);
    
    return allGroups.map(group => ({
      ...group,
      memberIds: allMembers.filter(m => m.groupId === group.id).map(m => m.participantId)
    }));
  }

  async getChannels(banterId?: string | null): Promise<Channel[]> {
    if (banterId) {
      return await db.select().from(channels).where(eq(channels.banterId, banterId)).orderBy(channels.number);
    }
    return await db.select().from(channels).where(isNull(channels.banterId)).orderBy(channels.number);
  }

  async getChannel(id: string): Promise<Channel | undefined> {
    const [channel] = await db.select().from(channels).where(eq(channels.id, id));
    return channel;
  }

  async createChannel(channel: InsertChannel): Promise<Channel> {
    const [newChannel] = await db.insert(channels).values(channel).returning();
    return newChannel;
  }

  async updateChannel(id: string, number: number, name: string): Promise<Channel | undefined> {
    const [updated] = await db.update(channels).set({ number, name }).where(eq(channels.id, id)).returning();
    return updated;
  }

  async deleteChannel(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(channelAssignments).where(eq(channelAssignments.channelId, id));
      await tx.delete(channels).where(eq(channels.id, id));
    });
  }

  async getChannelAssignments(banterId?: string | null): Promise<ChannelAssignment[]> {
    if (banterId) {
      return await db.select().from(channelAssignments).where(eq(channelAssignments.banterId, banterId));
    }
    return await db.select().from(channelAssignments).where(isNull(channelAssignments.banterId));
  }

  async assignToChannel(channelId: string, participantIdentity: string, banterId?: string | null): Promise<ChannelAssignment> {
    const [assignment] = await db.transaction(async (tx) => {
      if (banterId) {
        await tx.delete(channelAssignments).where(
          and(eq(channelAssignments.participantIdentity, participantIdentity), eq(channelAssignments.banterId, banterId))
        );
      } else {
        await tx.delete(channelAssignments).where(
          and(eq(channelAssignments.participantIdentity, participantIdentity), isNull(channelAssignments.banterId))
        );
      }
      return tx.insert(channelAssignments).values({ channelId, participantIdentity, banterId: banterId || null }).returning();
    });
    return assignment;
  }

  async removeFromChannel(participantIdentity: string, banterId?: string | null): Promise<void> {
    if (banterId) {
      await db.delete(channelAssignments).where(
        and(eq(channelAssignments.participantIdentity, participantIdentity), eq(channelAssignments.banterId, banterId))
      );
    } else {
      await db.delete(channelAssignments).where(
        and(eq(channelAssignments.participantIdentity, participantIdentity), isNull(channelAssignments.banterId))
      );
    }
  }

  async getParticipantChannel(participantIdentity: string, banterId?: string | null): Promise<Channel | undefined> {
    let assignment;
    if (banterId) {
      [assignment] = await db.select().from(channelAssignments).where(
        and(eq(channelAssignments.participantIdentity, participantIdentity), eq(channelAssignments.banterId, banterId))
      );
    } else {
      [assignment] = await db.select().from(channelAssignments).where(
        and(eq(channelAssignments.participantIdentity, participantIdentity), isNull(channelAssignments.banterId))
      );
    }
    if (!assignment) return undefined;
    return this.getChannel(assignment.channelId);
  }
}

export const storage = new DatabaseStorage();

/**
 * Banter API Routes
 * 
 * LiveKit-based real-time voice conferencing application.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { log } from "./index";
import { 
  generateToken, 
  getRoomParticipants, 
  muteParticipant, 
  removeParticipant,
  getLiveKitUrl,
  DEFAULT_ROOM_NAME,
  isLiveKitConfigured
} from "./livekit";
import { WebSocketServer, WebSocket } from "ws";
import { normalizePhone } from "@shared/schema";
import crypto from "crypto";

// Secret key for signing auth tokens - must be a strong, persistent secret
let _authSecret: string | null = null;

function getAuthSecret(): string {
  if (_authSecret) return _authSecret;
  
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (process.env.AUTH_TOKEN_SECRET && process.env.AUTH_TOKEN_SECRET.length >= 32) {
    _authSecret = process.env.AUTH_TOKEN_SECRET;
    return _authSecret;
  }
  
  if (isProduction) {
    console.error('FATAL: AUTH_TOKEN_SECRET environment variable is required in production.');
    console.error('Please set AUTH_TOKEN_SECRET to a random 64+ character string.');
    process.exit(1);
  }
  
  console.warn('WARNING: Using derived auth secret. Set AUTH_TOKEN_SECRET in production!');
  const sources = [
    process.env.DATABASE_URL || '',
    process.env.REPLIT_DEV_DOMAIN || 'localhost',
    'banter-auth-dev-v1-2024'
  ];
  _authSecret = crypto.createHash('sha256').update(sources.join('|')).digest('hex');
  return _authSecret;
}

function createAuthToken(phone: string): string {
  const normalizedPhone = normalizePhone(phone);
  const expiry = Date.now() + 24 * 60 * 60 * 1000;
  const data = `${normalizedPhone}:${expiry}`;
  const signature = crypto.createHmac('sha256', getAuthSecret()).update(data).digest('hex');
  return Buffer.from(`${data}:${signature}`).toString('base64');
}

function verifyAuthToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 3) return null;
    
    const [phone, expiryStr, signature] = parts;
    const expiry = parseInt(expiryStr, 10);
    
    if (Date.now() > expiry) {
      log(`Auth token expired for ${phone}`, "auth");
      return null;
    }
    
    const data = `${phone}:${expiryStr}`;
    const expectedSignature = crypto.createHmac('sha256', getAuthSecret()).update(data).digest('hex');
    
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      log(`Invalid auth token signature for ${phone}`, "auth");
      return null;
    }
    
    return phone;
  } catch {
    return null;
  }
}

// Track speaking state for each participant
const speakingState: Map<string, boolean> = new Map();
// Frontend WebSocket clients for real-time updates
const frontendClients: Set<WebSocket> = new Set();

// Broadcast speaking state to all frontend clients
function broadcastSpeakingState() {
  const stateObj: Record<string, boolean> = {};
  speakingState.forEach((speaking, identity) => {
    stateObj[identity] = speaking;
  });
  
  const message = JSON.stringify({ type: 'speaking', data: stateObj });
  frontendClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Broadcast participant events to all frontend clients
function broadcastParticipantEvent(event: string, data: any) {
  const message = JSON.stringify({
    type: 'participant-event',
    data: {
      event,
      ...data,
      timestamp: Date.now()
    }
  });
  
  frontendClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Set up WebSocket server for frontend clients
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws) => {
    log('Frontend WebSocket client connected', 'ws');
    frontendClients.add(ws);
    
    // Send current speaking state on connect
    const stateObj: Record<string, boolean> = {};
    speakingState.forEach((speaking, identity) => {
      stateObj[identity] = speaking;
    });
    ws.send(JSON.stringify({ type: 'speaking', data: stateObj }));
    
    // Handle messages from frontend (speaking state updates)
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'speaking-update' && msg.identity) {
          speakingState.set(msg.identity, msg.speaking);
          broadcastSpeakingState();
        }
      } catch (e) {
        // Ignore parse errors
      }
    });
    
    ws.on('close', () => {
      frontendClients.delete(ws);
      log('Frontend WebSocket client disconnected', 'ws');
    });
  });
  
  /**
   * GET /api/speaking
   * Returns current speaking state for all participants.
   */
  app.get("/api/speaking", (_req, res) => {
    const stateObj: Record<string, boolean> = {};
    speakingState.forEach((speaking, identity) => {
      stateObj[identity] = speaking;
    });
    res.json(stateObj);
  });

  /**
   * GET /api/health
   * Simple health check endpoint.
   */
  app.get("/api/health", (_req, res) => {
    res.json({ 
      status: "ok", 
      service: "banter",
      livekitConfigured: isLiveKitConfigured(),
      timestamp: new Date().toISOString()
    });
  });

  /**
   * POST /api/beta-request
   * Submit an email for beta access waitlist.
   */
  app.post("/api/beta-request", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: "Email is required" });
      }
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
      }
      
      await storage.createBetaRequest(email.toLowerCase().trim());
      log(`📧 New beta request: ${email}`, "beta");
      res.json({ success: true });
    } catch (error: any) {
      if (error.code === '23505') {
        res.json({ success: true });
      } else {
        log(`Error creating beta request: ${error.message}`, "beta");
        res.status(500).json({ error: "Failed to submit request" });
      }
    }
  });

  /**
   * POST /api/beta-requests
   * Get all beta access requests. Requires admin PIN in body.
   */
  app.post("/api/beta-requests", async (req, res) => {
    try {
      const { pin } = req.body;
      const adminPin = process.env.ADMIN_PIN;

      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const requests = await storage.getBetaRequests();
      res.json(requests);
    } catch (error: any) {
      log(`Error fetching beta requests: ${error.message}`, "beta");
      res.status(500).json({ error: "Failed to fetch beta requests" });
    }
  });

  /**
   * POST /api/auth/send-code
   * Send a verification code via SMS using Twilio.
   */
  app.post("/api/auth/send-code", async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) {
        return res.status(400).json({ error: "Phone number is required" });
      }

      const normalizedPhone = normalizePhone(phone);
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      await storage.createVerificationCode(normalizedPhone, code, expiresAt);

      // Send SMS via Twilio
      const { sendVerificationSMS } = await import('./twilio-sms.js');
      const sent = await sendVerificationSMS(normalizedPhone, code);
      
      if (sent) {
        log(`📱 Verification code sent to ${normalizedPhone}`, "auth");
      } else {
        // Fall back to logging in development if SMS fails
        log(`📱 SMS failed, verification code for ${normalizedPhone}: ${code}`, "auth");
      }
      
      res.json({ success: true, message: "Verification code sent" });
    } catch (error: any) {
      log(`Error sending verification code: ${error.message}`, "auth");
      res.status(500).json({ error: "Failed to send verification code" });
    }
  });

  /**
   * POST /api/auth/verify-code
   * Verify the code and return authenticated phone number.
   */
  app.post("/api/auth/verify-code", async (req, res) => {
    try {
      const { phone, code } = req.body;
      if (!phone || !code) {
        return res.status(400).json({ error: "Phone and code are required" });
      }

      const normalizedPhone = normalizePhone(phone);
      const valid = await storage.verifyCode(normalizedPhone, code);
      
      if (!valid) {
        return res.status(401).json({ error: "Invalid or expired code" });
      }

      await storage.deleteVerificationCodes(normalizedPhone);
      const authToken = createAuthToken(normalizedPhone);

      log(`✅ Verified phone ${normalizedPhone}`, "auth");
      res.json({ success: true, phone: normalizedPhone, authToken });
    } catch (error: any) {
      log(`Error verifying code: ${error.message}`, "auth");
      res.status(500).json({ error: "Failed to verify code" });
    }
  });

  /**
   * GET /api/contacts
   * Lists all saved contacts.
   */
  app.get("/api/contacts", async (_req, res) => {
    try {
      const contacts = await storage.getContacts();
      res.json(contacts);
    } catch (error: any) {
      log(`Error fetching contacts: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });

  /**
   * POST /api/contacts
   * Creates a new contact.
   */
  app.post("/api/contacts", async (req, res) => {
    try {
      const { name, phone } = req.body;
      if (!name || !phone) {
        return res.status(400).json({ error: "Name and phone are required" });
      }
      const contact = await storage.createContact({ name, phone });
      res.json(contact);
    } catch (error: any) {
      log(`Error creating contact: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to create contact" });
    }
  });

  /**
   * DELETE /api/contacts/:id
   * Deletes a contact by ID.
   */
  app.delete("/api/contacts/:id", async (req, res) => {
    try {
      await storage.deleteContact(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      log(`Error deleting contact: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to delete contact" });
    }
  });

  /**
   * GET /api/participants
   * Fetches current participants in the LiveKit room.
   */
  app.get("/api/participants", async (_req, res) => {
    try {
      const participants = await getRoomParticipants();
      
      if (participants.length === 0) {
        return res.json({ 
          count: 0, 
          participants: [],
          conferenceActive: false
        });
      }

      const participantList = participants.map(p => {
        // Check actual track state for mute status
        // LiveKit tracks have type as enum: AUDIO=1, VIDEO=2, DATA=3
        // and source as enum: CAMERA=0, MICROPHONE=1, SCREEN_SHARE=2, etc
        const audioTracks = p.tracks?.filter(t => 
          (t.type === 1 || String(t.type) === 'AUDIO') && 
          (t.source === 1 || String(t.source) === 'MICROPHONE')
        ) || [];
        const hasActiveAudio = audioTracks.some(t => !t.muted);
        
        return {
          identity: p.identity,
          name: p.name || p.identity,
          muted: !hasActiveAudio,
          joinedAt: p.joinedAt ? Number(p.joinedAt) : Date.now()
        };
      });

      res.json({ 
        count: participants.length, 
        participants: participantList,
        conferenceActive: true,
        roomName: DEFAULT_ROOM_NAME
      });
    } catch (error: any) {
      log(`Error fetching participants: ${error.message}`, "livekit");
      res.status(500).json({ 
        error: "Failed to fetch participants",
        count: 0,
        participants: [],
        conferenceActive: false
      });
    }
  });

  /**
   * POST /api/admin/verify
   * Verifies the admin PIN code.
   */
  app.post("/api/admin/verify", (req, res) => {
    const { pin } = req.body;
    const adminPin = process.env.ADMIN_PIN;
    
    if (!adminPin) {
      log("ADMIN_PIN not configured", "api");
      return res.status(500).json({ error: "Admin PIN not configured" });
    }
    
    if (pin === adminPin) {
      log("Admin PIN verified successfully", "api");
      return res.json({ success: true });
    } else {
      log("Invalid admin PIN attempt", "api");
      return res.status(401).json({ error: "Invalid PIN" });
    }
  });

  /**
   * POST /api/admin/mute
   * Mutes or unmutes a participant in the room.
   */
  app.post("/api/admin/mute", async (req, res) => {
    try {
      const { pin, identity, muted } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!identity || typeof muted !== 'boolean') {
        return res.status(400).json({ error: "identity and muted are required" });
      }
      
      await muteParticipant(identity, muted);
      
      log(`Participant ${identity} ${muted ? 'muted' : 'unmuted'} by admin`, "livekit");
      
      res.json({ success: true, identity, muted });
    } catch (error: any) {
      log(`Error muting participant: ${error.message}`, "livekit");
      res.status(500).json({ error: "Failed to update mute status" });
    }
  });

  /**
   * POST /api/admin/kick
   * Removes a participant from the room.
   */
  app.post("/api/admin/kick", async (req, res) => {
    try {
      const { pin, identity } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!identity) {
        return res.status(400).json({ error: "identity is required" });
      }
      
      await removeParticipant(identity);
      
      log(`Participant ${identity} removed by admin`, "livekit");
      
      res.json({ success: true, identity });
    } catch (error: any) {
      log(`Error removing participant: ${error.message}`, "livekit");
      res.status(500).json({ error: "Failed to remove participant" });
    }
  });

  /**
   * GET /api/expected
   * Lists all expected participants.
   */
  app.get("/api/expected", async (_req, res) => {
    try {
      const expected = await storage.getExpectedParticipants();
      res.json(expected);
    } catch (error: any) {
      log(`Error fetching expected participants: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to fetch expected participants" });
    }
  });

  /**
   * POST /api/expected
   * Adds an expected participant. Requires admin PIN.
   */
  app.post("/api/expected", async (req, res) => {
    try {
      const { pin, name, phone } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!name || !phone) {
        return res.status(400).json({ error: "Name and phone are required" });
      }
      const participant = await storage.addExpectedParticipant({ name, phone });
      res.json(participant);
    } catch (error: any) {
      log(`Error adding expected participant: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to add expected participant" });
    }
  });

  /**
   * DELETE /api/expected/:id
   * Removes an expected participant. Requires admin PIN.
   */
  app.delete("/api/expected/:id", async (req, res) => {
    try {
      const { pin } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      await storage.removeExpectedParticipant(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      log(`Error removing expected participant: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to remove expected participant" });
    }
  });

  /**
   * PATCH /api/expected/:id
   * Updates an expected participant's details. Requires admin PIN.
   */
  app.patch("/api/expected/:id", async (req, res) => {
    try {
      const { pin, name, phone, email, role } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const validRoles = ['host', 'participant', 'listener'];
      if (role !== undefined && !validRoles.includes(role)) {
        return res.status(400).json({ error: "Invalid role. Must be host, participant, or listener" });
      }
      
      const updateData: { name?: string; phone?: string; email?: string; role?: string } = {};
      if (name !== undefined) updateData.name = name;
      if (phone !== undefined) updateData.phone = phone;
      if (email !== undefined) updateData.email = email;
      if (role !== undefined) updateData.role = role;
      
      const updated = await storage.updateExpectedParticipant(req.params.id, updateData);
      
      if (!updated) {
        return res.status(404).json({ error: "Participant not found" });
      }
      
      res.json(updated);
    } catch (error: any) {
      log(`Error updating expected participant: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to update expected participant" });
    }
  });

  /**
   * GET /api/groups
   * Lists all groups with their member IDs.
   */
  app.get("/api/groups", async (_req, res) => {
    try {
      const groups = await storage.getGroupsWithMembers();
      res.json(groups);
    } catch (error: any) {
      log(`Error fetching groups: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to fetch groups" });
    }
  });

  /**
   * POST /api/groups
   * Creates a new group. Requires admin PIN.
   */
  app.post("/api/groups", async (req, res) => {
    try {
      const { pin, name } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: "Group name is required" });
      }
      
      const group = await storage.createGroup({ name: name.trim() });
      res.json({ ...group, memberIds: [] });
    } catch (error: any) {
      log(`Error creating group: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to create group" });
    }
  });

  /**
   * PATCH /api/groups/:id
   * Updates a group name. Requires admin PIN.
   */
  app.patch("/api/groups/:id", async (req, res) => {
    try {
      const { pin, name } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: "Group name is required" });
      }
      
      const updated = await storage.updateGroup(req.params.id, name.trim());
      
      if (!updated) {
        return res.status(404).json({ error: "Group not found" });
      }
      
      const members = await storage.getGroupMembers(req.params.id);
      res.json({ ...updated, memberIds: members.map(m => m.participantId) });
    } catch (error: any) {
      log(`Error updating group: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to update group" });
    }
  });

  /**
   * DELETE /api/groups/:id
   * Deletes a group. Requires admin PIN.
   */
  app.delete("/api/groups/:id", async (req, res) => {
    try {
      const { pin } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      await storage.deleteGroup(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      log(`Error deleting group: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to delete group" });
    }
  });

  /**
   * POST /api/groups/:id/members
   * Adds a member to a group. Requires admin PIN.
   */
  app.post("/api/groups/:id/members", async (req, res) => {
    try {
      const { pin, participantId } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!participantId) {
        return res.status(400).json({ error: "Participant ID is required" });
      }
      
      await storage.addGroupMember(req.params.id, participantId);
      
      const group = await storage.getGroup(req.params.id);
      const members = await storage.getGroupMembers(req.params.id);
      res.json({ ...group, memberIds: members.map(m => m.participantId) });
    } catch (error: any) {
      log(`Error adding group member: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to add group member" });
    }
  });

  /**
   * DELETE /api/groups/:id/members/:participantId
   * Removes a member from a group. Requires admin PIN.
   */
  app.delete("/api/groups/:id/members/:participantId", async (req, res) => {
    try {
      const { pin } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      await storage.removeGroupMember(req.params.id, req.params.participantId);
      
      const group = await storage.getGroup(req.params.id);
      const members = await storage.getGroupMembers(req.params.id);
      res.json({ ...group, memberIds: members.map(m => m.participantId) });
    } catch (error: any) {
      log(`Error removing group member: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to remove group member" });
    }
  });

  // ========== CHANNEL ROUTES ==========

  /**
   * GET /api/channels
   * Lists all channels with their assignments.
   */
  app.get("/api/channels", async (_req, res) => {
    try {
      const allChannels = await storage.getChannels();
      const allAssignments = await storage.getChannelAssignments();
      
      const channelsWithAssignments = allChannels.map(channel => ({
        ...channel,
        participants: allAssignments
          .filter(a => a.channelId === channel.id)
          .map(a => a.participantIdentity)
      }));
      
      res.json(channelsWithAssignments);
    } catch (error: any) {
      log(`Error fetching channels: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to fetch channels" });
    }
  });

  /**
   * POST /api/channels
   * Creates a new channel. Requires admin PIN.
   */
  app.post("/api/channels", async (req, res) => {
    try {
      const { pin, number, name } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (typeof number !== 'number' || !name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: "Channel number and name are required" });
      }
      
      const channel = await storage.createChannel({ number, name: name.trim() });
      res.json({ ...channel, participants: [] });
    } catch (error: any) {
      log(`Error creating channel: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to create channel" });
    }
  });

  /**
   * PATCH /api/channels/:id
   * Updates a channel. Requires admin PIN.
   */
  app.patch("/api/channels/:id", async (req, res) => {
    try {
      const { pin, number, name } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (typeof number !== 'number' || !name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: "Channel number and name are required" });
      }
      
      const updated = await storage.updateChannel(req.params.id, number, name.trim());
      
      if (!updated) {
        return res.status(404).json({ error: "Channel not found" });
      }
      
      const assignments = await storage.getChannelAssignments();
      const participants = assignments.filter(a => a.channelId === req.params.id).map(a => a.participantIdentity);
      res.json({ ...updated, participants });
    } catch (error: any) {
      log(`Error updating channel: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to update channel" });
    }
  });

  /**
   * DELETE /api/channels/:id
   * Deletes a channel. Requires admin PIN.
   */
  app.delete("/api/channels/:id", async (req, res) => {
    try {
      const { pin } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      await storage.deleteChannel(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      log(`Error deleting channel: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to delete channel" });
    }
  });

  /**
   * POST /api/channels/:id/assign
   * Assigns a participant to a channel. Requires admin PIN.
   */
  app.post("/api/channels/:id/assign", async (req, res) => {
    try {
      const { pin, participantIdentity } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!participantIdentity) {
        return res.status(400).json({ error: "Participant identity is required" });
      }
      
      await storage.assignToChannel(req.params.id, participantIdentity);
      
      const channel = await storage.getChannel(req.params.id);
      const assignments = await storage.getChannelAssignments();
      const participants = assignments.filter(a => a.channelId === req.params.id).map(a => a.participantIdentity);
      
      res.json({ ...channel, participants });
    } catch (error: any) {
      log(`Error assigning to channel: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to assign to channel" });
    }
  });

  /**
   * POST /api/channels/unassign
   * Removes a participant from any channel. Requires admin PIN.
   */
  app.post("/api/channels/unassign", async (req, res) => {
    try {
      const { pin, participantIdentity } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!participantIdentity) {
        return res.status(400).json({ error: "Participant identity is required" });
      }
      
      await storage.removeFromChannel(participantIdentity);
      res.json({ success: true });
    } catch (error: any) {
      log(`Error unassigning from channel: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to unassign from channel" });
    }
  });

  /**
   * GET /api/channels/my-channel
   * Gets the current user's channel assignment.
   */
  app.get("/api/channels/my-channel", async (req, res) => {
    try {
      const identity = req.query.identity as string;
      
      if (!identity) {
        return res.status(400).json({ error: "Identity is required" });
      }
      
      const channel = await storage.getParticipantChannel(identity);
      res.json({ channel: channel || null });
    } catch (error: any) {
      log(`Error getting participant channel: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to get participant channel" });
    }
  });

  /**
   * GET /api/banters
   * Lists all scheduled banters.
   */
  app.get("/api/banters", async (_req, res) => {
    try {
      const banters = await storage.getScheduledBanters();
      res.json(banters);
    } catch (error: any) {
      log(`Error fetching scheduled banters: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to fetch scheduled banters" });
    }
  });

  /**
   * POST /api/banters
   * Creates a new scheduled banter. Requires admin PIN.
   */
  app.post("/api/banters", async (req, res) => {
    try {
      const { pin, name, scheduledAt, autoCallEnabled, reminderEnabled, participantIds } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!name || !scheduledAt) {
        return res.status(400).json({ error: "Name and scheduled time are required" });
      }
      
      const banter = await storage.createScheduledBanter({
        name,
        scheduledAt: new Date(scheduledAt),
        autoCallEnabled: autoCallEnabled ? 'true' : 'false',
        reminderEnabled: reminderEnabled ? 'true' : 'false',
        participantIds: participantIds || []
      });
      
      log(`📅 Scheduled banter "${name}" at ${scheduledAt}`, "api");
      res.json(banter);
    } catch (error: any) {
      log(`Error creating scheduled banter: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to create scheduled banter" });
    }
  });

  /**
   * PATCH /api/banters/:id
   * Updates a scheduled banter. Requires admin PIN.
   */
  app.patch("/api/banters/:id", async (req, res) => {
    try {
      const { pin, name, scheduledAt, autoCallEnabled, reminderEnabled, participantIds, status } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (scheduledAt !== undefined) updateData.scheduledAt = new Date(scheduledAt);
      if (autoCallEnabled !== undefined) updateData.autoCallEnabled = autoCallEnabled ? 'true' : 'false';
      if (reminderEnabled !== undefined) updateData.reminderEnabled = reminderEnabled ? 'true' : 'false';
      if (participantIds !== undefined) updateData.participantIds = participantIds;
      if (status !== undefined) updateData.status = status;
      
      const updated = await storage.updateScheduledBanter(req.params.id, updateData);
      
      if (!updated) {
        return res.status(404).json({ error: "Scheduled banter not found" });
      }
      
      res.json(updated);
    } catch (error: any) {
      log(`Error updating scheduled banter: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to update scheduled banter" });
    }
  });

  /**
   * DELETE /api/banters/:id
   * Deletes a scheduled banter. Requires admin PIN.
   */
  app.delete("/api/banters/:id", async (req, res) => {
    try {
      const { pin } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      await storage.deleteScheduledBanter(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      log(`Error deleting scheduled banter: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to delete scheduled banter" });
    }
  });

  /**
   * POST /api/livekit/token
   * Generates a LiveKit access token for joining the room.
   * Requires either admin PIN or valid auth token for security.
   */
  app.post("/api/livekit/token", async (req, res) => {
    try {
      const { identity, name, authToken: clientAuthToken, pin } = req.body;
      
      if (!identity) {
        return res.status(400).json({ error: "Identity is required" });
      }
      
      // Require authentication: either admin PIN or valid auth token
      const adminPin = process.env.ADMIN_PIN;
      const isAdminAuth = adminPin && pin === adminPin;
      const verifiedPhone = clientAuthToken ? verifyAuthToken(clientAuthToken) : null;
      
      // Allow unauthenticated in development, require auth in production
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction && !isAdminAuth && !verifiedPhone) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      // Use verified phone for stable identity if available
      const stableIdentity = verifiedPhone 
        ? verifiedPhone.replace(/\D/g, '').slice(-10) 
        : identity;
      
      // Check if this user should be a listener (muted by default)
      let canPublish = true;
      try {
        const participants = await storage.getExpectedParticipants();
        const matchingParticipant = participants.find(p => {
          if (verifiedPhone) {
            const normalizedExpected = p.phone.replace(/\D/g, '');
            const normalizedVerified = verifiedPhone.replace(/\D/g, '');
            return normalizedExpected === normalizedVerified || 
                   normalizedExpected.endsWith(normalizedVerified) ||
                   normalizedVerified.endsWith(normalizedExpected);
          }
          return p.name === name || p.name === identity;
        });
        if (matchingParticipant?.role === 'listener') {
          canPublish = false;
          log(`👂 User ${stableIdentity} is a listener - joining with limited permissions`, "livekit");
        }
      } catch (error) {
        // Continue without role check
      }
      
      // Check if user is assigned to a channel
      let roomName = DEFAULT_ROOM_NAME;
      let channelNumber: number | null = null;
      try {
        const channel = await storage.getParticipantChannel(stableIdentity);
        if (channel) {
          roomName = `banter-channel-${channel.number}`;
          channelNumber = channel.number;
          log(`📺 User ${stableIdentity} assigned to channel ${channel.number} (${channel.name})`, "livekit");
        }
      } catch (error) {
        // Continue with default room
      }
      
      const token = await generateToken(stableIdentity, roomName, {
        canPublish,
        canSubscribe: true,
        name: name || identity
      });
      
      log(`🎫 Generated LiveKit token for ${stableIdentity} (name: ${name || identity}) in room ${roomName}`, "livekit");
      
      res.json({ 
        token,
        identity: stableIdentity,
        roomName,
        channelNumber,
        url: getLiveKitUrl()
      });
    } catch (error: any) {
      log(`Error generating LiveKit token: ${error.message}`, "livekit");
      res.status(500).json({ error: "Failed to generate token" });
    }
  });

  /**
   * POST /api/livekit/webhook
   * Receives LiveKit webhook events for room and participant updates.
   */
  app.post("/api/livekit/webhook", async (req, res) => {
    try {
      const event = req.body;
      
      log(`LiveKit webhook: ${event.event}`, "livekit");
      
      switch (event.event) {
        case 'participant_joined':
          broadcastParticipantEvent('join', {
            identity: event.participant?.identity,
            name: event.participant?.name
          });
          break;
        case 'participant_left':
          speakingState.delete(event.participant?.identity);
          broadcastSpeakingState();
          broadcastParticipantEvent('leave', {
            identity: event.participant?.identity
          });
          break;
        case 'track_published':
        case 'track_unpublished':
          broadcastParticipantEvent('track', {
            identity: event.participant?.identity,
            trackType: event.track?.type
          });
          break;
      }
      
      res.status(200).send('OK');
    } catch (error: any) {
      log(`Error processing LiveKit webhook: ${error.message}`, "livekit");
      res.status(500).send('Error');
    }
  });

  return httpServer;
}

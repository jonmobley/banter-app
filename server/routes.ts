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

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxAttempts) {
    return false;
  }
  entry.count++;
  return true;
}

setInterval(() => {
  const now = Date.now();
  const keysToDelete: string[] = [];
  rateLimitMap.forEach((entry, key) => {
    if (now > entry.resetAt) keysToDelete.push(key);
  });
  keysToDelete.forEach(key => rateLimitMap.delete(key));
}, 60000);

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

function createAuthToken(identifier: string): string {
  const isEmail = identifier.includes('@');
  const normalizedId = isEmail ? identifier.toLowerCase().trim() : normalizePhone(identifier);
  const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const data = `${normalizedId}:${expiry}`;
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
    
    const expectedSignature = crypto.createHmac('sha256', getAuthSecret()).update(`${phone}:${expiryStr}`).digest('hex');
    if (signature !== expectedSignature) {
      log(`Invalid auth token signature for ${phone}`, "auth");
      return null;
    }
    
    return phone;
  } catch {
    return null;
  }
}

function isAdminPhone(identifier: string | null): boolean {
  if (!identifier) return false;
  if (identifier.includes('@')) return false;
  const adminPhone = process.env.ADMIN_PHONE;
  if (!adminPhone) return false;
  
  const normalizedAdmin = normalizePhone(adminPhone);
  const normalizedUser = normalizePhone(identifier);
  
  return normalizedAdmin === normalizedUser;
}

function verifyAdminAuth(authToken: string | null): boolean {
  if (!authToken) return false;
  const phone = verifyAuthToken(authToken);
  return isAdminPhone(phone);
}

// Track speaking state per banter (keyed by banterId or 'global')
const speakingStates: Map<string, Map<string, boolean>> = new Map();

function getSpeakingState(banterId: string | null): Map<string, boolean> {
  const key = banterId || 'global';
  if (!speakingStates.has(key)) {
    speakingStates.set(key, new Map());
  }
  return speakingStates.get(key)!;
}

// Frontend WebSocket clients with their banter association
const frontendClients: Map<WebSocket, { banterId: string | null }> = new Map();

function broadcastSpeakingState(banterId: string | null) {
  const key = banterId || 'global';
  const state = getSpeakingState(banterId);
  const stateObj: Record<string, boolean> = {};
  state.forEach((speaking, identity) => {
    stateObj[identity] = speaking;
  });
  
  const message = JSON.stringify({ type: 'speaking', data: stateObj });
  frontendClients.forEach((info, client) => {
    const clientKey = info.banterId || 'global';
    if (clientKey === key && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastToFrontend(data: any, banterId?: string | null) {
  const message = JSON.stringify(data);
  const targetKey = (banterId !== undefined ? banterId : null) || 'global';
  frontendClients.forEach((info, client) => {
    const clientKey = info.banterId || 'global';
    if (clientKey === targetKey && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastParticipantEvent(event: string, data: any, banterId: string | null = null) {
  const message = JSON.stringify({
    type: 'participant-event',
    data: {
      event,
      ...data,
      timestamp: Date.now()
    }
  });
  
  const targetKey = banterId || 'global';
  frontendClients.forEach((info, client) => {
    const clientKey = info.banterId || 'global';
    if (clientKey === targetKey && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Per-banter state (keyed by banterId, "global" for the always-on banter)
  interface BanterSessionState {
    allCallActive: boolean;
    broadcastActive: boolean;
    broadcastSpeakerId: string | null;
    broadcastGrantedSpeakers: Set<string>;
    raisedHands: Set<string>;
  }

  const banterStates = new Map<string, BanterSessionState>();

  function getBanterState(banterId: string | null): BanterSessionState {
    const key = banterId || 'global';
    if (!banterStates.has(key)) {
      banterStates.set(key, {
        allCallActive: false,
        broadcastActive: false,
        broadcastSpeakerId: null,
        broadcastGrantedSpeakers: new Set(),
        raisedHands: new Set(),
      });
    }
    return banterStates.get(key)!;
  }

  function getBroadcastState(banterId: string | null) {
    const state = getBanterState(banterId);
    return {
      type: 'broadcast' as const,
      active: state.broadcastActive,
      speakerId: state.broadcastSpeakerId,
      grantedSpeakers: Array.from(state.broadcastGrantedSpeakers),
      raisedHands: Array.from(state.raisedHands),
      banterId: banterId || null,
    };
  }

  // Set up WebSocket server for frontend clients
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (ws) => {
    log('Frontend WebSocket client connected', 'ws');
    frontendClients.set(ws, { banterId: null });
    
    // Send current speaking state for global banter on connect
    const globalSpeaking = getSpeakingState(null);
    const stateObj: Record<string, boolean> = {};
    globalSpeaking.forEach((speaking, identity) => {
      stateObj[identity] = speaking;
    });
    ws.send(JSON.stringify({ type: 'speaking', data: stateObj }));
    
    // Send current state for global banter on connect
    const globalState = getBanterState(null);
    ws.send(JSON.stringify({ type: 'all-call', active: globalState.allCallActive, banterId: null }));
    ws.send(JSON.stringify(getBroadcastState(null)));
    
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'join-banter') {
          const bId = msg.banterId || null;
          frontendClients.set(ws, { banterId: bId });
          log(`WS client associated with banter: ${bId || 'global'}`, 'ws');
          const banterSpeaking = getSpeakingState(bId);
          const speakObj: Record<string, boolean> = {};
          banterSpeaking.forEach((speaking, identity) => {
            speakObj[identity] = speaking;
          });
          ws.send(JSON.stringify({ type: 'speaking', data: speakObj }));
          const bState = getBanterState(bId);
          ws.send(JSON.stringify({ type: 'all-call', active: bState.allCallActive, banterId: bId }));
          ws.send(JSON.stringify(getBroadcastState(bId)));
        } else if (msg.type === 'speaking-update' && msg.identity) {
          const clientInfo = frontendClients.get(ws);
          const bId = clientInfo?.banterId || null;
          const speaking = getSpeakingState(bId);
          speaking.set(msg.identity, msg.speaking);
          broadcastSpeakingState(bId);
        } else if (msg.type === 'raise-hand' && msg.identity) {
          const clientInfo = frontendClients.get(ws);
          const bId = clientInfo?.banterId || null;
          const state = getBanterState(bId);
          state.raisedHands.add(msg.identity);
          log(`✋ ${msg.identity} raised hand (banter: ${bId || 'global'})`, "broadcast");
          broadcastToFrontend(getBroadcastState(bId), bId);
        } else if (msg.type === 'lower-hand' && msg.identity) {
          const clientInfo = frontendClients.get(ws);
          const bId = clientInfo?.banterId || null;
          const state = getBanterState(bId);
          state.raisedHands.delete(msg.identity);
          log(`👇 ${msg.identity} lowered hand (banter: ${bId || 'global'})`, "broadcast");
          broadcastToFrontend(getBroadcastState(bId), bId);
        } else if (msg.type === 'request-banter-state') {
          const bId = msg.banterId || null;
          frontendClients.set(ws, { banterId: bId });
          const bState = getBanterState(bId);
          const banterSpeaking = getSpeakingState(bId);
          const speakObj: Record<string, boolean> = {};
          banterSpeaking.forEach((speaking, identity) => {
            speakObj[identity] = speaking;
          });
          ws.send(JSON.stringify({ type: 'speaking', data: speakObj }));
          ws.send(JSON.stringify({ type: 'all-call', active: bState.allCallActive, banterId: bId }));
          ws.send(JSON.stringify(getBroadcastState(bId)));
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
  app.get("/api/speaking", (req, res) => {
    const authToken = req.headers.authorization?.replace('Bearer ', '') || null;
    if (!authToken || !verifyAuthToken(authToken)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const banterId = (req.query.banterId as string) || null;
    const state = getSpeakingState(banterId);
    const stateObj: Record<string, boolean> = {};
    state.forEach((speaking, identity) => {
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
      const { authToken } = req.body;
      
      if (!verifyAdminAuth(authToken)) {
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
      
      if (!checkRateLimit(`send:${normalizedPhone}`, 3, 15 * 60 * 1000)) {
        return res.status(429).json({ error: "Too many attempts. Please wait 15 minutes." });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      
      await storage.createVerificationCode(normalizedPhone, code, expiresAt);

      const { sendVerificationSMS } = await import('./twilio-sms.js');
      const sent = await sendVerificationSMS(normalizedPhone, code);
      
      if (sent) {
        log(`📱 SMS sent to ${normalizedPhone}`, "auth");
        res.json({ success: true, message: "Verification code sent" });
      } else {
        await storage.deleteVerificationCodes(normalizedPhone);
        log(`📱 SMS failed for ${normalizedPhone}`, "auth");
        res.status(500).json({ error: "Failed to send SMS. Please try again." });
      }
    } catch (error: any) {
      log(`Error sending verification code: ${error.message}`, "auth");
      res.status(500).json({ error: "Failed to send verification code" });
    }
  });

  /**
   * POST /api/auth/send-email-code
   * Send a verification code via email using Resend.
   */
  app.post("/api/auth/send-email-code", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const normalizedEmail = email.toLowerCase().trim();
      
      if (!checkRateLimit(`send:${normalizedEmail}`, 3, 15 * 60 * 1000)) {
        return res.status(429).json({ error: "Too many attempts. Please wait 15 minutes." });
      }

      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      await storage.createEmailVerificationCode(normalizedEmail, code, expiresAt);

      const { sendVerificationEmail } = await import('./resend-email.js');
      const sent = await sendVerificationEmail(normalizedEmail, code);
      
      if (sent) {
        log(`📧 Verification code sent to ${normalizedEmail}`, "auth");
        res.json({ success: true, message: "Verification code sent" });
      } else {
        await storage.deleteEmailVerificationCodes(normalizedEmail);
        log(`📧 Email failed for ${normalizedEmail}`, "auth");
        res.status(500).json({ error: "Failed to send email. Please try again." });
      }
    } catch (error: any) {
      log(`Error sending email verification code: ${error.message}`, "auth");
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
      
      if (!checkRateLimit(`verify:${normalizedPhone}`, 5, 15 * 60 * 1000)) {
        return res.status(429).json({ error: "Too many attempts. Please wait 15 minutes." });
      }

      log(`🔍 Verifying code for phone ${normalizedPhone}`, "auth");
      const valid = await storage.verifyCode(normalizedPhone, code);
      
      if (!valid) {
        log(`❌ Invalid code ${code} for phone ${normalizedPhone}`, "auth");
        return res.status(401).json({ error: "Invalid or expired code" });
      }

      await storage.deleteVerificationCodes(normalizedPhone);
      const authToken = createAuthToken(normalizedPhone);

      const user = await storage.getUserByPhone(normalizedPhone);
      log(`✅ Verified phone ${normalizedPhone}`, "auth");
      res.json({ success: true, phone: normalizedPhone, authToken, userName: user?.name || null });
    } catch (error: any) {
      log(`Error verifying code: ${error.message}`, "auth");
      res.status(500).json({ error: "Failed to verify code" });
    }
  });

  /**
   * POST /api/auth/verify-email-code
   * Verify the email code and return authenticated email.
   */
  app.post("/api/auth/verify-email-code", async (req, res) => {
    try {
      const { email, code } = req.body;
      if (!email || !code) {
        return res.status(400).json({ error: "Email and code are required" });
      }

      const normalizedEmail = email.toLowerCase().trim();
      
      if (!checkRateLimit(`verify:${normalizedEmail}`, 5, 15 * 60 * 1000)) {
        return res.status(429).json({ error: "Too many attempts. Please wait 15 minutes." });
      }

      const valid = await storage.verifyEmailCode(normalizedEmail, code);
      
      if (!valid) {
        return res.status(401).json({ error: "Invalid or expired code" });
      }

      await storage.deleteEmailVerificationCodes(normalizedEmail);
      const authToken = createAuthToken(normalizedEmail);

      const user = await storage.getUserByEmail(normalizedEmail);
      log(`✅ Verified email ${normalizedEmail}`, "auth");
      res.json({ success: true, email: normalizedEmail, authToken, userName: user?.name || null });
    } catch (error: any) {
      log(`Error verifying email code: ${error.message}`, "auth");
      res.status(500).json({ error: "Failed to verify code" });
    }
  });

  /**
   * POST /api/user/profile
   * Save or update the current user's name. Creates user record if none exists.
   */
  app.post("/api/user/profile", async (req, res) => {
    try {
      const { authToken, name } = req.body;
      const identifier = verifyAuthToken(authToken);
      if (!identifier) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Name is required" });
      }

      let user;
      if (identifier.includes('@')) {
        user = await storage.upsertUserByEmail(identifier, name.trim());
      } else {
        user = await storage.upsertUserByPhone(identifier, name.trim());
      }
      res.json(user);
    } catch (error: any) {
      log(`Error saving user profile: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to save profile" });
    }
  });

  /**
   * GET /api/user/profile
   * Get the current user's profile by auth token.
   */
  app.get("/api/user/profile", async (req, res) => {
    try {
      const authToken = req.headers.authorization?.replace('Bearer ', '') || null;
      const identifier = verifyAuthToken(authToken);
      if (!identifier) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      let user;
      if (identifier.includes('@')) {
        user = await storage.getUserByEmail(identifier);
      } else {
        user = await storage.getUserByPhone(identifier);
      }
      res.json(user || null);
    } catch (error: any) {
      log(`Error getting user profile: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to get profile" });
    }
  });

  /**
   * GET /api/users
   * Admin: List all users.
   */
  app.get("/api/users", async (req, res) => {
    try {
      const authToken = req.headers.authorization?.replace('Bearer ', '') || null;
      if (!verifyAdminAuth(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const allUsers = await storage.getUsers();
      res.json(allUsers);
    } catch (error: any) {
      log(`Error fetching users: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  /**
   * POST /api/users
   * Admin: Create a new user.
   */
  app.post("/api/users", async (req, res) => {
    try {
      const { authToken, name, phone, email } = req.body;
      if (!verifyAdminAuth(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (!name || !name.trim()) {
        return res.status(400).json({ error: "Name is required" });
      }
      if (!phone && !email) {
        return res.status(400).json({ error: "Phone or email is required" });
      }

      const userData: any = { name: name.trim() };
      if (phone) {
        userData.phone = normalizePhone(phone);
        const existing = await storage.getUserByPhone(userData.phone);
        if (existing) {
          return res.status(409).json({ error: "A user with this phone number already exists" });
        }
      }
      if (email) {
        userData.email = email.toLowerCase().trim();
        const existing = await storage.getUserByEmail(userData.email);
        if (existing) {
          return res.status(409).json({ error: "A user with this email already exists" });
        }
      }

      const user = await storage.createUser(userData);
      res.json(user);
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(409).json({ error: "A user with this phone or email already exists" });
      }
      log(`Error creating user: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to create user" });
    }
  });

  /**
   * PUT /api/users/:id
   * Admin: Update a user.
   */
  app.put("/api/users/:id", async (req, res) => {
    try {
      const { authToken, name, phone, email } = req.body;
      if (!verifyAdminAuth(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const data: any = {};
      if (name !== undefined) data.name = name.trim();
      if (phone !== undefined) data.phone = phone ? normalizePhone(phone) : null;
      if (email !== undefined) data.email = email ? email.toLowerCase().trim() : null;

      const user = await storage.updateUser(req.params.id, data);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(409).json({ error: "A user with this phone or email already exists" });
      }
      log(`Error updating user: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to update user" });
    }
  });

  /**
   * DELETE /api/users/:id
   * Admin: Delete a user.
   */
  app.delete("/api/users/:id", async (req, res) => {
    try {
      const authToken = req.headers.authorization?.replace('Bearer ', '') || null;
      if (!verifyAdminAuth(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      await storage.deleteUser(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      log(`Error deleting user: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to delete user" });
    }
  });

  /**
   * GET /api/contacts
   * Lists all saved contacts.
   */
  app.get("/api/contacts", async (req, res) => {
    try {
      const authToken = req.headers.authorization?.replace('Bearer ', '') || null;
      if (!verifyAdminAuth(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
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
      const { authToken, name, phone } = req.body;
      if (!verifyAdminAuth(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (!name || !phone) {
        return res.status(400).json({ error: "Name and phone are required" });
      }
      const existing = await storage.getContactByPhone(phone);
      if (existing) {
        return res.status(409).json({ error: "A contact with this phone number already exists" });
      }
      const contact = await storage.createContact({ name, phone });
      res.json(contact);
    } catch (error: any) {
      if (error.code === '23505') {
        return res.status(409).json({ error: "A contact with this phone number already exists" });
      }
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
      const { authToken } = req.body;
      if (!verifyAdminAuth(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
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
  app.get("/api/participants", async (req, res) => {
    try {
      const authToken = req.headers.authorization?.replace('Bearer ', '') || null;
      if (!authToken || !verifyAuthToken(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const banterId = (req.query.banterId as string) || null;
      let roomName = DEFAULT_ROOM_NAME;
      if (banterId) {
        const banter = await storage.getScheduledBanter(banterId);
        if (!banter?.slug) {
          return res.status(404).json({ error: "Banter not found" });
        }
        roomName = `banter-${banter.slug}-main`;
      }

      const participants = await getRoomParticipants(roomName);
      
      if (participants.length === 0) {
        return res.json({ 
          count: 0, 
          participants: [],
          conferenceActive: false
        });
      }

      const participantList = participants.map(p => {
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
        roomName
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
   * Verifies if the current user is an admin based on their phone number.
   */
  app.post("/api/admin/verify", (req, res) => {
    const { authToken } = req.body;
    
    if (!process.env.ADMIN_PHONE) {
      log("ADMIN_PHONE not configured", "api");
      return res.status(500).json({ error: "Admin not configured" });
    }
    
    if (verifyAdminAuth(authToken)) {
      log("Admin verified successfully", "api");
      return res.json({ success: true, isAdmin: true });
    } else {
      return res.json({ success: true, isAdmin: false });
    }
  });

  /**
   * POST /api/admin/mute
   * Mutes or unmutes a participant in the room.
   */
  app.post("/api/admin/mute", async (req, res) => {
    try {
      const { authToken, identity, muted, banterId } = req.body;
      if (!verifyAdminAuth(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!identity || typeof muted !== 'boolean') {
        return res.status(400).json({ error: "identity and muted are required" });
      }

      let roomName = DEFAULT_ROOM_NAME;
      if (banterId) {
        const banter = await storage.getScheduledBanter(banterId);
        if (!banter?.slug) {
          return res.status(404).json({ error: "Banter not found" });
        }
        roomName = `banter-${banter.slug}-main`;
      }
      
      await muteParticipant(identity, muted, roomName);
      
      log(`Participant ${identity} ${muted ? 'muted' : 'unmuted'} by admin in ${roomName}`, "livekit");
      
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
      const { authToken, identity, banterId } = req.body;
      if (!verifyAdminAuth(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!identity) {
        return res.status(400).json({ error: "identity is required" });
      }

      let roomName = DEFAULT_ROOM_NAME;
      if (banterId) {
        const banter = await storage.getScheduledBanter(banterId);
        if (!banter?.slug) {
          return res.status(404).json({ error: "Banter not found" });
        }
        roomName = `banter-${banter.slug}-main`;
      }
      
      await removeParticipant(identity, roomName);
      
      log(`Participant ${identity} removed by admin from ${roomName}`, "livekit");
      
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
  app.get("/api/expected", async (req, res) => {
    try {
      const authToken = req.headers.authorization?.replace('Bearer ', '') || null;
      if (!authToken || !verifyAuthToken(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const banterId = (req.query.banterId as string) || null;
      const expected = await storage.getExpectedParticipants(banterId);
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
      const { authToken, name, phone, banterId } = req.body;
      if (!verifyAdminAuth(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const email = req.body.email;
      if (!name || (!phone && !email)) {
        return res.status(400).json({ error: "Name and either phone or email are required" });
      }
      const participant = await storage.addExpectedParticipant({ name, phone: phone || '', email: email || null, banterId: banterId || null });
      res.json(participant);
    } catch (error: any) {
      log(`Error adding expected participant: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to add expected participant" });
    }
  });

  /**
   * POST /api/expected/add-group
   * Adds all members of a group as expected participants for a banter.
   */
  app.post("/api/expected/add-group", async (req, res) => {
    try {
      const { authToken: clientAuthToken, groupId, banterId } = req.body;
      if (!verifyAdminAuth(clientAuthToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (!groupId) {
        return res.status(400).json({ error: "groupId is required" });
      }

      const members = await storage.getGroupMembers(groupId);
      const existingExpected = await storage.getExpectedParticipants(banterId || null);
      const existingKeys = new Set<string>();
      for (const ep of existingExpected) {
        if (ep.phone) existingKeys.add(`phone:${ep.phone}`);
        if (ep.email) existingKeys.add(`email:${ep.email.toLowerCase()}`);
        existingKeys.add(`name:${ep.name.toLowerCase()}`);
      }

      const added: any[] = [];
      for (const member of members) {
        const participant = await storage.getExpectedParticipant(member.participantId);
        if (!participant) continue;
        const phoneKey = participant.phone ? `phone:${participant.phone}` : null;
        const emailKey = participant.email ? `email:${participant.email.toLowerCase()}` : null;
        if ((phoneKey && existingKeys.has(phoneKey)) || (emailKey && existingKeys.has(emailKey))) continue;

        const newParticipant = await storage.addExpectedParticipant({
          name: participant.name,
          phone: participant.phone || '',
          email: participant.email,
          banterId: banterId || null,
        });
        added.push(newParticipant);
        if (phoneKey) existingKeys.add(phoneKey);
        if (emailKey) existingKeys.add(emailKey);
      }

      res.json({ added: added.length, participants: added });
    } catch (error: any) {
      log(`Error adding group to banter: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to add group members" });
    }
  });

  /**
   * DELETE /api/expected/:id
   * Removes an expected participant. Requires admin PIN.
   */
  app.delete("/api/expected/:id", async (req, res) => {
    try {
      const { authToken } = req.body;
      if (!verifyAdminAuth(authToken)) {
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
      const { authToken, name, phone, email, role } = req.body;
      if (!verifyAdminAuth(authToken)) {
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
  app.get("/api/groups", async (req, res) => {
    try {
      const authToken = req.headers.authorization?.replace('Bearer ', '') || null;
      if (!verifyAdminAuth(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
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
      const { authToken, name } = req.body;
      if (!verifyAdminAuth(authToken)) {
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
      const { authToken, name } = req.body;
      if (!verifyAdminAuth(authToken)) {
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
      const { authToken } = req.body;
      if (!verifyAdminAuth(authToken)) {
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
      const { authToken, participantId } = req.body;
      if (!verifyAdminAuth(authToken)) {
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
      const { authToken } = req.body;
      if (!verifyAdminAuth(authToken)) {
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
  app.get("/api/channels", async (req, res) => {
    try {
      const authToken = req.headers.authorization?.replace('Bearer ', '') || null;
      if (!authToken || !verifyAuthToken(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const banterId = (req.query.banterId as string) || null;
      const allChannels = await storage.getChannels(banterId);
      const allAssignments = await storage.getChannelAssignments(banterId);
      
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
      const { authToken, number, name, banterId } = req.body;
      if (!verifyAdminAuth(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (typeof number !== 'number' || !name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: "Channel number and name are required" });
      }
      
      const channel = await storage.createChannel({ number, name: name.trim(), banterId: banterId || null });
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
      const { authToken, number, name } = req.body;
      if (!verifyAdminAuth(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (typeof number !== 'number' || !name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json({ error: "Channel number and name are required" });
      }
      
      const updated = await storage.updateChannel(req.params.id, number, name.trim());
      
      if (!updated) {
        return res.status(404).json({ error: "Channel not found" });
      }
      
      const assignments = await storage.getChannelAssignments(updated.banterId);
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
      const { authToken } = req.body;
      if (!verifyAdminAuth(authToken)) {
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
      const { authToken, participantIdentity, banterId } = req.body;
      if (!verifyAdminAuth(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!participantIdentity) {
        return res.status(400).json({ error: "Participant identity is required" });
      }
      
      await storage.assignToChannel(req.params.id, participantIdentity, banterId || null);
      
      const channel = await storage.getChannel(req.params.id);
      const assignments = await storage.getChannelAssignments(banterId || null);
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
      const { authToken, participantIdentity, banterId } = req.body;
      if (!verifyAdminAuth(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!participantIdentity) {
        return res.status(400).json({ error: "Participant identity is required" });
      }
      
      await storage.removeFromChannel(participantIdentity, banterId || null);
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
      const authToken = req.headers.authorization?.replace('Bearer ', '') || null;
      if (!authToken || !verifyAuthToken(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const identity = req.query.identity as string;
      const banterId = (req.query.banterId as string) || null;
      
      if (!identity) {
        return res.status(400).json({ error: "Identity is required" });
      }
      
      const channel = await storage.getParticipantChannel(identity, banterId);
      res.json({ channel: channel || null });
    } catch (error: any) {
      log(`Error getting participant channel: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to get participant channel" });
    }
  });

  /**
   * POST /api/channels/switch
   * Allows any authenticated user to switch their own channel.
   */
  app.post("/api/channels/switch", async (req, res) => {
    try {
      const { authToken, channelId, identity, banterId } = req.body;
      const verifiedId = authToken ? verifyAuthToken(authToken) : null;
      if (!verifiedId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      if (!identity) {
        return res.status(400).json({ error: "Identity is required" });
      }
      if (identity !== verifiedId && !isAdminPhone(verifiedId)) {
        return res.status(403).json({ error: "Cannot switch another user's channel" });
      }

      const bId = banterId || null;
      if (!isAdminPhone(verifiedId)) {
        const assignments = await storage.getChannelAssignments(bId);
        const hasAssignment = assignments.some(a => a.participantIdentity === identity);
        if (!hasAssignment) {
          return res.status(403).json({ error: "You must be assigned to a channel by an admin first" });
        }
      }

      if (channelId) {
        const channel = await storage.getChannel(channelId);
        if (!channel) {
          return res.status(404).json({ error: "Channel not found" });
        }
        await storage.assignToChannel(channelId, identity, bId);
        log(`📺 ${identity} switched to channel ${channel.number} (${channel.name})`, "channels");
        broadcastToFrontend({ type: 'channel-switch', identity, channelId, channelNumber: channel.number, channelName: channel.name, banterId: bId }, bId);
        res.json({ success: true, channel });
      } else {
        await storage.removeFromChannel(identity, bId);
        log(`📺 ${identity} switched to main room`, "channels");
        broadcastToFrontend({ type: 'channel-switch', identity, channelId: null, channelNumber: null, channelName: null, banterId: bId }, bId);
        res.json({ success: true, channel: null });
      }
    } catch (error: any) {
      log(`Error switching channel: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to switch channel" });
    }
  });

  /**
   * POST /api/channels/all-call
   * Admin activates/deactivates all-call mode (broadcast to all channels).
   */
  app.post("/api/channels/all-call", async (req, res) => {
    try {
      const { authToken, active, banterId } = req.body;
      if (!verifyAdminAuth(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const bId = banterId || null;
      const state = getBanterState(bId);
      if (active && state.broadcastActive) {
        return res.status(400).json({ error: "Cannot activate all-call while broadcast is active" });
      }
      state.allCallActive = !!active;
      log(`📢 All-call ${state.allCallActive ? 'ACTIVATED' : 'DEACTIVATED'} by admin (banter: ${bId || 'global'})`, "channels");
      broadcastToFrontend({ type: 'all-call', active: state.allCallActive, banterId: bId }, bId);
      res.json({ success: true, active: state.allCallActive });
    } catch (error: any) {
      log(`Error toggling all-call: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to toggle all-call" });
    }
  });

  /**
   * GET /api/channels/all-call
   * Returns current all-call state.
   */
  app.get("/api/channels/all-call", async (req, res) => {
    const authToken = req.headers.authorization?.replace('Bearer ', '') || null;
    if (!authToken || !verifyAuthToken(authToken)) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const banterId = (req.query.banterId as string) || null;
    const state = getBanterState(banterId);
    res.json({ active: state.allCallActive });
  });

  /**
   * POST /api/broadcast
   * Admin starts/stops broadcast mode. One speaker, everyone else listens.
   */
  app.post("/api/broadcast", async (req, res) => {
    try {
      const { authToken: clientAuthToken, active, banterId } = req.body;
      if (!verifyAdminAuth(clientAuthToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const bId = banterId || null;
      const state = getBanterState(bId);

      if (active) {
        const verifiedId = verifyAuthToken(clientAuthToken);
        state.broadcastActive = true;
        state.broadcastSpeakerId = verifiedId || null;
        state.broadcastGrantedSpeakers.clear();
        state.raisedHands.clear();
        if (state.allCallActive) {
          state.allCallActive = false;
          broadcastToFrontend({ type: 'all-call', active: false, banterId: bId }, bId);
        }
        log(`📣 Broadcast ACTIVATED by ${state.broadcastSpeakerId} (banter: ${bId || 'global'})`, "broadcast");
      } else {
        state.broadcastActive = false;
        state.broadcastSpeakerId = null;
        state.broadcastGrantedSpeakers.clear();
        state.raisedHands.clear();
        log(`📣 Broadcast DEACTIVATED (banter: ${bId || 'global'})`, "broadcast");
      }

      broadcastToFrontend(getBroadcastState(bId), bId);
      res.json({ success: true, ...getBroadcastState(bId) });
    } catch (error: any) {
      log(`Error toggling broadcast: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to toggle broadcast" });
    }
  });

  /**
   * POST /api/broadcast/grant
   * Admin grants or revokes speaking permission to a listener during broadcast.
   */
  app.post("/api/broadcast/grant", async (req, res) => {
    try {
      const { authToken: clientAuthToken, identity, grant, banterId } = req.body;
      if (!verifyAdminAuth(clientAuthToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const bId = banterId || null;
      const state = getBanterState(bId);
      if (!state.broadcastActive) {
        return res.status(400).json({ error: "Broadcast is not active" });
      }
      if (!identity) {
        return res.status(400).json({ error: "Identity is required" });
      }

      if (grant) {
        state.broadcastGrantedSpeakers.add(identity);
        state.raisedHands.delete(identity);
        log(`🎤 Granted speaking permission to ${identity}`, "broadcast");
      } else {
        state.broadcastGrantedSpeakers.delete(identity);
        log(`🔇 Revoked speaking permission from ${identity}`, "broadcast");
      }

      broadcastToFrontend(getBroadcastState(bId), bId);
      res.json({ success: true, ...getBroadcastState(bId) });
    } catch (error: any) {
      log(`Error granting broadcast permission: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to update broadcast permission" });
    }
  });

  /**
   * GET /api/banters
   * Lists all scheduled banters.
   */
  app.get("/api/banters", async (req, res) => {
    try {
      const authToken = req.headers.authorization?.replace('Bearer ', '') || null;
      if (!authToken || !verifyAuthToken(authToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
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
      const { authToken, name, scheduledAt, autoCallEnabled, reminderEnabled, participantIds } = req.body;
      if (!verifyAdminAuth(authToken)) {
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
      const { authToken, name, scheduledAt, autoCallEnabled, reminderEnabled, participantIds, status } = req.body;
      if (!verifyAdminAuth(authToken)) {
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
      const { authToken } = req.body;
      if (!verifyAdminAuth(authToken)) {
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
   * GET /api/banters/by-slug/:slug
   * Resolves a banter by its slug for join link resolution.
   */
  app.get("/api/banters/by-slug/:slug", async (req, res) => {
    try {
      const banter = await storage.getScheduledBanterBySlug(req.params.slug);
      if (!banter) {
        return res.status(404).json({ error: "Banter not found" });
      }
      res.json(banter);
    } catch (error: any) {
      log(`Error resolving banter slug: ${error.message}`, "api");
      res.status(500).json({ error: "Failed to resolve banter" });
    }
  });

  /**
   * POST /api/alert-crew
   * Sends an instant "Join Now" SMS to crew members. Requires admin auth.
   * Rate limited to 1 alert per 5 minutes.
   */
  app.post("/api/alert-crew", async (req, res) => {
    try {
      const { authToken: clientAuthToken, participantIds, banterId } = req.body;
      if (!verifyAdminAuth(clientAuthToken)) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!checkRateLimit('alert-crew', 1, 5 * 60 * 1000)) {
        return res.status(429).json({ error: "Alert already sent recently. Please wait 5 minutes." });
      }

      let joinPath = '/login';
      if (banterId) {
        const banter = await storage.getScheduledBanter(banterId);
        if (banter?.slug) {
          joinPath = `/join/${banter.slug}`;
        }
      }
      const baseUrl = process.env.REPLIT_DEPLOYMENT_URL
        || (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : '');
      const joinLink = baseUrl ? `${baseUrl}${joinPath}` : 'your Banter link';

      const bId = banterId || null;
      let targets: { name: string; phone: string; email?: string | null }[] = [];

      const allExpected = await storage.getExpectedParticipants(bId);
      const filtered = participantIds && Array.isArray(participantIds) && participantIds.length > 0
        ? allExpected.filter(p => participantIds.includes(p.id))
        : allExpected;
      targets = filtered
        .filter(p => (p.phone && p.phone.trim() !== '') || p.email)
        .map(p => ({ name: p.name, phone: p.phone, email: p.email }));

      if (targets.length === 0) {
        return res.status(400).json({ error: "No participants with phone or email to alert" });
      }

      const { sendAlertSMS } = await import('./twilio-sms.js');
      const { sendAlertEmail } = await import('./resend-email.js');
      let sent = 0;
      let failed = 0;
      for (const target of targets) {
        const hasPhone = target.phone && target.phone.trim() !== '';
        if (hasPhone) {
          const normalizedPhone = normalizePhone(target.phone);
          const success = await sendAlertSMS(normalizedPhone, joinLink);
          if (success) {
            sent++;
            log(`📲 Alert SMS sent to ${target.name} (${normalizedPhone})`, "alert");
          } else {
            failed++;
            log(`📲 Alert SMS failed for ${target.name} (${normalizedPhone})`, "alert");
          }
        } else if (target.email) {
          const success = await sendAlertEmail(target.email, joinLink);
          if (success) {
            sent++;
            log(`📧 Alert email sent to ${target.name} (${target.email})`, "alert");
          } else {
            failed++;
            log(`📧 Alert email failed for ${target.name} (${target.email})`, "alert");
          }
        }
      }

      log(`📲 Alert crew complete: ${sent} sent, ${failed} failed out of ${targets.length}`, "alert");
      res.json({ success: true, sent, failed, total: targets.length });
    } catch (error: any) {
      log(`Error sending crew alert: ${error.message}`, "alert");
      res.status(500).json({ error: "Failed to send crew alert" });
    }
  });

  /**
   * POST /api/livekit/token
   * Generates a LiveKit access token for joining the room.
   * Requires either admin PIN or valid auth token for security.
   */
  app.post("/api/livekit/token", async (req, res) => {
    try {
      const { identity, name, authToken: clientAuthToken, pin, banterId, slug } = req.body;
      
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

      // Resolve banter context
      let resolvedBanterId: string | null = banterId || null;
      let banterSlug: string | null = slug || null;
      if (slug && !resolvedBanterId) {
        const banter = await storage.getScheduledBanterBySlug(slug);
        if (banter) {
          resolvedBanterId = banter.id;
          banterSlug = banter.slug;
        }
      }
      if (resolvedBanterId && !banterSlug) {
        const banter = await storage.getScheduledBanter(resolvedBanterId);
        if (banter) banterSlug = banter.slug;
      }
      
      // Check if this user should be a listener (muted by default)
      let canPublish = true;
      try {
        const participants = await storage.getExpectedParticipants(resolvedBanterId);
        const matchingParticipant = participants.find(p => {
          if (verifiedPhone) {
            return normalizePhone(p.phone) === normalizePhone(verifiedPhone);
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

      // Determine room prefix based on banter context
      const roomPrefix = banterSlug ? `banter-${banterSlug}` : 'banter';
      const state = getBanterState(resolvedBanterId);
      
      // Check broadcast mode — overrides all other routing
      let roomName = banterSlug ? `${roomPrefix}-main` : DEFAULT_ROOM_NAME;
      let channelNumber: number | null = null;
      if (state.broadcastActive) {
        roomName = `${roomPrefix}-broadcast`;
        if (stableIdentity !== state.broadcastSpeakerId && !state.broadcastGrantedSpeakers.has(stableIdentity)) {
          canPublish = false;
        }
        log(`📣 Broadcast active — routing ${stableIdentity} to ${roomName} (canPublish: ${canPublish})`, "livekit");
      } else if (state.allCallActive) {
        roomName = `${roomPrefix}-all-call`;
        log(`📢 All-call active — routing ${stableIdentity} to ${roomName}`, "livekit");
      } else {
        try {
          const channel = await storage.getParticipantChannel(stableIdentity, resolvedBanterId);
          if (channel) {
            roomName = `${roomPrefix}-channel-${channel.number}`;
            channelNumber = channel.number;
            log(`📺 User ${stableIdentity} assigned to channel ${channel.number} (${channel.name})`, "livekit");
          }
        } catch (error) {
          // Continue with default room
        }
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
        banterId: resolvedBanterId,
        banterSlug,
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

      const roomName = event.room?.name || '';
      let webhookBanterId: string | null = null;
      if (roomName && roomName !== DEFAULT_ROOM_NAME) {
        const slugMatch = roomName.match(/^banter-(.+?)-(?:main|channel-|all-call|broadcast)/);
        if (slugMatch) {
          const slug = slugMatch[1];
          const banter = await storage.getScheduledBanterBySlug(slug);
          if (banter) {
            webhookBanterId = banter.id;
          }
        }
      }
      
      switch (event.event) {
        case 'participant_joined':
          broadcastParticipantEvent('join', {
            identity: event.participant?.identity,
            name: event.participant?.name
          }, webhookBanterId);
          break;
        case 'participant_left': {
          const speaking = getSpeakingState(webhookBanterId);
          speaking.delete(event.participant?.identity);
          broadcastSpeakingState(webhookBanterId);
          broadcastParticipantEvent('leave', {
            identity: event.participant?.identity
          }, webhookBanterId);
          break;
        }
        case 'track_published':
        case 'track_unpublished':
          broadcastParticipantEvent('track', {
            identity: event.participant?.identity,
            trackType: event.track?.type
          }, webhookBanterId);
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

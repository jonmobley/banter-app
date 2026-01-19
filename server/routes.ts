/**
 * Phone-Based Walkie-Talkie API Routes
 * 
 * WEBHOOK SETUP INSTRUCTIONS:
 * ============================
 * 1. Deploy this application on Replit (it will get a URL like: https://your-repl.replit.app)
 * 2. Go to your Twilio Console: https://console.twilio.com/
 * 3. Navigate to: Phone Numbers > Manage > Active Numbers
 * 4. Click on your phone number
 * 5. Scroll to "Voice Configuration"
 * 6. Under "A CALL COMES IN", set:
 *    - Webhook: https://your-repl.replit.app/voice/incoming
 *    - HTTP: POST
 * 7. Click "Save"
 * 
 * That's it! When someone calls your Twilio number, they'll automatically join the conference.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import twilio from "twilio";
import { log } from "./index";
import { getTwilioClient, getTwilioFromPhoneNumber, getTwilioCredentials, getTwilioAuthToken, withRetry } from "./twilio";
import twilio_jwt from "twilio/lib/jwt/AccessToken";
import { WebSocketServer, WebSocket } from "ws";
import { normalizePhone } from "@shared/schema";
import crypto from "crypto";

// Secret key for signing auth tokens - must be a strong, persistent secret
// In production, AUTH_TOKEN_SECRET must be set to a 64+ character random string
// Lazy-loaded to allow proper error handling during startup
let _authSecret: string | null = null;

function getAuthSecret(): string {
  if (_authSecret) return _authSecret;
  
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Dedicated auth secret (required in production)
  if (process.env.AUTH_TOKEN_SECRET && process.env.AUTH_TOKEN_SECRET.length >= 32) {
    _authSecret = process.env.AUTH_TOKEN_SECRET;
    return _authSecret;
  }
  
  if (isProduction) {
    // In production, fail fast if AUTH_TOKEN_SECRET is missing
    console.error('FATAL: AUTH_TOKEN_SECRET environment variable is required in production.');
    console.error('Please set AUTH_TOKEN_SECRET to a random 64+ character string.');
    process.exit(1);
  }
  
  // Development only: use a derived key for convenience
  // This allows testing without setting up secrets
  console.warn('WARNING: Using derived auth secret. Set AUTH_TOKEN_SECRET in production!');
  const sources = [
    process.env.DATABASE_URL || '',
    process.env.REPLIT_DEV_DOMAIN || 'localhost',
    'banter-auth-dev-v1-2024'
  ];
  _authSecret = crypto.createHash('sha256').update(sources.join('|')).digest('hex');
  return _authSecret;
}

/**
 * Create a signed auth token for a verified phone number.
 * Token format: phone:expiry:signature
 */
function createAuthToken(phone: string): string {
  const normalizedPhone = normalizePhone(phone);
  const expiry = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  const data = `${normalizedPhone}:${expiry}`;
  const signature = crypto.createHmac('sha256', getAuthSecret()).update(data).digest('hex');
  return Buffer.from(`${data}:${signature}`).toString('base64');
}

/**
 * Verify an auth token and extract the phone number.
 * Returns the phone number if valid, null if invalid or expired.
 */
function verifyAuthToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length !== 3) return null;
    
    const [phone, expiryStr, signature] = parts;
    const expiry = parseInt(expiryStr, 10);
    
    // Check expiry
    if (Date.now() > expiry) {
      log(`Auth token expired for ${phone}`, "auth");
      return null;
    }
    
    // Verify signature
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

/**
 * Get the public base URL for webhook callbacks
 * Uses REPLIT_DEV_DOMAIN in development or constructs from request headers
 */
function getPublicBaseUrl(req: Request): string {
  // In Replit, use the dev domain for reliable URLs
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  
  // Fallback to request-based URL construction
  const host = req.headers.host || 'localhost:5000';
  const forwardedProto = req.headers['x-forwarded-proto'] as string;
  const isSecure = forwardedProto === 'https' || req.protocol === 'https' || host.includes('replit');
  const protocol = isSecure ? 'https' : 'http';
  return `${protocol}://${host}`;
}

/**
 * Twilio Webhook Signature Validation Middleware
 * 
 * Verifies that incoming webhook requests are actually from Twilio
 * using HMAC-SHA1 signature validation with the auth token.
 * This prevents spoofed requests from unauthorized sources.
 */
async function validateTwilioWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const authToken = await getTwilioAuthToken();
    
    if (!authToken) {
      log("⚠️ Twilio auth token not available, skipping webhook validation", "twilio");
      return next();
    }
    
    const twilioSignature = req.headers['x-twilio-signature'] as string;
    
    if (!twilioSignature) {
      log("⚠️ Missing Twilio signature header", "twilio");
      return res.status(403).send('Forbidden: Missing signature');
    }
    
    // Build the full URL that Twilio used to sign the request
    const baseUrl = getPublicBaseUrl(req);
    const url = `${baseUrl}${req.originalUrl}`;
    
    // For form-urlencoded requests (Twilio webhooks), use the parsed body params
    // Twilio expects the params as they were sent in the POST body
    const params = req.body || {};
    
    // Validate the request
    const isValid = twilio.validateRequest(authToken, twilioSignature, url, params);
    
    if (!isValid) {
      log(`⚠️ Invalid Twilio signature for ${req.path} (URL: ${url})`, "twilio");
      // In development, log more details but still proceed
      if (process.env.NODE_ENV === 'development') {
        log(`⚠️ Signature validation failed in dev mode, allowing request`, "twilio");
        return next();
      }
      return res.status(403).send('Forbidden: Invalid signature');
    }
    
    next();
  } catch (error: any) {
    log(`Error validating Twilio webhook: ${error.message}`, "twilio");
    // Allow request to proceed if validation fails due to config issues in development
    if (process.env.NODE_ENV === 'development') {
      return next();
    }
    return res.status(500).send('Server error during validation');
  }
}

const VoiceResponse = twilio.twiml.VoiceResponse;

// Track speaking state for each participant
const speakingState: Map<string, boolean> = new Map();
// Track callSid to streamSid mapping
const streamToCall: Map<string, string> = new Map();
// Frontend WebSocket clients for real-time updates
const frontendClients: Set<WebSocket> = new Set();

// Broadcast speaking state to all frontend clients
function broadcastSpeakingState() {
  const stateObj: Record<string, boolean> = {};
  speakingState.forEach((speaking, callSid) => {
    stateObj[callSid] = speaking;
  });
  
  const message = JSON.stringify({ type: 'speaking', data: stateObj });
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
    speakingState.forEach((speaking, callSid) => {
      stateObj[callSid] = speaking;
    });
    ws.send(JSON.stringify({ type: 'speaking', data: stateObj }));
    
    ws.on('close', () => {
      frontendClients.delete(ws);
      log('Frontend WebSocket client disconnected', 'ws');
    });
  });
  
  // Set up WebSocket server for Twilio Media Streams
  const mediaWss = new WebSocketServer({ server: httpServer, path: '/media-stream' });
  
  mediaWss.on('connection', (ws) => {
    log('Twilio Media Stream connected', 'media');
    
    let streamSid: string | null = null;
    let callSid: string | null = null;
    let lastSpeakingTime = 0;
    let isSpeaking = false;
    
    // Track audio energy to detect speaking
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        
        if (msg.event === 'start') {
          streamSid = msg.streamSid;
          callSid = msg.start?.callSid;
          if (callSid && streamSid) {
            streamToCall.set(streamSid, callSid);
            speakingState.set(callSid, false);
            log(`Media stream started for call ${callSid}`, 'media');
          }
        } else if (msg.event === 'media' && callSid) {
          // Analyze audio payload for voice activity
          // Twilio sends base64-encoded mulaw audio
          const payload = msg.media?.payload;
          if (payload) {
            const audioBuffer = Buffer.from(payload, 'base64');
            
            // Calculate simple energy level from audio samples
            let energy = 0;
            for (let i = 0; i < audioBuffer.length; i++) {
              // Convert mulaw to linear approximation
              const sample = Math.abs(audioBuffer[i] - 128);
              energy += sample * sample;
            }
            energy = energy / audioBuffer.length;
            
            // Voice activity threshold (adjust as needed)
            const threshold = 50;
            const nowSpeaking = energy > threshold;
            
            if (nowSpeaking) {
              lastSpeakingTime = Date.now();
              if (!isSpeaking) {
                isSpeaking = true;
                speakingState.set(callSid, true);
                broadcastSpeakingState();
              }
            } else if (isSpeaking && Date.now() - lastSpeakingTime > 300) {
              // Stop speaking after 300ms of silence
              isSpeaking = false;
              speakingState.set(callSid, false);
              broadcastSpeakingState();
            }
          }
        } else if (msg.event === 'stop') {
          if (callSid) {
            speakingState.delete(callSid);
            broadcastSpeakingState();
            log(`Media stream stopped for call ${callSid}`, 'media');
          }
          if (streamSid) {
            streamToCall.delete(streamSid);
          }
        }
      } catch (err) {
        // Ignore parse errors
      }
    });
    
    ws.on('close', () => {
      if (callSid) {
        speakingState.delete(callSid);
        broadcastSpeakingState();
      }
      if (streamSid) {
        streamToCall.delete(streamSid);
      }
    });
  });
  
  /**
   * POST /voice/incoming
   * 
   * Handles incoming phone calls from Twilio.
   * Automatically joins the caller to the "banter-main" conference room.
   * 
   * Conference Settings:
   * - No PINs required
   * - No entry/exit beeps
   * - Starts when first person joins
   * - Continues even if everyone leaves temporarily
   * - Not recorded by default
   * 
   * Security: Validates Twilio webhook signature
   */
  app.post("/voice/incoming", validateTwilioWebhook, async (req, res) => {
    const callerNumber = req.body.From || "Unknown";
    const timestamp = new Date().toISOString();
    
    // Log incoming call details
    log(`📞 Incoming call from ${callerNumber} at ${timestamp}`, "twilio");
    
    // Check if caller is a listener (should be muted)
    let shouldMute = false;
    try {
      const participants = await storage.getExpectedParticipants();
      const normalizedCaller = normalizePhone(callerNumber);
      const matchingParticipant = participants.find(p => normalizePhone(p.phone) === normalizedCaller);
      if (matchingParticipant?.role === 'listener') {
        shouldMute = true;
        log(`👂 Caller ${callerNumber} is a listener - joining muted`, "twilio");
      }
    } catch (error) {
      // Continue without role check if it fails
    }
    
    // Create TwiML response
    const twiml = new VoiceResponse();
    
    // Get the host for the media stream WebSocket URL
    const host = req.headers.host || 'localhost:5000';
    const forwardedProto = req.headers['x-forwarded-proto'];
    const isSecure = forwardedProto === 'https' || req.protocol === 'https' || host.includes('replit');
    const protocol = isSecure ? 'wss' : 'ws';
    
    // Start media stream for voice activity detection
    const start = twiml.start();
    start.stream({
      url: `${protocol}://${host}/media-stream`,
      track: 'inbound_track'
    });
    
    // Build status callback URL for participant events using public base URL
    const baseUrl = getPublicBaseUrl(req);
    const statusCallbackUrl = `${baseUrl}/voice/conference-status`;
    
    // Join the caller to the conference
    const dial = twiml.dial();
    dial.conference({
      // Start the conference when the first person enters
      startConferenceOnEnter: true,
      
      // Keep the conference alive even if everyone leaves
      endConferenceOnExit: false,
      
      // Disable entry/exit beeps for walkie-talkie feel
      beep: 'false',
      
      // Don't record by default (set to 'record-from-start' if needed)
      record: 'do-not-record',
      
      // Mute listeners automatically
      muted: shouldMute,
      
      // Status callbacks for real-time participant tracking
      statusCallback: statusCallbackUrl,
      statusCallbackEvent: ['join', 'leave', 'mute', 'hold'] as any,
      
      // Disable hold music
      waitUrl: ''
    }, 'banter-main');
    
    // Send TwiML response
    res.type('text/xml');
    res.send(twiml.toString());
    
    log(`✅ Connected ${callerNumber} to conference "banter-main"`, "twilio");
  });
  
  /**
   * POST /voice/conference-status
   * 
   * Receives conference status callbacks from Twilio.
   * Tracks participant join/leave/mute events in real-time without polling.
   * 
   * Security: Validates Twilio webhook signature
   */
  app.post("/voice/conference-status", validateTwilioWebhook, (req, res) => {
    const { StatusCallbackEvent, CallSid, ConferenceSid, Muted, Hold, FriendlyName } = req.body;
    
    log(`📋 Conference status: ${StatusCallbackEvent} for call ${CallSid} in ${FriendlyName}`, "twilio");
    
    // Broadcast the event to all frontend clients
    const message = JSON.stringify({
      type: 'conference-status',
      data: {
        event: StatusCallbackEvent,
        callSid: CallSid,
        conferenceSid: ConferenceSid,
        muted: Muted === 'true',
        hold: Hold === 'true',
        timestamp: Date.now()
      }
    });
    
    frontendClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
    
    // Acknowledge receipt (Twilio expects 200 OK)
    res.status(200).send('OK');
  });
  
  /**
   * GET /api/speaking
   * 
   * Returns current speaking state for all participants.
   */
  app.get("/api/speaking", (_req, res) => {
    const stateObj: Record<string, boolean> = {};
    speakingState.forEach((speaking, callSid) => {
      stateObj[callSid] = speaking;
    });
    res.json(stateObj);
  });

  /**
   * GET /api/health
   * 
   * Simple health check endpoint to verify the server is running.
   */
  app.get("/api/health", (_req, res) => {
    res.json({ 
      status: "ok", 
      service: "banter",
      timestamp: new Date().toISOString()
    });
  });

  /**
   * POST /api/beta-request
   * 
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
        // Unique constraint violation - email already exists
        res.json({ success: true }); // Don't reveal that email was already submitted
      } else {
        log(`Error creating beta request: ${error.message}`, "beta");
        res.status(500).json({ error: "Failed to submit request" });
      }
    }
  });

  /**
   * POST /api/auth/send-code
   * 
   * Send a verification code via SMS to the provided phone number.
   */
  app.post("/api/auth/send-code", async (req, res) => {
    try {
      const { phone } = req.body;
      if (!phone) {
        return res.status(400).json({ error: "Phone number is required" });
      }

      const normalizedPhone = normalizePhone(phone);

      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      
      // Store code with 5-minute expiration
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      await storage.createVerificationCode(normalizedPhone, code, expiresAt);

      // Send SMS via Twilio with retry for rate limiting
      const client = await getTwilioClient();
      const fromNumber = await getTwilioFromPhoneNumber();
      
      await withRetry(() => client.messages.create({
        body: `Your Banter verification code is: ${code}`,
        from: fromNumber,
        to: normalizedPhone
      }));

      log(`📱 Sent verification code to ${normalizedPhone}`, "auth");
      res.json({ success: true, message: "Verification code sent" });
    } catch (error: any) {
      log(`Error sending verification code: ${error.message}`, "auth");
      res.status(500).json({ error: "Failed to send verification code" });
    }
  });

  /**
   * POST /api/auth/verify-code
   * 
   * Verify the code and return the authenticated phone number.
   */
  app.post("/api/auth/verify-code", async (req, res) => {
    try {
      const { phone, code } = req.body;
      if (!phone || !code) {
        return res.status(400).json({ error: "Phone and code are required" });
      }

      const normalizedPhone = normalizePhone(phone);

      // Check code
      const valid = await storage.verifyCode(normalizedPhone, code);
      
      if (!valid) {
        return res.status(401).json({ error: "Invalid or expired code" });
      }

      // Clean up used code
      await storage.deleteVerificationCodes(normalizedPhone);

      // Create signed auth token for this phone
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
   * 
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
   * 
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
   * 
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
   * 
   * Fetches current participants in the "team-main" conference.
   * Returns participant count and phone numbers.
   */
  app.get("/api/participants", async (_req, res) => {
    try {
      const client = await getTwilioClient();
      
      // Find active conferences named "banter-main"
      const conferences = await client.conferences.list({
        friendlyName: 'banter-main',
        status: 'in-progress',
        limit: 1
      });

      if (conferences.length === 0) {
        return res.json({ 
          count: 0, 
          participants: [],
          conferenceActive: false
        });
      }

      const conference = conferences[0];
      
      // Get participants in the conference
      const participants = await client.conferences(conference.sid)
        .participants.list();

      const participantList = participants.map(p => ({
        callSid: p.callSid,
        muted: p.muted,
        hold: p.hold,
        // Phone number is in the call, we need to fetch it
        label: p.label || 'Caller'
      }));

      // Get phone numbers for each participant and match to contacts
      const detailedParticipants = await Promise.all(
        participants.map(async (p) => {
          try {
            const call = await client.calls(p.callSid).fetch();
            const contact = await storage.getContactByPhone(call.from);
            return {
              callSid: p.callSid,
              phone: call.from,
              name: contact?.name || null,
              muted: p.muted,
              hold: p.hold,
              duration: call.duration
            };
          } catch {
            return {
              callSid: p.callSid,
              phone: 'Unknown',
              name: null,
              muted: p.muted,
              hold: p.hold
            };
          }
        })
      );

      res.json({ 
        count: participants.length, 
        participants: detailedParticipants,
        conferenceActive: true,
        conferenceSid: conference.sid
      });
    } catch (error: any) {
      log(`Error fetching participants: ${error.message}`, "twilio");
      res.status(500).json({ 
        error: "Failed to fetch participants",
        count: 0,
        participants: [],
        conferenceActive: false
      });
    }
  });

  // Rate limiting for sensitive endpoints
  const disconnectRateLimiter = new Map<string, { count: number; lastReset: number }>();
  const DISCONNECT_RATE_LIMIT = 3; // Max 3 disconnect attempts per minute
  const DISCONNECT_RATE_WINDOW = 60000; // 1 minute

  /**
   * POST /api/participants/check
   * 
   * Checks if the authenticated user's phone is already in the active conference.
   * Requires a valid auth token from phone verification.
   */
  app.post("/api/participants/check", async (req, res) => {
    try {
      const { authToken } = req.body;
      
      if (!authToken) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      // Verify the auth token and extract the phone
      const verifiedPhone = verifyAuthToken(authToken);
      if (!verifiedPhone) {
        return res.status(401).json({ error: "Invalid or expired authentication" });
      }
      
      const client = await getTwilioClient();
      const phoneToCheck = verifiedPhone; // Use the verified phone from token, not client input
      
      // Find active conference
      const conferences = await client.conferences.list({
        friendlyName: 'banter-main',
        status: 'in-progress',
        limit: 1
      });

      if (conferences.length === 0) {
        return res.json({ inConference: false, conferenceActive: false });
      }

      const conference = conferences[0];
      const participants = await client.conferences(conference.sid).participants.list();

      // Check each participant's phone number (both from and to for outbound calls)
      for (const p of participants) {
        try {
          const call = await client.calls(p.callSid).fetch();
          const fromPhone = normalizePhone(call.from);
          const toPhone = normalizePhone(call.to);
          
          // Match against both from and to (handles inbound and outbound/auto-dial)
          if (fromPhone === phoneToCheck || toPhone === phoneToCheck) {
            return res.json({ 
              inConference: true, 
              conferenceActive: true
            });
          }
        } catch {
          // Skip if we can't fetch call details
        }
      }

      return res.json({ inConference: false, conferenceActive: true });
    } catch (error: any) {
      log(`Error checking participant: ${error.message}`, "twilio");
      res.status(500).json({ error: "Failed to check participant status" });
    }
  });

  /**
   * POST /api/participants/disconnect-self
   * 
   * Disconnects the authenticated user's phone connection from the conference.
   * Requires a valid auth token from phone verification.
   * Rate limited to prevent abuse.
   */
  app.post("/api/participants/disconnect-self", async (req, res) => {
    try {
      const { authToken } = req.body;
      
      if (!authToken) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      // Verify the auth token and extract the phone
      const verifiedPhone = verifyAuthToken(authToken);
      if (!verifiedPhone) {
        return res.status(401).json({ error: "Invalid or expired authentication" });
      }
      
      const phoneToDisconnect = verifiedPhone; // Use verified phone from token, not client input
      
      // Rate limiting to prevent abuse
      const now = Date.now();
      const rateKey = phoneToDisconnect;
      const rateData = disconnectRateLimiter.get(rateKey);
      
      if (rateData) {
        if (now - rateData.lastReset > DISCONNECT_RATE_WINDOW) {
          // Reset window
          disconnectRateLimiter.set(rateKey, { count: 1, lastReset: now });
        } else if (rateData.count >= DISCONNECT_RATE_LIMIT) {
          log(`Rate limit exceeded for disconnect: ${phoneToDisconnect}`, "twilio");
          return res.status(429).json({ error: "Too many requests. Please wait a moment." });
        } else {
          rateData.count++;
        }
      } else {
        disconnectRateLimiter.set(rateKey, { count: 1, lastReset: now });
      }
      
      const client = await getTwilioClient();
      
      // Find active conference
      const conferences = await client.conferences.list({
        friendlyName: 'banter-main',
        status: 'in-progress',
        limit: 1
      });

      if (conferences.length === 0) {
        return res.status(404).json({ error: "No active conference" });
      }

      const conference = conferences[0];
      const participants = await client.conferences(conference.sid).participants.list();

      // Find and disconnect the participant's call
      for (const p of participants) {
        try {
          const call = await client.calls(p.callSid).fetch();
          const fromPhone = normalizePhone(call.from);
          const toPhone = normalizePhone(call.to);
          
          // Match against both from and to (handles inbound and outbound/auto-dial)
          if (fromPhone === phoneToDisconnect || toPhone === phoneToDisconnect) {
            await client.conferences(conference.sid)
              .participants(p.callSid)
              .remove();
            
            log(`Participant ${phoneToDisconnect} disconnected self for method switch`, "twilio");
            return res.json({ success: true });
          }
        } catch {
          // Skip if we can't fetch call details
        }
      }
      
      return res.status(404).json({ error: "Participant not found in conference" });
    } catch (error: any) {
      log(`Error disconnecting participant: ${error.message}`, "twilio");
      res.status(500).json({ error: "Failed to disconnect participant" });
    }
  });

  /**
   * POST /api/admin/verify
   * 
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
   * 
   * Mutes or unmutes a participant in the conference.
   * Requires admin PIN verification.
   */
  app.post("/api/admin/mute", async (req, res) => {
    try {
      const { pin, callSid, muted } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      if (!callSid || typeof muted !== 'boolean') {
        return res.status(400).json({ error: "callSid and muted are required" });
      }
      
      const client = await getTwilioClient();
      
      // Find the active conference
      const conferences = await client.conferences.list({
        friendlyName: 'banter-main',
        status: 'in-progress',
        limit: 1
      });
      
      if (conferences.length === 0) {
        return res.status(404).json({ error: "No active conference" });
      }
      
      const conference = conferences[0];
      
      // Update the participant's mute status
      await client.conferences(conference.sid)
        .participants(callSid)
        .update({ muted });
      
      log(`Participant ${callSid} ${muted ? 'muted' : 'unmuted'} by admin`, "twilio");
      
      res.json({ success: true, callSid, muted });
    } catch (error: any) {
      log(`Error muting participant: ${error.message}`, "twilio");
      res.status(500).json({ error: "Failed to update mute status" });
    }
  });

  /**
   * GET /api/expected
   * 
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
   * 
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
   * 
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
   * 
   * Updates an expected participant's details. Requires admin PIN.
   */
  app.patch("/api/expected/:id", async (req, res) => {
    try {
      const { pin, name, phone, email, role } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      // Validate role if provided
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
   * POST /api/expected/:id/remind
   * 
   * Sends an SMS reminder to an expected participant. Requires admin PIN.
   */
  app.post("/api/expected/:id/remind", async (req, res) => {
    try {
      const { pin } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const expected = await storage.getExpectedParticipants();
      const participant = expected.find(p => p.id === req.params.id);
      
      if (!participant) {
        return res.status(404).json({ error: "Participant not found" });
      }
      
      const client = await getTwilioClient();
      const twilioNumber = process.env.TWILIO_PHONE_NUMBER || '+12202423245';
      
      await withRetry(() => client.messages.create({
        body: `Hey ${participant.name}! Join the Banter call now: (220) 242-3245`,
        to: participant.phone,
        from: twilioNumber
      }));
      
      log(`SMS reminder sent to ${participant.name} at ${participant.phone}`, "twilio");
      res.json({ success: true });
    } catch (error: any) {
      log(`Error sending reminder: ${error.message}`, "twilio");
      res.status(500).json({ error: "Failed to send reminder" });
    }
  });

  /**
   * POST /api/expected/:id/call
   * 
   * Initiates an outbound call to an expected participant and connects them to the conference.
   * Requires admin PIN.
   */
  app.post("/api/expected/:id/call", async (req, res) => {
    try {
      const { pin } = req.body;
      const adminPin = process.env.ADMIN_PIN;
      
      if (!adminPin || pin !== adminPin) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const participant = await storage.getExpectedParticipant(req.params.id);
      
      if (!participant) {
        return res.status(404).json({ error: "Participant not found" });
      }
      
      const client = await getTwilioClient();
      const fromNumber = await getTwilioFromPhoneNumber();
      
      // Get the webhook URL for the call
      const host = req.headers.host || 'localhost:5000';
      const forwardedProto = req.headers['x-forwarded-proto'];
      const isSecure = forwardedProto === 'https' || req.protocol === 'https' || host.includes('replit');
      const protocol = isSecure ? 'https' : 'http';
      
      // Initiate outbound call to participant with retry for rate limiting
      const baseUrl = getPublicBaseUrl(req);
      const call = await withRetry(() => client.calls.create({
        to: normalizePhone(participant.phone),
        from: fromNumber,
        url: `${baseUrl}/voice/incoming`,
        method: 'POST'
      }));
      
      log(`📞 Outbound call initiated to ${participant.name} (${participant.phone}), callSid: ${call.sid}`, "twilio");
      res.json({ success: true, callSid: call.sid });
    } catch (error: any) {
      log(`Error initiating call: ${error.message}`, "twilio");
      res.status(500).json({ error: "Failed to initiate call" });
    }
  });

  /**
   * GET /api/banters
   * 
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
   * 
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
   * 
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
   * 
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

  // Cache for TwiML App SID
  let cachedTwimlAppSid: string | null = null;
  
  /**
   * POST /api/voice/token
   * 
   * Generates a Twilio Access Token for browser-based calling.
   * The token allows the browser client to connect to the Voice SDK.
   */
  app.post("/api/voice/token", async (req, res) => {
    try {
      const { identity } = req.body;
      
      if (!identity) {
        return res.status(400).json({ error: "Identity is required" });
      }
      
      const credentials = await getTwilioCredentials();
      const client = await getTwilioClient();
      
      // Get the webhook URL for browser calls
      const host = req.headers.host || 'localhost:5000';
      const forwardedProto = req.headers['x-forwarded-proto'];
      const isSecure = forwardedProto === 'https' || req.protocol === 'https' || host.includes('replit');
      const protocol = isSecure ? 'https' : 'http';
      const baseUrl = `${protocol}://${host}`;
      const voiceUrl = `${baseUrl}/voice/browser`;
      
      // Get or create TwiML App
      let twimlAppSid = cachedTwimlAppSid;
      
      if (!twimlAppSid) {
        // Check if we have one stored in env
        if (process.env.TWILIO_TWIML_APP_SID) {
          twimlAppSid = process.env.TWILIO_TWIML_APP_SID;
        } else {
          // Look for existing app with our name
          const apps = await client.applications.list({ friendlyName: 'Banter Browser Calling', limit: 1 });
          
          if (apps.length > 0) {
            twimlAppSid = apps[0].sid;
            // Update the voice URL in case it changed
            await client.applications(twimlAppSid).update({
              voiceUrl: voiceUrl,
              voiceMethod: 'POST'
            });
            log(`📱 Updated existing TwiML App: ${twimlAppSid}`, "twilio");
          } else {
            // Create new TwiML App
            const app = await client.applications.create({
              friendlyName: 'Banter Browser Calling',
              voiceUrl: voiceUrl,
              voiceMethod: 'POST'
            });
            twimlAppSid = app.sid;
            log(`📱 Created new TwiML App: ${twimlAppSid}`, "twilio");
          }
        }
        cachedTwimlAppSid = twimlAppSid;
      }
      
      // Create access token
      const accessToken = new twilio_jwt(
        credentials.accountSid,
        credentials.apiKey,
        credentials.apiKeySecret,
        {
          identity: identity,
          ttl: 3600 // 1 hour
        }
      );
      
      // Create voice grant with the TwiML App SID
      const voiceGrant = new twilio_jwt.VoiceGrant({
        outgoingApplicationSid: twimlAppSid,
        incomingAllow: false
      });
      
      accessToken.addGrant(voiceGrant);
      
      log(`🎫 Generated voice token for ${identity}`, "twilio");
      
      // Token TTL and recommended refresh time (30 seconds before expiry)
      const ttlSeconds = 3600;
      const expiresAt = Date.now() + (ttlSeconds * 1000);
      const refreshAt = expiresAt - (30 * 1000); // Refresh 30s before expiry
      
      res.json({ 
        token: accessToken.toJwt(),
        identity: identity,
        voiceUrl: voiceUrl,
        expiresAt: expiresAt,
        refreshAt: refreshAt,
        ttlSeconds: ttlSeconds
      });
    } catch (error: any) {
      log(`Error generating voice token: ${error.message}`, "twilio");
      res.status(500).json({ error: "Failed to generate voice token" });
    }
  });

  /**
   * POST /voice/browser
   * 
   * TwiML endpoint for browser-initiated calls.
   * Connects the browser client to the banter-main conference.
   * 
   * Security: Validates Twilio webhook signature
   */
  app.post("/voice/browser", validateTwilioWebhook, async (req, res) => {
    const identity = req.body.From || req.body.Caller || "web-user";
    const userName = req.body.userName || identity;
    
    log(`🌐 Browser client joining: ${userName}`, "twilio");
    
    // Check if this user should be muted (listener role)
    let shouldMute = false;
    try {
      const participants = await storage.getExpectedParticipants();
      const matchingParticipant = participants.find(p => p.name === userName);
      if (matchingParticipant?.role === 'listener') {
        shouldMute = true;
        log(`👂 Browser user ${userName} is a listener - joining muted`, "twilio");
      }
    } catch (error) {
      // Continue without role check
    }
    
    // Get the host for media stream
    const host = req.headers.host || 'localhost:5000';
    const forwardedProto = req.headers['x-forwarded-proto'];
    const isSecure = forwardedProto === 'https' || req.protocol === 'https' || host.includes('replit');
    const wsProtocol = isSecure ? 'wss' : 'ws';
    
    const twiml = new VoiceResponse();
    
    // Start media stream for voice activity detection
    const start = twiml.start();
    start.stream({
      url: `${wsProtocol}://${host}/media-stream`,
      track: 'inbound_track'
    });
    
    // Build status callback URL for participant events using public base URL
    const baseUrl = getPublicBaseUrl(req);
    const statusCallbackUrl = `${baseUrl}/voice/conference-status`;
    
    // Join the conference
    const dial = twiml.dial();
    dial.conference({
      startConferenceOnEnter: true,
      endConferenceOnExit: false,
      beep: 'false',
      record: 'do-not-record',
      muted: shouldMute,
      participantLabel: userName,
      statusCallback: statusCallbackUrl,
      statusCallbackEvent: ['join', 'leave', 'mute', 'hold'] as any,
      waitUrl: ''
    }, 'banter-main');
    
    res.type('text/xml');
    res.send(twiml.toString());
    
    log(`✅ Browser client ${userName} connected to conference "banter-main"`, "twilio");
  });

  return httpServer;
}

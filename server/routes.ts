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

import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import twilio from "twilio";
import { log } from "./index";
import { getTwilioClient } from "./twilio";

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
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
   */
  app.post("/voice/incoming", (req, res) => {
    const callerNumber = req.body.From || "Unknown";
    const timestamp = new Date().toISOString();
    
    // Log incoming call details
    log(`📞 Incoming call from ${callerNumber} at ${timestamp}`, "twilio");
    
    // Create TwiML response
    const twiml = new VoiceResponse();
    
    // Optional: Brief greeting (uncomment if desired)
    // twiml.say({ voice: 'alice' }, 'Welcome to the team channel.');
    
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
      
      // Optional: Start participants muted (uncomment if desired)
      // muted: true,
      
      // Optional: Wait music while alone (uncomment if desired)
      // waitUrl: 'http://com.twilio.sounds.music.s3.amazonaws.com/MARKOVICHAMP-Borghestral.mp3'
    }, 'banter-main');
    
    // Send TwiML response
    res.type('text/xml');
    res.send(twiml.toString());
    
    log(`✅ Connected ${callerNumber} to conference "banter-main"`, "twilio");
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
      
      await client.messages.create({
        body: `Hey ${participant.name}! Join the Banter call now: (220) 242-3245`,
        to: participant.phone,
        from: twilioNumber
      });
      
      log(`SMS reminder sent to ${participant.name} at ${participant.phone}`, "twilio");
      res.json({ success: true });
    } catch (error: any) {
      log(`Error sending reminder: ${error.message}`, "twilio");
      res.status(500).json({ error: "Failed to send reminder" });
    }
  });

  return httpServer;
}

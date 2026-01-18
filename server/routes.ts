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

const VoiceResponse = twilio.twiml.VoiceResponse;

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  /**
   * POST /voice/incoming
   * 
   * Handles incoming phone calls from Twilio.
   * Automatically joins the caller to the "team-main" conference room.
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
    }, 'team-main');
    
    // Send TwiML response
    res.type('text/xml');
    res.send(twiml.toString());
    
    log(`✅ Connected ${callerNumber} to conference "team-main"`, "twilio");
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

  return httpServer;
}

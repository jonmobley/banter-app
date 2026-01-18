import { storage } from "./storage";
import { getTwilioClient, getTwilioFromPhoneNumber } from "./twilio";
import { normalizePhone } from "@shared/schema";
import { log } from "./index";

let schedulerInterval: NodeJS.Timeout | null = null;

export async function startScheduler(getHost: () => string) {
  if (schedulerInterval) {
    return;
  }

  log("📅 Starting banter scheduler", "scheduler");

  schedulerInterval = setInterval(async () => {
    try {
      const now = new Date();

      // Check for banters that need reminders (5 min before)
      const bantersNeedingReminder = await storage.getBantersNeedingReminder(now);
      for (const banter of bantersNeedingReminder) {
        // Skip if reminder already sent (persisted in DB)
        if (banter.reminderSentAt) {
          continue;
        }

        log(`📱 Sending reminders for banter "${banter.name}"`, "scheduler");
        
        // Mark reminder as sent immediately to prevent duplicates
        await storage.updateScheduledBanter(banter.id, { reminderSentAt: new Date() });

        // Send SMS reminders to all participants
        const participants = await Promise.all(
          banter.participantIds.map(id => storage.getExpectedParticipant(id))
        );

        const client = await getTwilioClient();
        const fromNumber = await getTwilioFromPhoneNumber();

        for (const participant of participants) {
          if (!participant) continue;
          try {
            await client.messages.create({
              body: `Reminder: "${banter.name}" starts in 5 minutes! Call (220) 242-3245 to join.`,
              to: normalizePhone(participant.phone),
              from: fromNumber
            });
            log(`📱 Reminder sent to ${participant.name}`, "scheduler");
          } catch (err: any) {
            log(`Error sending reminder to ${participant.name}: ${err.message}`, "scheduler");
          }
        }
      }

      // Check for banters that should start now
      const pendingBanters = await storage.getPendingBantersForTime(now);
      for (const banter of pendingBanters) {
        log(`🚀 Starting banter "${banter.name}"`, "scheduler");

        // Mark as active
        await storage.updateScheduledBanter(banter.id, { status: 'active' });

        // If auto-call is enabled, call all participants
        if (banter.autoCallEnabled === 'true') {
          const participants = await Promise.all(
            banter.participantIds.map(id => storage.getExpectedParticipant(id))
          );

          const client = await getTwilioClient();
          const fromNumber = await getTwilioFromPhoneNumber();
          const host = getHost();
          const protocol = host.includes('replit') ? 'https' : 'http';

          for (const participant of participants) {
            if (!participant) continue;
            try {
              const call = await client.calls.create({
                to: normalizePhone(participant.phone),
                from: fromNumber,
                url: `${protocol}://${host}/voice/incoming`,
                method: 'POST'
              });
              log(`📞 Auto-called ${participant.name}, callSid: ${call.sid}`, "scheduler");
            } catch (err: any) {
              log(`Error calling ${participant.name}: ${err.message}`, "scheduler");
            }
          }
        }
      }
    } catch (err: any) {
      log(`Scheduler error: ${err.message}`, "scheduler");
    }
  }, 30000); // Check every 30 seconds
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    log("📅 Banter scheduler stopped", "scheduler");
  }
}

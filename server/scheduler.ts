import { storage } from "./storage";
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
        if (banter.reminderSentAt) {
          continue;
        }

        log(`📱 Reminder needed for banter "${banter.name}"`, "scheduler");
        
        // Mark reminder as sent
        await storage.updateScheduledBanter(banter.id, { reminderSentAt: new Date() });

        // Get participants for logging
        const participants = await Promise.all(
          banter.participantIds.map(id => storage.getExpectedParticipant(id))
        );

        for (const participant of participants) {
          if (!participant) continue;
          log(`📱 Reminder would be sent to ${participant.name} (${participant.phone})`, "scheduler");
        }
      }

      // Check for banters that should start now
      const pendingBanters = await storage.getPendingBantersForTime(now);
      for (const banter of pendingBanters) {
        log(`🚀 Starting banter "${banter.name}"`, "scheduler");

        // Mark as active
        await storage.updateScheduledBanter(banter.id, { status: 'active' });

        // Log participants who should join
        if (banter.autoCallEnabled === 'true') {
          const participants = await Promise.all(
            banter.participantIds.map(id => storage.getExpectedParticipant(id))
          );

          for (const participant of participants) {
            if (!participant) continue;
            log(`📞 ${participant.name} should join the banter`, "scheduler");
          }
        }
      }
    } catch (err: any) {
      log(`Scheduler error: ${err.message}`, "scheduler");
    }
  }, 30000);
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    log("📅 Banter scheduler stopped", "scheduler");
  }
}

import { storage } from "./storage";
import { log } from "./index";
import { sendReminderSMS } from "./twilio-sms";
import { normalizePhone } from "@shared/schema";

let schedulerInterval: NodeJS.Timeout | null = null;

export async function startScheduler(getHost: () => string) {
  if (schedulerInterval) {
    return;
  }

  log("📅 Starting banter scheduler", "scheduler");

  schedulerInterval = setInterval(async () => {
    try {
      const now = new Date();

      // Check for banters that need reminders (15 min before)
      const bantersNeedingReminder = await storage.getBantersNeedingReminder(now);
      for (const banter of bantersNeedingReminder) {
        if (banter.reminderSentAt) {
          continue;
        }

        log(`📱 Sending reminders for banter "${banter.name}"`, "scheduler");

        // Calculate minutes until start
        const scheduledTime = new Date(banter.scheduledAt);
        const minutesUntilStart = Math.round((scheduledTime.getTime() - now.getTime()) / (60 * 1000));

        // Get participants and send SMS reminders
        const participants = await Promise.all(
          banter.participantIds.map(id => storage.getExpectedParticipant(id))
        );

        let allSent = true;
        for (const participant of participants) {
          if (!participant) continue;
          try {
            const normalizedPhone = normalizePhone(participant.phone);
            const sent = await sendReminderSMS(normalizedPhone, banter.name, minutesUntilStart);
            if (sent) {
              log(`📱 Reminder sent to ${participant.name} (${participant.phone})`, "scheduler");
            } else {
              log(`⚠️ Failed to send reminder to ${participant.name}`, "scheduler");
              allSent = false;
            }
          } catch (err: any) {
            log(`⚠️ Error sending reminder to ${participant.name}: ${err.message}`, "scheduler");
            allSent = false;
          }
        }

        // Only mark reminder as sent after attempting all participants
        // Even if some failed, mark it to prevent repeated attempts every 30s
        await storage.updateScheduledBanter(banter.id, { reminderSentAt: new Date() });
        if (!allSent) {
          log(`⚠️ Some reminders failed for banter "${banter.name}"`, "scheduler");
        }
      }

      // Check for banters that should start now
      const pendingBanters = await storage.getPendingBantersForTime(now);
      for (const banter of pendingBanters) {
        log(`🚀 Activating banter "${banter.name}"`, "scheduler");

        await storage.updateScheduledBanter(banter.id, { status: 'active' });

        if (banter.autoCallEnabled === 'true') {
          const participants = await Promise.all(
            banter.participantIds.map(id => storage.getExpectedParticipant(id))
          );

          for (const participant of participants) {
            if (!participant) continue;
            try {
              const normalizedPhone = normalizePhone(participant.phone);
              const sent = await sendReminderSMS(normalizedPhone, banter.name, 0);
              if (sent) {
                log(`📱 Start notification sent to ${participant.name}`, "scheduler");
              }
            } catch (err: any) {
              log(`⚠️ Error sending start notification to ${participant.name}: ${err.message}`, "scheduler");
            }
          }
        }
      }

      // Mark active banters as completed after 2 hours past their scheduled time
      const activeBanters = await storage.getScheduledBanters();
      for (const banter of activeBanters) {
        if (banter.status === 'active') {
          const scheduledTime = new Date(banter.scheduledAt).getTime();
          const twoHoursAfter = scheduledTime + 2 * 60 * 60 * 1000;
          if (now.getTime() > twoHoursAfter) {
            await storage.updateScheduledBanter(banter.id, { status: 'completed' });
            log(`✅ Banter "${banter.name}" marked as completed`, "scheduler");
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

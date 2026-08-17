import { config } from './config.js';
import { getInactiveIncompleteConversations, markRegistrationReminderSent } from './supabase.js';
import { pickPreferencesReply, pickReplyText } from './replies.js';
import { sendWhatsAppMessage } from './whatsapp.js';

const REMINDER_PREFIX = "You're just a few minutes away from finishing your registration.";

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

function alreadyReminded(conversation) {
  return Boolean(conversation?.temp_data?.registration_reminder_sent_at);
}

function replyForStep(conversation) {
  if (conversation.step === 'collect_preferences') {
    return pickPreferencesReply(conversation.temp_data || {});
  }
  return pickReplyText(conversation.step).text;
}

/**
 * Sends one-time reminders to users who abandoned onboarding mid-flow.
 * The conversation step is not advanced, so their next reply continues exactly
 * where they left off.
 */
export async function sendRegistrationReminders() {
  if (!config.reminders.registrationReminderEnabled) return;

  const staleBefore = minutesAgo(config.reminders.registrationReminderAfterMinutes);
  const reachableAfter = minutesAgo(config.reminders.registrationReminderMaxAgeMinutes);

  const conversations = await getInactiveIncompleteConversations({
    staleBefore,
    limit: config.reminders.registrationReminderBatchSize,
  });

  for (const conversation of conversations) {
    if (alreadyReminded(conversation)) continue;
    if (conversation.updated_at && conversation.updated_at < reachableAfter) continue;

    try {
      await sendWhatsAppMessage(
        conversation.phone,
        `${REMINDER_PREFIX}\n\n${replyForStep(conversation)}`,
      );
      await markRegistrationReminderSent(conversation);
      console.log(`[reminders] Sent registration reminder to ${conversation.phone} at step ${conversation.step}`);
    } catch (err) {
      console.error(`[reminders] Failed registration reminder for ${conversation.phone}:`, err);
    }
  }
}

/**
 * Starts the lightweight in-process reminder loop for local/Railway deploys.
 */
export function startRegistrationReminderLoop() {
  if (!config.reminders.registrationReminderEnabled) {
    console.log('[reminders] Registration reminders disabled');
    return null;
  }

  const intervalMs = config.reminders.registrationReminderIntervalMinutes * 60 * 1000;
  const timer = setInterval(() => {
    sendRegistrationReminders().catch((err) => {
      console.error('[reminders] Reminder loop failed:', err);
    });
  }, intervalMs);

  sendRegistrationReminders().catch((err) => {
    console.error('[reminders] Initial reminder run failed:', err);
  });

  console.log(`[reminders] Registration reminder loop every ${config.reminders.registrationReminderIntervalMinutes} minute(s)`);
  return timer;
}

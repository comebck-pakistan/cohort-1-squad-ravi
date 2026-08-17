/**
 * icebreakerHandler.js
 *
 * Shared handler for interactive list_reply messages — covers BOTH paths:
 *   1. Meta Icebreakers (first-ever-open, configured in WhatsApp Manager UI)
 *   2. Returning-user welcome (triggered in code after 14+ days of inactivity)
 *
 * Both paths produce the same four list_reply.id values so they funnel here.
 */

import { getAllLiveMatchesForPhone, findFreelancer, findJobRequest } from '../supabase.js';
import { sendWhatsAppMessage } from '../whatsapp.js';
import { handleIncomingMessage } from './handleMessage.js';

const WELCOME_TEXT = [
  'Welcome to AI Matching Bot! 🚀',
  'First AI-powered WhatsApp assistant that connects clients with skilled freelancers',
  '',
  '📌 Commands you can use anytime:',
  '- Type "Hi" to get started with onboarding',
  '- Type "show my matches" to check your active matches',
  '- Type "change my rate" or "change my skills" to update info',
  '- Type "reset ai" to start over fresh',
  '',
  'Send "Hi" now to start your journey! 👋',
].join('\n');

/**
 * Handle an interactive list_reply from WhatsApp.
 *
 * @param {string} phone        - User's phone number (message.from)
 * @param {string} replyId      - interactive.list_reply.id from the webhook
 * @param {string} replyTitle   - interactive.list_reply.title (for logging)
 */
export async function handleIcebreakerReply(phone, replyId, replyTitle) {
  console.log(`[icebreaker] phone=${phone} replyId=${replyId} title="${replyTitle}"`);

  switch (replyId) {

    // "Get started" — send intro & commands text (user types "Hi" when ready to start onboarding)
    case 'start_onboarding':
      console.log(`[icebreaker] matched: start_onboarding for ${phone}`);
      await sendWhatsAppMessage(phone, WELCOME_TEXT);
      break;

    // "Show my matches"
    case 'show_matches':
      console.log(`[icebreaker] matched: show_matches for ${phone}`);
      await handleIncomingMessage({ phone, messageText: 'show my matches' });
      break;

    // "Update my info" — brief pointer to the edit commands
    case 'update_info':
      console.log(`[icebreaker] matched: update_info for ${phone}`);
      await sendWhatsAppMessage(
        phone,
        'To update your profile, just type a command like:\n\n' +
        '  • *change my rate to $50/hr*\n' +
        '  • *change my skills to React, Node.js*\n' +
        '  • *update my name to John*\n\n' +
        'I will update that field right away! ✏️'
      );
      break;

    // "What does this bot do?" — informational only (sends welcome/commands text)
    case 'learn_more':
      console.log(`[icebreaker] matched: learn_more for ${phone}`);
      await sendWhatsAppMessage(phone, WELCOME_TEXT);
      break;

    default:
      console.warn(`[icebreaker] Unknown replyId: ${replyId}`);
      await sendWhatsAppMessage(
        phone,
        "I didn't recognise that option. Type *Hi* to get started or *show my matches* to check your matches! 👋"
      );
  }
}

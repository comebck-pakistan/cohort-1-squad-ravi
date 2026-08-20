import { config } from './config.js';

// Equivalent of "WhatsApp Normal/Reset/Already Registered/Completion Reply" nodes - all of them
// were sending the same shape of request, just with different text, so one function covers them all.
export async function sendWhatsAppMessage(toPhone, bodyText) {
  const url = `https://graph.facebook.com/v25.0/${config.whatsapp.phoneNumberId}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.whatsapp.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'text',
        text: { preview_url: false, body: bodyText },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[whatsapp] sendWhatsAppMessage error (${response.status}) to ${toPhone}:`, errText);
    }
  } catch (err) {
    console.error(`[whatsapp] sendWhatsAppMessage exception for ${toPhone}:`, err.message);
  }
}

// Sends a WhatsApp Interactive Button Message (Quick-Reply Buttons).
// WhatsApp allows 1-3 buttons, title <= 20 chars.
// Falls back to regular text message if API errors occur.
export async function sendWhatsAppButtons(toPhone, bodyText, buttons, headerText = null, footerText = null) {
  const url = `https://graph.facebook.com/v25.0/${config.whatsapp.phoneNumberId}/messages`;

  // WhatsApp allows 1 to 3 buttons max, and title <= 20 chars
  const formattedButtons = (buttons || []).slice(0, 3).map((btn, index) => {
    const rawTitle = typeof btn === 'string' ? btn : (btn.title || `Option ${index + 1}`);
    const title = rawTitle.length > 20 ? rawTitle.slice(0, 19) + '…' : rawTitle;
    const id = (typeof btn === 'object' && btn.id) ? String(btn.id) : `btn_${index + 1}`;
    return {
      type: 'reply',
      reply: {
        id: id.slice(0, 256),
        title,
      },
    };
  });

  if (formattedButtons.length === 0) {
    return sendWhatsAppMessage(toPhone, bodyText);
  }

  const interactivePayload = {
    type: 'button',
    body: {
      text: bodyText,
    },
    action: {
      buttons: formattedButtons,
    },
  };

  if (headerText) {
    interactivePayload.header = {
      type: 'text',
      text: headerText,
    };
  }

  if (footerText) {
    interactivePayload.footer = {
      text: footerText,
    };
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.whatsapp.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'interactive',
        interactive: interactivePayload,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`WhatsApp sendButtons error (${response.status}):`, errText);
      console.log(`[whatsapp] Falling back to plain text for ${toPhone}`);
      await sendWhatsAppMessage(toPhone, bodyText);
    }
  } catch (err) {
    console.error(`WhatsApp sendButtons fetch exception:`, err);
    await sendWhatsAppMessage(toPhone, bodyText);
  }
}

// Sends a WhatsApp Interactive List Message — used for the returning-user
// welcome screen (same experience as Icebreakers, but triggered in code).
export async function sendWelcomeInteractive(toPhone) {
  const url = `https://graph.facebook.com/v25.0/${config.whatsapp.phoneNumberId}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: toPhone,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: 'Welcome back! 👋',
      },
      body: {
        text: 'Welcome back to AI Matching Bot! 🚀\nFirst AI-powered WhatsApp assistant that connects clients with skilled freelancers.',
      },
      footer: {
        text: 'Tap an option below to continue.',
      },
      action: {
        button: 'Choose an option',
        sections: [
          {
            title: 'What would you like to do?',
            rows: [
              { id: 'start_onboarding', title: 'Get started',             description: 'Register as freelancer or client' },
              { id: 'show_matches',     title: 'Show my matches',          description: 'See your active matches' },
              { id: 'update_info',      title: 'Update my info',           description: 'Edit your rate, skills, etc.' },
              { id: 'learn_more',       title: 'What does this bot do?',   description: 'See available commands' },
            ],
          },
        ],
      },
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.whatsapp.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`[welcome] sendWelcomeInteractive error (${response.status}):`, errText);
  }
}

export async function markAsReadAndTyping(messageId) {
  const url = `https://graph.facebook.com/v25.0/${config.whatsapp.phoneNumberId}/messages`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.whatsapp.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        typing_indicator: { type: 'text' },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      try {
        const errData = JSON.parse(errText);
        // Specifically catch and ignore code 100 / "does not exist" error.
        if (errData.error?.code === 100 && errData.error?.error_data?.details?.includes('does not exist')) {
          console.warn(`⚠️ Ignored mark-as-read error: Message ID does not exist yet or was duplicated (${messageId})`);
          return;
        }
      } catch (parseErr) {
        // Ignore JSON parse errors, just fall back to standard error logging
      }
      console.error(`WhatsApp markAsReadAndTyping error (${response.status}):`, errText);
    }
  } catch (err) {
    console.error(`WhatsApp markAsReadAndTyping fetch error:`, err);
  }
}

import { config } from './config.js';

// Equivalent of "WhatsApp Normal/Reset/Already Registered/Completion Reply" nodes - all of them
// were sending the same shape of request, just with different text, so one function covers them all.
export async function sendWhatsAppMessage(toPhone, bodyText) {
  const url = `https://graph.facebook.com/v25.0/${config.whatsapp.phoneNumberId}/messages`;

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
    console.error(`WhatsApp send error (${response.status}):`, errText);
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


// Advanced Roman Urdu Context & Lifecycle Command Interpreter (Noor's Contribution)
function coreCommandNormalizer(incomingText, sessionState = {}) {
    if (!incomingText) return incomingText;
    let cleanText = incomingText.toLowerCase().trim();
    
    // Convert Roman Urdu numbers if typed out in text format
    cleanText = cleanText.replace(/ek/g, '1').replace(/do/g, '2').replace(/teen/g, '3');

    // 1. Language Toggle Detection Switch
    if (cleanText === 'choose english' || cleanText === '1') {
        sessionState.preferred_language = 'english';
    } else if (cleanText === 'choose urdu' || cleanText === '2' || cleanText.includes('urdu')) {
        sessionState.preferred_language = 'roman_urdu';
    }

    // 2. High-Utility Contact Privacy & Match Lifecycle Translators
    if (cleanText.includes('rabta') || cleanText.includes('raabta') || cleanText.includes('number do')) {
        let matchIndex = cleanText.match(/\d+/);
        return matchIndex ? `request contact ${matchIndex}` : 'request contact 1';
    }
    
    if (cleanText.includes('dilchaspi') || cleanText.includes('kaam karna hai') || cleanText.includes('interested')) {
        let matchIndex = cleanText.match(/\d+/);
        return matchIndex ? `interested ${matchIndex}` : 'interested 1';
    }
    
    if (cleanText.includes('radd') || cleanText.includes('mana') || cleanText.includes('reject')) {
        let matchIndex = cleanText.match(/\d+/);
        return matchIndex ? `decline ${matchIndex}` : 'decline 1';
    }
    
    if (cleanText === 'theek hai' || cleanText === 'haan' || cleanText === 'ji' || cleanText === 'ji bilkul') {
        return 'yes';
    }
    
    if (cleanText === 'nahi' || cleanText === 'na' || cleanText === 'mat karo') {
        return 'no';
    }

    return incomingText;
}

if (typeof module !== 'undefined') {
    module.exports.coreCommandNormalizer = coreCommandNormalizer;
}

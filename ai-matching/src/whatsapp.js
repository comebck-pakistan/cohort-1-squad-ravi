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
    console.error(`WhatsApp markAsReadAndTyping error (${response.status}):`, errText);
  }
}

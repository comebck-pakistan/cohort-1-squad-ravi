import { config } from './config.js';

const lastMessageWasUrdu = new Map();

export function setUrduFlag(phone, isUrdu) {
  lastMessageWasUrdu.set(phone, isUrdu);
}

export function wasLastMessageUrdu(phone) {
  return lastMessageWasUrdu.get(phone) === true;
}

export async function detectRomanUrdu(messageText) {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.groq.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.groq.model,
        messages: [
          { role: 'system', content: "Reply with only one word: URDU if the message is written in Roman Urdu (Urdu words spelled using English letters, e.g. 'kya haal hai', 'mujhe kaam chahiye'), or ENGLISH otherwise. No other text." },
          { role: 'user', content: messageText },
        ],
      }),
    });
    if (!response.ok) return false;
    const data = await response.json();
    const answer = data.choices[0].message.content.trim().toUpperCase();
    return answer.includes('URDU');
  } catch (err) {
    console.error('[language] detection error:', err);
    return false;
  }
}

export async function translateToRomanUrdu(englishText) {
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.groq.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.groq.model,
        messages: [
          { role: 'system', content: "Translate the following WhatsApp bot message into casual, friendly Roman Urdu (Urdu written using English letters, e.g. 'Aap kaisay hain'). Keep any emojis. Reply with ONLY the translated text." },
          { role: 'user', content: englishText },
        ],
      }),
    });
    if (!response.ok) return englishText;
    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (err) {
    console.error('[language] translation error:', err);
    return englishText;
  }
}

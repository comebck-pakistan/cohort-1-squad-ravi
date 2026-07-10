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


// Advanced Roman Urdu Context & Lifecycle Command Interpreter 
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


// Autonomous Multi-Language Controller & AI Fallback Engine 
async function bulletproofMessageRouter(incomingText, sessionState = {}, groqClient = null) {
    if (!incomingText) return { text: incomingText, isAiFallback: false };
    let cleanText = incomingText.toLowerCase().trim();

    // 1. Establish/Maintain Language Track State
    if (!sessionState.preferred_language) {
        sessionState.preferred_language = 'english'; // Default fallback setting
    }
    if (cleanText === '1' || cleanText === 'choose english') {
        sessionState.preferred_language = 'english';
        return { text: 'english_selected', isAiFallback: false };
    }
    if (cleanText === '2' || cleanText === 'choose urdu' || cleanText.includes('urdu')) {
        sessionState.preferred_language = 'roman_urdu';
        return { text: 'urdu_selected', isAiFallback: false };
    }

    // 2. Deterministic Command Processing (The Loophole-Free Check)
    const exactCommands = {
        'yes': 'yes', 'haan': 'yes', 'ji': 'yes', 'theek hai': 'yes',
        'no': 'no', 'nahi': 'no', 'na': 'no', 'radd': 'no',
        'interested': 'interested', 'dilchaspi': 'interested',
        'decline': 'decline', 'mana': 'decline'
    };

    if (exactCommands[cleanText]) {
        return { text: exactCommands[cleanText], isAiFallback: false };
    }

    // 3. Advanced AI Fallback Processing (Dynamic Slang Translator Layer)
    // If the input doesn't match an exact word, pass it to Groq to extract user intent safely
    if (groqClient) {
        try {
            const aiTranslationResponse = await groqClient.chat.completions.create({
                messages: [{
                    role: "system",
                    content: "You are a specialized conversational intent mapping API. Analyze the incoming informal Roman Urdu or English user text and map it strictly to one of these system keywords: 'yes', 'no', 'interested', 'decline'. If it matches none, output 'unrecognized'."
                }, {
                    role: "user",
                    content: incomingText
                }],
                model: "llama3-8b-8192", // Utilizing team's active saving model configuration
                temperature: 0.1
            });

            let extractedIntent = aiTranslationResponse.choices[0].message.content.toLowerCase().trim();
            if (['yes', 'no', 'interested', 'decline'].includes(extractedIntent)) {
                return { text: extractedIntent, isAiFallback: true };
            }
        } catch (error) {
            console.error("AI Fallback Routing failed, deploying deterministic logic:", error);
        }
    }

    return { text: incomingText, isAiFallback: false }; // Safe string pass-through
}

if (typeof module !== 'undefined') {
    module.exports.bulletproofMessageRouter = bulletproofMessageRouter;
}

// Multi-Gateway Payment Escrow Hook 
const adaptivePayments = require('./adaptivePayments');

function processGlobalOrLocalEscrow(incomingMessage, senderPhone, activeMatchRow) {
    if (activeMatchRow.status === 'mutual_interest') {
        return adaptivePayments.routeAdaptiveMilestone(incomingMessage, senderPhone, activeMatchRow);
    }
    // Safe pass-through if match status is not in escrow stage
    return null;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports.processGlobalOrLocalEscrow = processGlobalOrLocalEscrow;
}

// Autonomous Project QA Router Hook 
const qaInspector = require('./qaInspector');

async function interceptFreelancerDelivery(incomingMessage, activeJobScope, groqInstance) {
    if (incomingMessage.toLowerCase().includes('completed') || incomingMessage.includes('submit')) {
        let qaReport = await qaInspector.runAutomatedScopeReview(incomingMessage, activeJobScope, groqInstance);
        
        if (qaReport.status === 'failed_qa') {
            return {
                target: 'freelancer',
                message: `⚠️ QA Guard Review Note: Aapki submission check ki gayi hai aur usme kuch cheezain missing hain.\nFeedback: ${qaReport.feedback}\n\nPlease update your files and submit again to unlock client escrow!`
            };
        } else {
            return {
                target: 'client',
                message: `✅ QA Shield Verified! Freelancer has completed all scope requirements perfectly.\nFeedback: ${qaReport.feedback}\n\nEscrow milestone payment release karne ke liye '1' ya 'release payment' reply karein.`
            };
        }
    }
    return null;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports.interceptFreelancerDelivery = interceptFreelancerDelivery;
}


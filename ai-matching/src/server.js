import express from 'express';
import { config } from './config.js';
import { handleIncomingMessage } from './handlers/handleMessage.js';
import { handleIcebreakerReply } from './handlers/icebreakerHandler.js';
import { markAsReadAndTyping, sendWhatsAppMessage } from './whatsapp.js';
import { checkAndTriggerDueFeedback } from './feedback.js';

const app = express();
app.use(express.json());

// --- Equivalent of "Webhook Verify (GET)" + "Respond Verification Challenge" ---
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  //console.log('DEBUG:', { mode, token, expected: config.whatsapp.verifyToken });

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    console.log('✅ Webhook verified');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// A simple Set to store recently seen message IDs to deduplicate incoming webhooks
const processedMessageIds = new Set();

// --- Equivalent of "Webhook Receive Message (POST)" + "Extract Webhook Data" + "Is Real Message?" ---
app.post('/webhook', async (req, res) => {
  // Acknowledge Meta immediately (equivalent of "Acknowledge Meta (200 OK)")
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    // Meta also sends delivery/read receipts (value.statuses) on this same URL - ignore those.
    if (!message) return;

    // Deduplication check: ignore if we have already processed this exact message ID
    if (processedMessageIds.has(message.id)) {
      console.log(`♻️ Skipping duplicate webhook for message ID: ${message.id}`);
      return;
    }
    processedMessageIds.add(message.id);

    // Keep the Set size manageable (prevent memory leak)
    if (processedMessageIds.size > 1000) {
      // Remove the oldest 100 entries
      const iterator = processedMessageIds.values();
      for (let i = 0; i < 100; i++) {
        processedMessageIds.delete(iterator.next().value);
      }
    }

    try {
      await markAsReadAndTyping(message.id);
    } catch (err) {
      console.error('Error marking as read/typing:', err);
    }

    const phone = message.from;

    // --- INTERACTIVE MESSAGES (list_reply / button_reply) ---
    if (message.type === 'interactive') {
      const listReply = message.interactive?.list_reply;
      const buttonReply = message.interactive?.button_reply;

      if (listReply?.id) {
        const icebreakerIds = ['start_onboarding', 'show_matches', 'update_info', 'learn_more'];
        if (icebreakerIds.includes(listReply.id)) {
          await handleIcebreakerReply(phone, listReply.id, listReply.title || '');
          return;
        }
        await handleIncomingMessage({ phone, messageText: listReply.id, buttonPayload: listReply });
        return;
      }

      if (buttonReply?.id) {
        console.log(`[server] Button reply: phone=${phone}, id=${buttonReply.id}, title="${buttonReply.title}"`);
        await handleIncomingMessage({ phone, messageText: buttonReply.id, buttonPayload: buttonReply });
        return;
      }

      console.log(`[server] Unsupported interactive sub-type for phone=${phone}, ignoring.`);
      return;
    }

    if (message.type !== 'text') {
      await sendWhatsAppMessage(
        phone,
        "I can only read text messages right now. Please type out your answer or send a link instead! 📝"
      );
      return;
    }

    const messageText = message.text?.body || '';

    await handleIncomingMessage({ phone, messageText });
  } catch (err) {
    console.error('Error handling webhook event:', err);
  }
});

app.get('/', (req, res) => {
  res.send('The bot is running.');
});

// Endpoint to trigger post-project feedback check manually or via cron
app.all('/api/check-feedback', async (req, res) => {
  try {
    const triggered = await checkAndTriggerDueFeedback();
    res.json({ ok: true, feedback_prompts_triggered: triggered });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(config.port, () => {
  console.log(`🚀 The bot listening on port ${config.port}`);

  // Run periodic background feedback scan every 6 hours (21,600,000 ms)
  setInterval(() => {
    checkAndTriggerDueFeedback().catch(err => console.error('[server] Background feedback scan error:', err));
  }, 6 * 60 * 60 * 1000);
});

import express from 'express';
import { config } from './config.js';
import { handleIncomingMessage } from './handlers/handleMessage.js';
import { markAsReadAndTyping, sendWhatsAppMessage } from './whatsapp.js';

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

    try {
      await markAsReadAndTyping(message.id);
    } catch (err) {
      console.error('Error marking as read/typing:', err);
    }

    const phone = message.from;

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

app.listen(config.port, () => {
  console.log(`🚀 The bot listening on port ${config.port}`);
});

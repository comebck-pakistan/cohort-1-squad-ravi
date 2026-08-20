import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config, validateConfig } from './config.js';
import { handleIncomingMessage } from './handlers/handleMessage.js';
import { handleIcebreakerReply } from './handlers/icebreakerHandler.js';
import { markAsReadAndTyping, sendWhatsAppMessage } from './whatsapp.js';
import { checkAndTriggerDueFeedback } from './feedback.js';
import { checkAndTriggerWeeklyPulse } from './pulse.js';
import {
  verifyMetaWebhookSignature,
  requireCronAuth,
  userRateLimiter,
  maskPhone,
  sanitizeUserMessage,
} from './security.js';

// Validate configuration on boot
validateConfig();

const app = express();

// Trust reverse proxies (ngrok, Railway, Heroku) so client IPs and rate limiting work accurately
app.set('trust proxy', 1);

// 1. Security Headers via Helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // API server does not render HTML
    crossOriginEmbedderPolicy: false,
  })
);

// 2. Global HTTP Request Body Limits & Raw Body Capture for HMAC verification
app.use(
  express.json({
    limit: '64kb',
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// 3. Global IP-based Rate Limiter (Protects against volumetric HTTP flood/DoS)
const apiLimiter = rateLimit({
  windowMs: config.security.httpRateLimitWindowMs,
  max: config.security.httpRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  message: { error: 'Too many requests, please try again later.' },
});
app.use(apiLimiter);

// --- Webhook Verify (GET) ---
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    console.log('✅ Webhook verified successfully');
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// A Set to store recently seen message IDs to deduplicate incoming webhooks
const processedMessageIds = new Set();

// --- Webhook Receive Message (POST) with HMAC Signature Verification ---
app.post('/webhook', verifyMetaWebhookSignature, async (req, res) => {
  // Acknowledge Meta immediately
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
      const iterator = processedMessageIds.values();
      for (let i = 0; i < 100; i++) {
        processedMessageIds.delete(iterator.next().value);
      }
    }

    const phone = message.from;
    const masked = maskPhone(phone);

    // Rate Limiting per WhatsApp Phone Number
    const rateCheck = userRateLimiter.check(phone);
    if (!rateCheck.allowed) {
      console.warn(`⏳ Rate limit exceeded for user ${masked}. Retry after ${rateCheck.retryAfterSec}s`);
      await sendWhatsAppMessage(
        phone,
        `⏳ *Please slow down a bit!*\nYou are sending messages too quickly. Please wait ${rateCheck.retryAfterSec} seconds before sending your next message.`
      );
      return;
    }

    try {
      await markAsReadAndTyping(message.id);
    } catch (err) {
      console.error(`Error marking as read/typing for ${masked}:`, err.message);
    }

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
        console.log(`[server] Button reply from ${masked}: id=${buttonReply.id}`);
        await handleIncomingMessage({ phone, messageText: buttonReply.id, buttonPayload: buttonReply });
        return;
      }

      console.log(`[server] Unsupported interactive sub-type for ${masked}, ignoring.`);
      return;
    }

    if (message.type !== 'text') {
      await sendWhatsAppMessage(
        phone,
        'I can only read text messages right now. Please type out your answer or send a link instead! 📝'
      );
      return;
    }

    // Sanitize and cap text length
    const rawText = message.text?.body || '';
    const messageText = sanitizeUserMessage(rawText, config.security.maxMessageLength);

    await handleIncomingMessage({ phone, messageText });
  } catch (err) {
    console.error('Error handling webhook event:', err);
  }
});

app.get('/', (req, res) => {
  res.send('The bot is running.');
});

// Endpoint to trigger post-project feedback check (Protected with Cron Auth)
app.post('/api/check-feedback', requireCronAuth, async (req, res) => {
  try {
    const triggered = await checkAndTriggerDueFeedback();
    res.json({ ok: true, feedback_prompts_triggered: triggered });
  } catch (err) {
    console.error('[api/check-feedback] Execution error:', err);
    res.status(500).json({ ok: false, error: 'Internal server error processing feedback scan' });
  }
});

// Support GET for testing if authorized
app.get('/api/check-feedback', requireCronAuth, async (req, res) => {
  try {
    const triggered = await checkAndTriggerDueFeedback();
    res.json({ ok: true, feedback_prompts_triggered: triggered });
  } catch (err) {
    console.error('[api/check-feedback] Execution error:', err);
    res.status(500).json({ ok: false, error: 'Internal server error processing feedback scan' });
  }
});

// Endpoint to trigger weekly availability pulse check-in (Protected with Cron Auth)
app.post('/api/check-pulse', requireCronAuth, async (req, res) => {
  try {
    const sent = await checkAndTriggerWeeklyPulse();
    res.json({ ok: true, pulse_prompts_sent: sent });
  } catch (err) {
    console.error('[api/check-pulse] Execution error:', err);
    res.status(500).json({ ok: false, error: 'Internal server error processing pulse scan' });
  }
});

// Support GET for testing if authorized
app.get('/api/check-pulse', requireCronAuth, async (req, res) => {
  try {
    const sent = await checkAndTriggerWeeklyPulse();
    res.json({ ok: true, pulse_prompts_sent: sent });
  } catch (err) {
    console.error('[api/check-pulse] Execution error:', err);
    res.status(500).json({ ok: false, error: 'Internal server error processing pulse scan' });
  }
});

app.listen(config.port, () => {
  console.log(`🚀 The bot listening on port ${config.port}`);

  // Run periodic background feedback scan every 6 hours (21,600,000 ms)
  setInterval(() => {
    checkAndTriggerDueFeedback().catch(err => console.error('[server] Background feedback scan error:', err));
  }, 6 * 60 * 60 * 1000);

  // Run periodic background availability pulse scan every 12 hours (43,200,000 ms)
  setInterval(() => {
    checkAndTriggerWeeklyPulse().catch(err => console.error('[server] Background pulse scan error:', err));
  }, 12 * 60 * 60 * 1000);
});

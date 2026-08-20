import crypto from 'node:crypto';
import { config } from './config.js';

/**
 * Validates Meta's X-Hub-Signature-256 header against the raw request body.
 * Prevents webhook spoofing and unauthorized message injection.
 */
export function verifyMetaWebhookSignature(req, res, next) {
  const appSecret = config.whatsapp.appSecret;

  // If no app secret configured (e.g. initial dev), pass through with warning
  if (!appSecret) {
    return next();
  }

  const signatureHeader = req.headers['x-hub-signature-256'];
  if (!signatureHeader) {
    console.warn('⚠️ Webhook request rejected: missing X-Hub-Signature-256 header');
    return res.status(401).json({ error: 'Missing X-Hub-Signature-256 header' });
  }

  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') {
    console.warn('⚠️ Webhook request rejected: malformed signature header');
    return res.status(401).json({ error: 'Malformed X-Hub-Signature-256 header' });
  }

  const clientSignature = parts[1];
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));

  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  const clientBuffer = Buffer.from(clientSignature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (clientBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(clientBuffer, expectedBuffer)) {
    console.warn('⚠️ Webhook request rejected: invalid HMAC signature');
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  next();
}

/**
 * Middleware to protect internal automation & cron endpoints (/api/check-*).
 * Requires Authorization: Bearer <CRON_SECRET> or X-API-Key: <CRON_SECRET>.
 */
export function requireCronAuth(req, res, next) {
  const cronSecret = config.security.cronSecret;

  // If no cron secret is configured, warn but allow execution
  if (!cronSecret) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const apiKeyHeader = req.headers['x-api-key'];
  const querySecret = req.query.secret;

  const providedToken = bearerToken || apiKeyHeader || querySecret;

  if (!providedToken) {
    return res.status(401).json({ ok: false, error: 'Unauthorized: missing authorization token' });
  }

  const providedBuffer = Buffer.from(String(providedToken), 'utf8');
  const expectedBuffer = Buffer.from(cronSecret, 'utf8');

  if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
    return res.status(401).json({ ok: false, error: 'Unauthorized: invalid token' });
  }

  next();
}

/**
 * In-memory sliding window rate limiter per WhatsApp phone number.
 * Prevents rapid message bursts and API quota exhaustion (Denial of Wallet).
 */
export class UserRateLimiter {
  constructor({ maxMessages = 10, windowMs = 60000 } = {}) {
    this.maxMessages = maxMessages;
    this.windowMs = windowMs;
    this.records = new Map();

    // Periodically prune stale rate limit windows every 5 minutes
    setInterval(() => this.prune(), 5 * 60 * 1000).unref();
  }

  /**
   * Checks whether a message from a given phone number is within rate limits.
   * @param {string} phone
   * @returns {{ allowed: boolean, remaining: number, retryAfterSec: number }}
   */
  check(phone) {
    if (!phone) return { allowed: true, remaining: this.maxMessages, retryAfterSec: 0 };

    const now = Date.now();
    const windowStart = now - this.windowMs;

    let timestamps = this.records.get(phone) || [];
    // Keep only timestamps within current window
    timestamps = timestamps.filter(ts => ts > windowStart);

    if (timestamps.length >= this.maxMessages) {
      const oldest = timestamps[0];
      const retryAfterSec = Math.ceil((oldest + this.windowMs - now) / 1000);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(1, retryAfterSec),
      };
    }

    timestamps.push(now);
    this.records.set(phone, timestamps);

    return {
      allowed: true,
      remaining: this.maxMessages - timestamps.length,
      retryAfterSec: 0,
    };
  }

  prune() {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    for (const [phone, timestamps] of this.records.entries()) {
      const active = timestamps.filter(ts => ts > windowStart);
      if (active.length === 0) {
        this.records.delete(phone);
      } else {
        this.records.set(phone, active);
      }
    }
  }
}

export const userRateLimiter = new UserRateLimiter({
  maxMessages: config.security.userRateLimitMaxMessages,
  windowMs: config.security.userRateLimitWindowMs,
});

/**
 * Cooldown rate limiter specifically for on-demand live match searches.
 * Prevents spamming searches, hammering Groq AI, and pinging other candidates repeatedly.
 */
export class MatchSearchRateLimiter {
  constructor({ cooldownMs = 600000 } = {}) {
    this.cooldownMs = cooldownMs;
    this.lastSearched = new Map();

    setInterval(() => this.prune(), 10 * 60 * 1000).unref();
  }

  /**
   * Checks whether an on-demand match search is allowed for this phone number.
   * @param {string} phone
   * @returns {{ allowed: boolean, retryAfterMin: number }}
   */
  check(phone) {
    if (!phone) return { allowed: true, retryAfterMin: 0 };
    const now = Date.now();
    const last = this.lastSearched.get(phone);

    if (last && (now - last) < this.cooldownMs) {
      const remainingMs = this.cooldownMs - (now - last);
      const retryAfterMin = Math.ceil(remainingMs / 60000);
      return {
        allowed: false,
        retryAfterMin: Math.max(1, retryAfterMin),
      };
    }

    return { allowed: true, retryAfterMin: 0 };
  }

  /**
   * Records a completed on-demand search timestamp.
   * @param {string} phone
   */
  record(phone) {
    if (phone) {
      this.lastSearched.set(phone, Date.now());
    }
  }

  prune() {
    const now = Date.now();
    for (const [phone, ts] of this.lastSearched.entries()) {
      if ((now - ts) > this.cooldownMs * 2) {
        this.lastSearched.delete(phone);
      }
    }
  }
}

export const matchSearchLimiter = new MatchSearchRateLimiter({
  cooldownMs: config.security.matchSearchCooldownMs,
});

/**
 * Masks a phone number for privacy in application logs.
 * e.g., "+12345678901" -> "+1234****901"
 * @param {string} phone
 * @returns {string}
 */
export function maskPhone(phone) {
  if (!phone || typeof phone !== 'string') return '';
  const clean = phone.trim();
  if (clean.length <= 6) return clean;
  const start = clean.slice(0, 4);
  const end = clean.slice(-2);
  return `${start}****${end}`;
}

/**
 * Validates whether a given string is a safe, well-formed web URL.
 * Only allows http and https protocols to prevent javascript:, file:, or data: attacks.
 * @param {string} urlString
 * @returns {boolean}
 */
export function isValidUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return false;
  const trimmed = urlString.trim();
  if (trimmed.length > 2048 || trimmed.length < 3) return false;

  // Explicitly reject dangerous or local pseudo-schemes
  if (/^(javascript|data|file|vbscript|about|blob):/i.test(trimmed)) {
    return false;
  }

  try {
    let parsed;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(trimmed)) {
      parsed = new URL(trimmed);
    } else if (trimmed.includes('://')) {
      return false;
    } else {
      // Must have valid domain-like syntax (e.g. example.com or github.com/user)
      if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:[/?#]|$)/i.test(trimmed)) {
        return false;
      }
      parsed = new URL(`https://${trimmed}`);
    }
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !!parsed.hostname;
  } catch {
    return false;
  }
}

/**
 * Sanitizes a URL, prepending https:// if protocol is omitted, or returning null if invalid.
 * @param {string} urlString
 * @returns {string|null}
 */
export function sanitizeUrl(urlString) {
  if (!isValidUrl(urlString)) return null;
  const trimmed = urlString.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

/**
 * Sanitizes user input string before feeding into LLM prompts.
 * Caps length and removes control characters.
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
export function sanitizeUserMessage(text, maxLen = config.security.maxMessageLength) {
  if (!text) return '';
  // Remove null bytes and non-printable control characters (retain newlines and tabs)
  const cleaned = String(text).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return cleaned.trim().slice(0, maxLen);
}

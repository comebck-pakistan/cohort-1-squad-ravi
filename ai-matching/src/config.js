import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    appSecret: process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET || '',
  },

  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },

  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    model: process.env.GROQ_MODEL || 'qwen/qwen3.6-27b',
  },

  huggingface: {
    apiKey: process.env.HUGGINGFACE_API_KEY || '',
    model: process.env.HUGGINGFACE_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
  },

  security: {
    cronSecret: process.env.CRON_SECRET || process.env.ADMIN_API_KEY || '',
    userRateLimitMaxMessages: parseInt(process.env.RATE_LIMIT_USER_MAX || '10', 10),
    userRateLimitWindowMs: parseInt(process.env.RATE_LIMIT_USER_WINDOW_MS || '60000', 10),
    httpRateLimitMax: parseInt(process.env.RATE_LIMIT_HTTP_MAX || '120', 10),
    httpRateLimitWindowMs: parseInt(process.env.RATE_LIMIT_HTTP_WINDOW_MS || '60000', 10),
    maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH || '1000', 10),
    matchSearchCooldownMs: parseInt(process.env.MATCH_SEARCH_COOLDOWN_MS || '600000', 10),
  },

  matching: {
    ruleWeight:      0.4,
    aiWeight:        0.6,
    threshold:       50,
    maxMatches:      3,
    vectorThreshold: 0.3,
    vectorTopK:      10,
  },
};

/**
 * Validates that all mission-critical environment variables are configured.
 * Throws a fatal error if any essential secrets are missing.
 */
export function validateConfig() {
  const critical = [
    ['WHATSAPP_VERIFY_TOKEN', config.whatsapp.verifyToken],
    ['WHATSAPP_PHONE_NUMBER_ID', config.whatsapp.phoneNumberId],
    ['WHATSAPP_ACCESS_TOKEN', config.whatsapp.accessToken],
    ['SUPABASE_URL', config.supabase.url],
    ['SUPABASE_SERVICE_ROLE_KEY', config.supabase.serviceRoleKey],
    ['GROQ_API_KEY', config.groq.apiKey],
  ];

  const missing = critical.filter(([, val]) => !val || !val.trim());
  if (missing.length > 0) {
    const missingNames = missing.map(([name]) => name).join(', ');
    throw new Error(`❌ Fatal Configuration Error: Missing required environment variable(s): ${missingNames}`);
  }

  if (!config.whatsapp.appSecret) {
    console.warn('⚠️  Security Notice: WHATSAPP_APP_SECRET is not set. Webhook HMAC signature verification is disabled (development mode). Set WHATSAPP_APP_SECRET in production.');
  }

  if (!config.security.cronSecret) {
    console.warn('⚠️  Security Notice: CRON_SECRET is not set. Internal API endpoints (/api/check-*) will not enforce authorization headers.');
  }
}

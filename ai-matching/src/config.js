import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.warn(`⚠️  Missing environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: process.env.PORT || 3000,

  whatsapp: {
    verifyToken: required('WHATSAPP_VERIFY_TOKEN'),
    phoneNumberId: required('WHATSAPP_PHONE_NUMBER_ID'),
    accessToken: required('WHATSAPP_ACCESS_TOKEN'),
  },

  supabase: {
    url: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  },

  groq: {
    apiKey: required('GROQ_API_KEY'),
    model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
  },

  github: {
    token: process.env.GITHUB_TOKEN || null,
  },

  reminders: {
    registrationReminderEnabled: process.env.REGISTRATION_REMINDER_ENABLED !== 'false',
    registrationReminderAfterMinutes: Number(process.env.REGISTRATION_REMINDER_AFTER_MINUTES || 60),
    registrationReminderMaxAgeMinutes: Number(process.env.REGISTRATION_REMINDER_MAX_AGE_MINUTES || 1380),
    registrationReminderIntervalMinutes: Number(process.env.REGISTRATION_REMINDER_INTERVAL_MINUTES || 10),
    registrationReminderBatchSize: Number(process.env.REGISTRATION_REMINDER_BATCH_SIZE || 25),
  },
};

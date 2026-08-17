import { supabase } from './supabase.js';
import { sendWhatsAppButtons } from './whatsapp.js';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Checks if a freelancer is due for their weekly availability pulse check-in.
 *
 * @param {object} freelancer
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isFreelancerDueForPulse(freelancer, now = new Date()) {
  if (!freelancer || freelancer.status !== 'active') return false;
  if (!freelancer.last_pulse_at) return true;

  const lastPulseDate = new Date(freelancer.last_pulse_at);
  if (isNaN(lastPulseDate.getTime())) return true;

  return (now.getTime() - lastPulseDate.getTime()) >= SEVEN_DAYS_MS;
}

/**
 * Parses user input or button ID into a structured availability status.
 *
 * @param {string} input
 * @returns {{ status: 'available_now'|'limited_hours'|'paused', isAvailable: boolean, label: string, replyMessage: string } | null}
 */
export function parsePulseSelection(input) {
  if (!input) return null;
  const lower = input.toLowerCase().trim();

  // 🟢 Available Now
  if (
    lower === 'pulse_avail_now' ||
    lower === 'available now' ||
    lower === 'available' ||
    lower === 'ready' ||
    lower === 'im available' ||
    lower === "i'm available" ||
    lower === 'i am available' ||
    lower === 'keep active' ||
    /\b(available now|i am available|i'm available|ready to work|active)\b/i.test(lower)
  ) {
    return {
      status: 'available_now',
      isAvailable: true,
      label: '🟢 Available Now',
      replyMessage: "Awesome! 🟢 Your profile is active and prioritized for new client matches this week.",
    };
  }

  // 🟡 Limited Hours
  if (
    lower === 'pulse_avail_limited' ||
    lower === 'limited hours' ||
    lower === 'limited' ||
    lower === 'part-time' ||
    lower === 'part time' ||
    lower === 'few hours' ||
    /\b(limited hours|limited capacity|part[- ]time)\b/i.test(lower)
  ) {
    return {
      status: 'limited_hours',
      isAvailable: true,
      label: '🟡 Limited Hours',
      replyMessage: "Got it! 🟡 We've noted your limited hours and will match you with flexible, project-based opportunities.",
    };
  }

  // 🔴 Booked / Pause
  if (
    lower === 'pulse_avail_pause' ||
    lower === 'booked / pause' ||
    lower === 'booked' ||
    lower === 'pause' ||
    lower === 'paused' ||
    lower === 'busy' ||
    lower === 'not available' ||
    lower === 'pause matches' ||
    /\b(booked|pause matches|pause my account|not available|too busy)\b/i.test(lower)
  ) {
    return {
      status: 'paused',
      isAvailable: false,
      label: '🔴 Booked / Pause',
      replyMessage: "Understood! 🔴 We've paused new match notifications so you can focus on your current work. Reply *available* anytime to reactivate.",
    };
  }

  return null;
}

/**
 * Sends the 1-tap weekly availability pulse message via WhatsApp.
 *
 * @param {string} phone
 * @param {string} [name]
 */
export async function sendAvailabilityPulse(phone, name = 'there') {
  const bodyText = `Hey ${name}! 👋 Quick check-in for this week:\n\nWhat is your current availability for new client projects?`;
  const buttons = [
    { id: 'pulse_avail_now',     title: '🟢 Available Now' },
    { id: 'pulse_avail_limited', title: '🟡 Limited Hours' },
    { id: 'pulse_avail_pause',   title: '🔴 Booked / Pause' },
  ];

  await sendWhatsAppButtons(
    phone,
    bodyText,
    buttons,
    '🟢 Weekly Availability Check',
    'Tap an option to update capacity'
  );
}

/**
 * Updates a freelancer's availability status in Supabase.
 *
 * @param {string} phone
 * @param {object} pulseResult
 */
export async function updateFreelancerPulseStatus(phone, pulseResult) {
  const { error } = await supabase
    .from('freelancers')
    .update({
      availability_status: pulseResult.status,
      is_available: pulseResult.isAvailable,
      last_pulse_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('phone', phone);

  if (error) {
    console.error(`[pulse] updateFreelancerPulseStatus (${phone}) error:`, JSON.stringify(error));
  } else {
    console.log(`[pulse] Updated ${phone} availability -> ${pulseResult.status} (is_available=${pulseResult.isAvailable})`);
  }
}

/**
 * Scans active freelancers and sends weekly pulse check-ins to eligible users.
 *
 * @returns {Promise<number>} Number of pulses sent
 */
export async function checkAndTriggerWeeklyPulse() {
  const { data: freelancers, error } = await supabase
    .from('freelancers')
    .select('phone, name, status, last_pulse_at')
    .eq('status', 'active');

  if (error || !freelancers) {
    console.error('[pulse] Error fetching active freelancers:', error?.message);
    return 0;
  }

  const now = new Date();
  const dueFreelancers = freelancers.filter(f => isFreelancerDueForPulse(f, now));

  console.log(`[pulse] Found ${dueFreelancers.length} freelancer(s) due for weekly availability check-in (${freelancers.length} total active).`);

  let count = 0;
  for (const fl of dueFreelancers) {
    try {
      await sendAvailabilityPulse(fl.phone, fl.name);
      await supabase
        .from('freelancers')
        .update({ last_pulse_at: now.toISOString() })
        .eq('phone', fl.phone);

      count++;
      console.log(`[pulse] Sent pulse check-in to ${fl.name || fl.phone} (${fl.phone})`);
    } catch (err) {
      console.error(`[pulse] Failed sending pulse to ${fl.phone}:`, err.message);
    }
  }

  return count;
}

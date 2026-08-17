import {
  getMatchesDueForFeedback,
  markFeedbackRequested,
  findFreelancer,
  findJobRequest,
} from './supabase.js';
import { sendWhatsAppButtons } from './whatsapp.js';

/**
 * Checks if a connected match has reached its deadline or completed timeline.
 *
 * @param {object} match
 * @param {object} jobRequest
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isMatchDueForFeedback(match, jobRequest, now = new Date()) {
  if (!match || match.status !== 'connected' || match.feedback_requested_at) {
    return false;
  }

  // 1. Check normalized deadline date (YYYY-MM-DD)
  if (jobRequest?.deadline_normalized) {
    const deadlineDate = new Date(jobRequest.deadline_normalized);
    if (!isNaN(deadlineDate.getTime())) {
      // Due if current date is at or past the deadline
      return now.getTime() >= deadlineDate.getTime();
    }
  }

  // 2. Fallback: Check elapsed time since match was created (default 7 days)
  if (match.created_at) {
    const matchDate = new Date(match.created_at);
    if (!isNaN(matchDate.getTime())) {
      const elapsedDays = (now.getTime() - matchDate.getTime()) / (1000 * 60 * 60 * 24);
      return elapsedDays >= 7;
    }
  }

  return false;
}

/**
 * Sends an interactive WhatsApp rating prompt for a completed project match.
 *
 * @param {string} phone
 * @param {string} counterpartName
 * @param {string} role ('client' or 'freelancer')
 * @param {number|string} matchId
 * @param {string} [projectTitle]
 */
export async function sendFeedbackPrompt(phone, counterpartName, role, matchId, projectTitle = 'your project') {
  const isClient = role === 'client';
  const roleLabel = isClient ? 'freelancer' : 'client';

  const bodyText = `Did you complete ${projectTitle} with your ${roleLabel} *${counterpartName}*? 🤝\n\nHow was your experience working together? Please rate below:`;

  const buttons = [
    { id: `rate_5_${matchId}`, title: '⭐⭐⭐⭐⭐ 5/5' },
    { id: `rate_4_${matchId}`, title: '⭐⭐⭐⭐ 4/5' },
    { id: `rate_3_${matchId}`, title: '⭐ 3 or below' },
  ];

  await sendWhatsAppButtons(
    phone,
    bodyText,
    buttons,
    '⭐ Project Feedback',
    'Tap a rating or reply 1–5'
  );
}

/**
 * Scans all connected matches with passed deadlines and triggers feedback requests to both parties.
 *
 * @returns {Promise<number>} Number of feedback prompts triggered
 */
export async function checkAndTriggerDueFeedback() {
  const matches = await getMatchesDueForFeedback();
  if (!matches || matches.length === 0) {
    return 0;
  }

  console.log(`[feedback] Scanning ${matches.length} connected match(es) for expired deadlines...`);
  let triggeredCount = 0;

  for (const match of matches) {
    try {
      const jobRequest = await findJobRequest(match.job_phone);
      const freelancer = await findFreelancer(match.freelancer_phone);

      if (isMatchDueForFeedback(match, jobRequest)) {
        const clientName = jobRequest?.name || 'Client';
        const freelancerName = freelancer?.name || 'Freelancer';
        const projectTitle = jobRequest?.project_description?.slice(0, 40) || 'your project';

        // 1. Ping Client to rate Freelancer
        await sendFeedbackPrompt(
          match.job_phone,
          freelancerName,
          'client',
          match.id,
          projectTitle
        );

        // 2. Ping Freelancer to rate Client
        await sendFeedbackPrompt(
          match.freelancer_phone,
          clientName,
          'freelancer',
          match.id,
          projectTitle
        );

        // 3. Mark feedback requested
        await markFeedbackRequested(match.id);
        triggeredCount++;
        console.log(`[feedback] Sent feedback requests for match #${match.id} (${clientName} ↔ ${freelancerName})`);
      }
    } catch (err) {
      console.error(`[feedback] Error processing match #${match.id}:`, err.message);
    }
  }

  return triggeredCount;
}

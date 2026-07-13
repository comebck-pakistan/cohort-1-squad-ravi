import { getRankedMatchesForPhone, updateMatchLifecycle } from './supabase.js';
import { processInterviewState } from './scopeNegotiator.js';
import { routeAdaptiveMilestone } from './adaptivePayments.js';
import { runAutomatedScopeReview } from './qaInspector.js';
import { sendWhatsAppMessage } from './whatsapp.js';

export async function handleLifecycleFeatureHooks({ phone, role, messageText }) {
  const matches = await getRankedMatchesForPhone(phone, role);
  const activeMatch = matches.find((m) => m.status === 'mutual_interest' || m.status === 'hired');
  if (!activeMatch) return false;

  const lowerText = (messageText || '').toLowerCase().trim();

  // 1. Scope interview
  if (!activeMatch.interview_step) {
    const result = await processInterviewState(messageText, activeMatch);
    if (result) {
      await updateMatchLifecycle(activeMatch.id, { interview_step: activeMatch.interview_step });
      const targetPhone = result.target === 'freelancer' ? activeMatch.freelancer_phone : activeMatch.client_phone;
      await sendWhatsAppMessage(targetPhone, result.message);
      return true;
    }
  } else if (activeMatch.interview_step === 'awaiting_freelancer_response' && role === 'freelancer') {
    const result = await processInterviewState(messageText, activeMatch);
    if (result) {
      await updateMatchLifecycle(activeMatch.id, {
        interview_step: activeMatch.interview_step,
        interview_summary: activeMatch.interview_summary || null,
      });
      const targetPhone = result.target === 'freelancer' ? activeMatch.freelancer_phone : activeMatch.client_phone;
      await sendWhatsAppMessage(targetPhone, result.message);
      return true;
    }
  }

  // 2. Payment routing (only once scope is finalized)
  if (activeMatch.interview_step === 'scope_finalized' || activeMatch.payment_gateway_tier) {
    const paymentResult = routeAdaptiveMilestone(messageText, phone, activeMatch);
    if (paymentResult) {
      await updateMatchLifecycle(activeMatch.id, {
        payment_gateway_tier: activeMatch.payment_gateway_tier || null,
        escrow_status: activeMatch.escrow_status || null,
        selected_method: activeMatch.selected_method || null,
      });
      await sendWhatsAppMessage(phone, paymentResult.message);
      return true;
    }
  }

  // 3. QA check when freelancer says work is done
  if (role === 'freelancer' && (lowerText.includes('completed') || lowerText.includes('submit'))) {
    const qaResult = await runAutomatedScopeReview(messageText, activeMatch.interview_summary || '');
    const targetPhone = qaResult.status === 'failed_qa' ? activeMatch.freelancer_phone : activeMatch.client_phone;
    const message = qaResult.status === 'failed_qa'
      ? `⚠️ QA Review: something's missing.\nFeedback: ${qaResult.feedback}\n\nPlease update and resend "completed" once fixed.`
      : `✅ QA Passed! Feedback: ${qaResult.feedback}\n\nClient can now reply "release payment" to proceed.`;
    await sendWhatsAppMessage(targetPhone, message);
    return true;
  }

  return false;
}

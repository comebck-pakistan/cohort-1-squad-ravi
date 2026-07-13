import {
  findConversation,
  findFreelancer,
  saveConversation,
  saveFreelancerProfile,
  saveJobRequest,
  resetUser,
  updateFreelancerField,
  updateJobRequestField,
  deleteMatchesForPhone,
} from '../supabase.js';
import { handleLifecycleFeatureHooks } from '../lifecycleFeatures.js';
import { extractConversationData } from '../groq.js';
import {
  pickReplyText,
  pickPostCompletionReply,
  getAlreadyRegisteredReply,
  getResetReply,
  isSkipMessage,
  pickEditVagueReply,
  pickEditConfirmReply,
  pickEditSuccessReply,
  pickPreferencesReply,
} from '../replies.js';
import { sendWhatsAppMessage } from '../whatsapp.js';
import { isAckOnly, parseDeadlineLocally, parseYesNoLocally, ensureDeadlineNormalized } from '../deadline.js';
import { runMatchingForClient, runMatchingForFreelancer } from '../matching.js';
import { classifyLinkField, extractFirstUrl, revetArtifact, runVettingForFreelancer } from '../vetting.js';
import {
  handlePendingContactApproval,
  parseContactRequestCommand,
  requestContactForMatchRank,
} from '../contactRequests.js';
import {
  handleMatchLifecycleCommand,
  handlePendingMatchFeedback,
  parseMatchLifecycleCommand,
} from '../matchLifecycle.js';

const RESET_PHRASES = ['reset ai', 'reset bot'];

// ── Hiring/Working status flags ───────────────────────────────────────────────
// Boolean fields answered with yes/no. Only users with a `true` flag take part
// in matching; flipping to "no" removes their matches, flipping to "yes"
// re-runs matching for them.
const YESNO_STEPS = {
  collect_hiring_status:  { field: 'hiring_currently',  next: 'collect_contact_sharing' },
  collect_working_status: { field: 'working_currently', next: 'collect_contact_sharing' },
  collect_contact_sharing: {
    field: 'contact_sharing_allowed',
    nextByRole: {
      client: 'collect_client_brief_desc',
      freelancer: 'collect_freelancer_brief_desc',
    },
  },
};
const BOOLEAN_FIELDS = new Set(['hiring_currently', 'working_currently', 'contact_sharing_allowed']);
const MATCH_STATUS_FIELDS = new Set(['hiring_currently', 'working_currently']);
const FLAG_QUESTIONS = {
  hiring_currently:  'are you currently hiring?',
  working_currently: 'are you currently open to work?',
  contact_sharing_allowed: 'can matched people see your WhatsApp contact directly?',
};
const LINK_STEPS = {
  collect_profile_link:  { field: 'linkedin_url', next: 'collect_github' }, // legacy alias
  collect_linkedin:      { field: 'linkedin_url', next: 'collect_github' },
  collect_github:        { field: 'github_url', next: 'collect_cv' },
  collect_cv:            { field: 'cv_url', next: 'collect_support_docs' },
  collect_support_docs:  { field: 'support_docs', next: 'collect_portfolio' },
  collect_portfolio:     { field: 'portfolio', next: 'collect_skills' },
};
const LINK_FIELDS = new Set(['linkedin_url', 'github_url', 'cv_url', 'support_docs', 'portfolio']);

function canonicalLinkField(field) {
  return field === 'profile_link' ? 'linkedin_url' : field;
}

function formatFieldValue(value) {
  if (value === true) return 'yes';
  if (value === false) return 'no';
  return value;
}

async function applyFlagSideEffects(phone, field, value) {
  try {
    if (value === false) {
      await deleteMatchesForPhone(phone);
      return;
    }
    if (field === 'working_currently') {
      await runMatchingForFreelancer(phone);
    } else {
      await runMatchingForClient(phone);
    }
  } catch (err) {
    console.error(`[handleMessage] Flag side effects failed for ${field}=${value}, ${phone}:`, err);
  }
}

function nextStepForYesNo(stepConfig, role) {
  if (stepConfig.nextByRole) return stepConfig.nextByRole[role] || 'welcome';
  return stepConfig.next;
}

async function applyLinkSideEffects(phone, field) {
  if (!LINK_FIELDS.has(field)) return;
  try {
    await revetArtifact(phone, field);
  } catch (err) {
    console.error(`[handleMessage] Link re-vet failed for ${field}, ${phone}:`, err);
  }
}

function pendingBrokenArtifact(freelancer) {
  const broken = freelancer?.trust_breakdown?.broken_links || [];
  const uniqueArtifacts = [...new Set(broken.map((item) => item.artifact).filter((artifact) => LINK_FIELDS.has(artifact)))];
  return uniqueArtifacts.length === 1 ? uniqueArtifacts[0] : null;
}

export async function handleIncomingMessage({ phone, messageText }) {
  // Artificial delay to ensure "typing..." indicator is visible even on fast paths
  await new Promise(resolve => setTimeout(resolve, 800));

  const lowerText = (messageText || '').toLowerCase();

  const [conversation, freelancer] = await Promise.all([
    findConversation(phone),
    findFreelancer(phone),
  ]);

  // --- 1. RESET ---
  if (RESET_PHRASES.some((phrase) => lowerText.includes(phrase))) {
    await resetUser(phone);
    await sendWhatsAppMessage(phone, getResetReply());
    return;
  }

  // --- 1a. CONTACT REQUEST APPROVAL / REQUEST COMMANDS (local — NO Groq call) ---
  if (await handlePendingContactApproval({ phone, messageText })) {
    return;
  }

  if (await handlePendingMatchFeedback({ phone, conversation, messageText })) {
    return;
  }

  const contactCommand = parseContactRequestCommand(messageText);
  if (contactCommand) {
    const requesterRole = freelancer ? 'freelancer' : conversation?.role;
    await requestContactForMatchRank({
      requesterPhone: phone,
      requesterRole,
      rank: contactCommand.rank,
    });
    return;
  }

  const matchLifecycleCommand = parseMatchLifecycleCommand(messageText);
  if (matchLifecycleCommand && (freelancer || conversation?.step === 'completed')) {
    const role = freelancer ? 'freelancer' : conversation?.role;
    await handleMatchLifecycleCommand({
      phone,
      role,
      conversation,
      command: matchLifecycleCommand,
    });
    return;
  }
 const lifecycleRole = freelancer ? 'freelancer' : conversation?.role;
  if (lifecycleRole) {
    try {
      const handledByFeatureHooks = await handleLifecycleFeatureHooks({
        phone,
        role: lifecycleRole,
        messageText,
      });
      if (handledByFeatureHooks) return;
    } catch (err) {
      console.error('[lifecycleFeatures] hook failed, continuing normal flow:', err);
    }
  }

  // --- 1b. COMPLETED FREELANCER LINK RE-VET FAST-PATH ---
  // A completed freelancer can resend just one broken proof link. We classify
  // locally and re-check only that artifact — no Groq call.
  const incomingUrl = extractFirstUrl(messageText);
  if (conversation?.step === 'completed' && freelancer && incomingUrl) {
    const field = canonicalLinkField(classifyLinkField(incomingUrl) || pendingBrokenArtifact(freelancer));
    if (field && LINK_FIELDS.has(field)) {
      await updateFreelancerField(phone, field, incomingUrl);
      await sendWhatsAppMessage(phone, `Got it — re-checking your ${field.replace('_', ' ')} now.`);
      await applyLinkSideEffects(phone, field);
      return;
    }
  }

  // --- 2. ACTIVE EDITING STATE ---
  if (conversation?.temp_data?.editing_field) {
    const editingField = canonicalLinkField(conversation.temp_data.editing_field);
    
    if (editingField === 'vague') {
      const aiResult = await extractConversationData({
        step: conversation.step,
        role: conversation.role,
        tempData: conversation.temp_data,
        messageText,
      });

      if (aiResult.edit_request?.target_field) {
         const newTempData = { ...conversation.temp_data, editing_field: aiResult.edit_request.target_field };
         await saveConversation({
           id: conversation.id, phone, role: conversation.role, step: conversation.step, temp_data: newTempData
         });
         await sendWhatsAppMessage(phone, pickEditConfirmReply(aiResult.edit_request.target_field));
         return;
      } else {
         await sendWhatsAppMessage(phone, "I didn't quite catch which field you want to edit. Please reply with the name of the field (e.g. 'rate', 'portfolio', 'name').");
         return;
      }
    } else {
      // Receiving the new value for the active editingField
      let newValue = messageText.trim();

      // Flag fields are booleans — coerce a yes/no answer, and re-ask instead
      // of storing free text when the answer isn't a clear yes or no.
      if (BOOLEAN_FIELDS.has(editingField)) {
        const parsed = parseYesNoLocally(newValue);
        if (parsed === null) {
          await sendWhatsAppMessage(phone, `Just a quick yes or no — ${FLAG_QUESTIONS[editingField]}`);
          return;
        }
        newValue = parsed;
      }
      if (LINK_FIELDS.has(editingField)) {
        newValue = isSkipMessage(messageText) ? null : (extractFirstUrl(messageText) || newValue);
      }

      const newTempData = { ...conversation.temp_data };
      newTempData[editingField] = newValue;

      const resumeStep = newTempData.resume_step || conversation.step;
      delete newTempData.editing_field;
      delete newTempData.resume_step;

      await saveConversation({
        id: conversation.id, phone, role: conversation.role, step: resumeStep, temp_data: newTempData
      });

      if (freelancer) {
        await updateFreelancerField(phone, editingField, newValue);
      } else if (conversation.role === 'client') {
        await updateJobRequestField(phone, editingField, newValue);
      }

      await sendWhatsAppMessage(phone, pickEditSuccessReply(editingField, formatFieldValue(newValue)));
      if (MATCH_STATUS_FIELDS.has(editingField)) {
        await applyFlagSideEffects(phone, editingField, newValue);
      }
      if (freelancer && LINK_FIELDS.has(editingField)) {
        await applyLinkSideEffects(phone, editingField);
      }
      return;
    }
  }

  // --- 3. ACK-WORD SHORT-CIRCUIT ---
  // For post-brief-desc and completed steps, a bare ack re-sends the current
  // question (or post-completion reply) without spending a Groq call.
  const POST_DEADLINE_STEPS = new Set([
    'collect_client_brief_desc',
    'collect_freelancer_brief_desc',
    'completed',
  ]);
  if (isAckOnly(messageText) && POST_DEADLINE_STEPS.has(conversation?.step)) {
    if (conversation.step === 'completed') {
      await sendWhatsAppMessage(phone, pickPostCompletionReply());
    } else {
      const { text } = pickReplyText(conversation.step);
      await sendWhatsAppMessage(phone, text);
    }
    return;
  }

  // --- 4. DEADLINE FAST-PATH (local parser — NO Groq call) ---
  // If the current step is collect_deadline and the local regex parser is
  // confident, we advance the state immediately without spending an API call.
  let aiResult;
  if (conversation?.step === 'collect_deadline' && !isAckOnly(messageText)) {
    const localResult = parseDeadlineLocally(messageText);
    if (localResult.confidence === 'high') {
      // Build a synthetic aiResult that looks identical to what Groq would return
      aiResult = {
        role: conversation.role,
        next_step: 'collect_hiring_status',
        extracted_data: {
          ...(conversation.temp_data || {}),
          deadline: localResult.deadline_normalized,
          deadline_raw: localResult.deadline_raw,
          is_recurring: localResult.is_recurring,
        },
        edit_request: { is_edit: false, target_field: null, provided_value: null },
      };
      // Skip all Groq & edit-request logic — go straight to save + reply
      await saveConversation({
        id: conversation?.id ?? null,
        phone,
        role: aiResult.role,
        step: aiResult.next_step,
        temp_data: aiResult.extracted_data,
      });
      const { text } = pickReplyText(aiResult.next_step);
      await sendWhatsAppMessage(phone, text);
      return;
    }
    // confidence === 'low' → fall through to Groq below
  }

  // --- 4b. HIRING/WORKING STATUS FAST-PATH (local parser — NO Groq call) ---
  // A clear yes/no at these steps sets the boolean flag and advances without
  // an API call. Ambiguous answers fall through to Groq, whose prompt re-asks.
  if (YESNO_STEPS[conversation?.step]) {
    const parsed = parseYesNoLocally(messageText);
    if (parsed !== null) {
      const stepConfig = YESNO_STEPS[conversation.step];
      const { field } = stepConfig;
      const next = nextStepForYesNo(stepConfig, conversation.role);
      await saveConversation({
        id: conversation.id,
        phone,
        role: conversation.role,
        step: next,
        temp_data: { ...(conversation.temp_data || {}), [field]: parsed },
      });
      await sendWhatsAppMessage(phone, pickReplyText(next).text);
      return;
    }
  }

  // --- 5. LINK FAST-PATH (local parser — NO Groq call) ---
  if (conversation && LINK_STEPS[conversation.step]) {
    const { field, next } = LINK_STEPS[conversation.step];
    const url = extractFirstUrl(messageText);
    if (url || isSkipMessage(messageText)) {
      const tempData = {
        ...(conversation.temp_data || {}),
        [field]: url || null,
      };
      await saveConversation({
        id: conversation.id,
        phone,
        role: conversation.role,
        step: next,
        temp_data: tempData,
      });
      await sendWhatsAppMessage(phone, pickReplyText(next).text);
      return;
    }
  }

  // --- 6. NORMAL GROQ EXTRACTION (one call, same as before) ---
  aiResult = await extractConversationData({
    step: conversation?.step,
    role: conversation?.role,
    tempData: conversation?.temp_data,
    messageText,
  });

  // Suppress edit intent for pure acknowledgement messages
  if (isAckOnly(messageText) && aiResult.edit_request) {
    aiResult.edit_request.is_edit = false;
  }

  // ── PURE DATA COLLECTION GUARD ──────────────────────────────────────────
  // The brief_desc and collect_project steps collect free-form text that may
  // contain words like "edit", "change", "update" — these are part of the
  // user's answer, NOT edit requests for a previous field. Force is_edit=false
  // here as a code-level safety net regardless of what Groq returned.
  const PURE_DATA_STEPS = new Set([
    'collect_client_brief_desc',
    'collect_freelancer_brief_desc',
    'collect_project',
  ]);
  if (PURE_DATA_STEPS.has(conversation?.step) && aiResult.edit_request) {
    aiResult.edit_request.is_edit = false;
  }

  // Post-Groq deadline guard: if Groq still didn't advance (unusual phrasing
  // that passed local check with low confidence), force advancement using the
  // raw message as the deadline value.
  if (
    conversation?.step === 'collect_deadline' &&
    aiResult.next_step === 'collect_deadline'
  ) {
    aiResult.next_step = 'collect_hiring_status';
    aiResult.extracted_data = {
      ...(aiResult.extracted_data || {}),
      deadline: aiResult.extracted_data?.deadline || messageText.trim(),
    };
    if (aiResult.edit_request) aiResult.edit_request.is_edit = false;
  }

  // Ensure deadline_normalized is never null when deadline_raw has a value.
  // Runs on every Groq response — cheap (no API call), idempotent.
  if (conversation?.step === 'collect_deadline' || aiResult.extracted_data?.deadline_raw) {
    ensureDeadlineNormalized(aiResult.extracted_data);
  }

  // --- 7. NEW EDIT REQUEST ---
  if (aiResult.edit_request?.is_edit) {
    const field = canonicalLinkField(aiResult.edit_request.target_field);
    let value = aiResult.edit_request.provided_value;
    const currentStep = conversation?.step || aiResult.next_step;

    // Flag fields are booleans — coerce a provided yes/no value. If it isn't a
    // clear yes/no, null it out so the ask-for-value branch below takes over.
    if (field && BOOLEAN_FIELDS.has(field) && value != null && typeof value !== 'boolean') {
      value = parseYesNoLocally(String(value));
    }

    if (field && (value || value === false)) {
      if (field && LINK_FIELDS.has(field)) {
        value = isSkipMessage(String(value)) ? null : (extractFirstUrl(String(value)) || value);
      }
      // Direct update — merge with existing temp_data to avoid losing fields
      const newTempData = { ...(conversation?.temp_data || {}), ...(aiResult.extracted_data || {}) };
      newTempData[field] = value;

      await saveConversation({
        id: conversation?.id ?? null, phone, role: aiResult.role, step: currentStep, temp_data: newTempData
      });

      if (freelancer) {
        await updateFreelancerField(phone, field, value);
      } else if ((conversation?.role || aiResult.role) === 'client') {
        await updateJobRequestField(phone, field, value);
      }

      await sendWhatsAppMessage(phone, pickEditSuccessReply(field, formatFieldValue(value)));
      if (MATCH_STATUS_FIELDS.has(field)) {
        await applyFlagSideEffects(phone, field, value);
      }
      if (freelancer && LINK_FIELDS.has(field)) {
        await applyLinkSideEffects(phone, field);
      }
      return;
    } else if (field) {
      // Specific field, ask for value — merge with existing temp_data
      const newTempData = { ...(conversation?.temp_data || {}), ...(aiResult.extracted_data || {}), editing_field: field, resume_step: currentStep };
      await saveConversation({
        id: conversation?.id ?? null, phone, role: aiResult.role, step: currentStep, temp_data: newTempData
      });
      await sendWhatsAppMessage(phone, pickEditConfirmReply(field));
      return;
    } else {
      // Vague edit intent — merge with existing temp_data
      const newTempData = { ...(conversation?.temp_data || {}), ...(aiResult.extracted_data || {}), editing_field: 'vague', resume_step: currentStep };
      await saveConversation({
        id: conversation?.id ?? null, phone, role: aiResult.role, step: currentStep, temp_data: newTempData
      });
      
      const existingData = freelancer || newTempData;
      const cleanData = {};
      for (const [k, v] of Object.entries(existingData)) {
        if (!['id', 'phone', 'created_at', 'updated_at', 'editing_field', 'resume_step'].includes(k)) {
          cleanData[k] = v;
        }
      }
      
      await sendWhatsAppMessage(phone, pickEditVagueReply(cleanData));
      return;
    }
  }

  // --- 6. ALREADY COMPLETED CHECK ---
  // If no edit request and they are completed, ignore the message and send the fallback reply
  if (freelancer) {
    await sendWhatsAppMessage(phone, getAlreadyRegisteredReply());
    return;
  }
  if (conversation && conversation.step === 'completed') {
    await sendWhatsAppMessage(phone, pickPostCompletionReply());
    return;
  }

  // --- 8. NORMAL ONBOARDING PROGRESSION ---
  // CRITICAL: merge extracted_data INTO existing temp_data so that fields Groq
  // fails to echo back are never silently lost. New keys overwrite, but old
  // keys that Groq omitted are preserved.
  const mergedTempData = { ...(conversation?.temp_data || {}), ...aiResult.extracted_data };

  console.log(
    `[handleMessage] MERGE temp_data (step ${conversation?.step} → ${aiResult.next_step}):\n`,
    '  existing:', JSON.stringify(conversation?.temp_data || {}), '\n',
    '  extracted:', JSON.stringify(aiResult.extracted_data), '\n',
    '  merged:', JSON.stringify(mergedTempData),
  );

  await saveConversation({
    id: conversation?.id ?? null,
    phone,
    role: aiResult.role,
    step: aiResult.next_step,
    temp_data: mergedTempData,
  });

  let completedRole = null;
  if (aiResult.next_step === 'completed') {
    // aiResult.role can be null on the final brief_desc step because Groq doesn't
    // always re-emit it. Fall back to the role stored in the conversation row,
    // which was set definitively when the user first identified themselves.
    const effectiveRole = aiResult.role || conversation?.role;

    console.log(`[handleMessage] Completion reached — effectiveRole=${effectiveRole}, phone=${phone}`);

    if (effectiveRole === 'freelancer') {
      await saveFreelancerProfile(phone, mergedTempData);
      completedRole = 'freelancer';
    } else if (effectiveRole === 'client') {
      await saveJobRequest(phone, mergedTempData);
      completedRole = 'client';
    } else {
      console.warn('[handleMessage] Completion reached but role is unknown — no permanent row written. aiResult.role:', aiResult.role, 'conversation.role:', conversation?.role);
    }
  }

  // Use the niche-aware picker for collect_preferences, generic picker for everything else
  const replyText = aiResult.next_step === 'collect_preferences'
    ? pickPreferencesReply(mergedTempData)
    : pickReplyText(aiResult.next_step).text;
  await sendWhatsAppMessage(phone, replyText);

  // Matching runs AFTER the completion reply so "All done! 🎉" arrives before
  // the match results. A matching failure must never surface to the user —
  // their profile is already saved at this point.
  if (completedRole) {
    if (completedRole === 'freelancer') {
      try {
        await runVettingForFreelancer(phone);
      } catch (err) {
        console.error(`[handleMessage] Vetting failed for freelancer ${phone}:`, err);
      }
    }

    try {
      if (completedRole === 'client') {
        await runMatchingForClient(phone);
      } else {
        await runMatchingForFreelancer(phone);
      }
    } catch (err) {
      console.error(`[handleMessage] Matching failed for ${completedRole} ${phone}:`, err);
    }
  }
}

import {
  findConversation,
  findFreelancer,
  saveConversation,
  saveFreelancerProfile,
  saveJobRequest,
  resetUser,
  updateFreelancerField,
} from '../supabase.js';
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
import { isAckOnly, parseDeadlineLocally, ensureDeadlineNormalized } from '../deadline.js';

const RESET_PHRASES = ['reset ai', 'reset bot'];

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

  // --- 2. ACTIVE EDITING STATE ---
  if (conversation?.temp_data?.editing_field) {
    const editingField = conversation.temp_data.editing_field;
    
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
      const newValue = messageText.trim();
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
      }

      await sendWhatsAppMessage(phone, pickEditSuccessReply(editingField, newValue));
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
        next_step: 'collect_client_brief_desc',
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

  // --- 5. SKIP PROFILE LINK ---
  if (conversation && conversation.step === 'collect_profile_link' && isSkipMessage(messageText)) {
    aiResult = {
      role: conversation.role,
      next_step: 'collect_portfolio',
      extracted_data: { ...(conversation.temp_data || {}), profile_link: null }
    };
  } else {
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
      aiResult.next_step = 'collect_client_brief_desc';
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
  }

  // --- 7. NEW EDIT REQUEST ---
  if (aiResult.edit_request?.is_edit) {
    const field = aiResult.edit_request.target_field;
    const value = aiResult.edit_request.provided_value;
    const currentStep = conversation?.step || aiResult.next_step;

    if (field && value) {
      // Direct update — merge with existing temp_data to avoid losing fields
      const newTempData = { ...(conversation?.temp_data || {}), ...(aiResult.extracted_data || {}) };
      newTempData[field] = value;
      
      await saveConversation({
        id: conversation?.id ?? null, phone, role: aiResult.role, step: currentStep, temp_data: newTempData
      });

      if (freelancer) {
        await updateFreelancerField(phone, field, value);
      }

      await sendWhatsAppMessage(phone, pickEditSuccessReply(field, value));
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

  if (aiResult.next_step === 'completed') {
    // aiResult.role can be null on the final brief_desc step because Groq doesn't
    // always re-emit it. Fall back to the role stored in the conversation row,
    // which was set definitively when the user first identified themselves.
    const effectiveRole = aiResult.role || conversation?.role;

    console.log(`[handleMessage] Completion reached — effectiveRole=${effectiveRole}, phone=${phone}`);

    if (effectiveRole === 'freelancer') {
      await saveFreelancerProfile(phone, mergedTempData);
    } else if (effectiveRole === 'client') {
      await saveJobRequest(phone, mergedTempData);
    } else {
      console.warn('[handleMessage] Completion reached but role is unknown — no permanent row written. aiResult.role:', aiResult.role, 'conversation.role:', conversation?.role);
    }
  }

  // Use the niche-aware picker for collect_preferences, generic picker for everything else
  const replyText = aiResult.next_step === 'collect_preferences'
    ? pickPreferencesReply(mergedTempData)
    : pickReplyText(aiResult.next_step).text;
  await sendWhatsAppMessage(phone, replyText);
}

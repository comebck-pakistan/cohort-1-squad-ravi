import {
  findConversation,
  findFreelancer,
  saveConversation,
  saveFreelancerProfile,
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
} from '../replies.js';
import { sendWhatsAppMessage } from '../whatsapp.js';

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

  // --- 3. SKIP PROFILE LINK ---
  let aiResult;
  if (conversation && conversation.step === 'collect_profile_link' && isSkipMessage(messageText)) {
    aiResult = {
      role: conversation.role,
      next_step: 'collect_portfolio',
      extracted_data: { ...(conversation.temp_data || {}), profile_link: null }
    };
  } else {
    // --- 4. NORMAL GROQ EXTRACTION ---
    aiResult = await extractConversationData({
      step: conversation?.step,
      role: conversation?.role,
      tempData: conversation?.temp_data,
      messageText,
    });
  }

  // --- 5. NEW EDIT REQUEST ---
  if (aiResult.edit_request?.is_edit) {
    const field = aiResult.edit_request.target_field;
    const value = aiResult.edit_request.provided_value;
    const currentStep = conversation?.step || aiResult.next_step;

    if (field && value) {
      // Direct update
      const newTempData = { ...(aiResult.extracted_data || {}) };
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
      // Specific field, ask for value
      const newTempData = { ...(aiResult.extracted_data || {}), editing_field: field, resume_step: currentStep };
      await saveConversation({
        id: conversation?.id ?? null, phone, role: aiResult.role, step: currentStep, temp_data: newTempData
      });
      await sendWhatsAppMessage(phone, pickEditConfirmReply(field));
      return;
    } else {
      // Vague edit intent
      const newTempData = { ...(aiResult.extracted_data || {}), editing_field: 'vague', resume_step: currentStep };
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

  // --- 7. NORMAL ONBOARDING PROGRESSION ---
  await saveConversation({
    id: conversation?.id ?? null,
    phone,
    role: aiResult.role,
    step: aiResult.next_step,
    temp_data: aiResult.extracted_data,
  });

  if (aiResult.next_step === 'completed' && aiResult.role === 'freelancer') {
    await saveFreelancerProfile(phone, aiResult.extracted_data);
  }

  const { text } = pickReplyText(aiResult.next_step);
  await sendWhatsAppMessage(phone, text);
}

import {
  findConversation,
  findFreelancer,
  saveConversation,
  saveFreelancerProfile,
  resetUser,
} from '../supabase.js';
import { extractConversationData } from '../groq.js';
import {
  pickReplyText,
  pickPostCompletionReply,
  getAlreadyRegisteredReply,
  getResetReply,
  isSkipMessage,
} from '../replies.js';
import { sendWhatsAppMessage } from '../whatsapp.js';

const RESET_PHRASES = ['reset ai', 'reset mahir'];

export async function handleIncomingMessage({ phone, messageText }) {
  // Artificial delay to ensure "typing..." indicator is visible even on fast paths
  await new Promise(resolve => setTimeout(resolve, 800));

  const lowerText = (messageText || '').toLowerCase();

  // --- Equivalent of "Is RESET MAHIR?" branch ---
  if (RESET_PHRASES.some((phrase) => lowerText.includes(phrase))) {
    await resetUser(phone);
    await sendWhatsAppMessage(phone, getResetReply());
    return;
  }

  // --- Equivalent of "Search Conversations" + "Search Freelancers" + "Merge Lookup Data" ---
  const [conversation, freelancer] = await Promise.all([
    findConversation(phone),
    findFreelancer(phone),
  ]);

  // --- Equivalent of "Freelancer Already Exists?" branch ---
  if (freelancer) {
    await sendWhatsAppMessage(phone, getAlreadyRegisteredReply());
    return;
  }

  // --- Equivalent of "Is Already Completed?" branch (skip Groq entirely, save a call) ---
  if (conversation && conversation.step === 'completed') {
    await sendWhatsAppMessage(phone, pickPostCompletionReply());
    return;
  }

  let aiResult;

  if (conversation && conversation.step === 'collect_profile_link' && isSkipMessage(messageText)) {
    // Bypass Groq completely for skips
    aiResult = {
      role: conversation.role,
      next_step: 'collect_portfolio',
      extracted_data: { ...(conversation.temp_data || {}), profile_link: null }
    };
  } else {
    // --- Equivalent of "Groq AI Completion" + "Parse Groq JSON" ---
    aiResult = await extractConversationData({
      step: conversation?.step,
      role: conversation?.role,
      tempData: conversation?.temp_data,
      messageText,
    });
  }

  // --- Equivalent of "Build Conversation Row" + "If" (update vs create) ---
  await saveConversation({
    id: conversation?.id ?? null,
    phone,
    role: aiResult.role,
    step: aiResult.next_step,
    temp_data: aiResult.extracted_data,
  });

  // --- Equivalent of "Is Onboarding Completed?" + "Role Is Freelancer?" + "Save Freelancer Profile" ---
  if (aiResult.next_step === 'completed' && aiResult.role === 'freelancer') {
    await saveFreelancerProfile(phone, aiResult.extracted_data);
  }

  // --- Equivalent of "Pick Reply Text" + "WhatsApp Normal/Completion Reply" ---
  const { text } = pickReplyText(aiResult.next_step);
  await sendWhatsAppMessage(phone, text);
}

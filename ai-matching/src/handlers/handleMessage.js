import {
  findConversation,
  findFreelancer,
  saveConversation,
  saveFreelancerProfile,
  saveJobRequest,
  resetUser,
  updateFreelancerField,
  insertMatch,
  getActiveMatchesForPhone,
  getAllLiveMatchesForPhone,
  updateMatchStatus,
  findJobRequest,
  setAvailability,
} from '../supabase.js';
import { extractConversationData } from '../groq.js';
import { findMatchesForClient, findMatchesForFreelancer, persistAndNotifyMatches } from '../matching.js';
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
import { tryHandleLocally } from '../localHandler.js';

const RESET_PHRASES = ['reset ai', 'reset bot'];
const SHOW_MATCHES_PHRASES = ['show my matches', 'my matches', 'show matches'];

export async function handleIncomingMessage({ phone, messageText }) {
  // Artificial delay to ensure "typing..." indicator is visible even on fast paths
  await new Promise(resolve => setTimeout(resolve, 800));

  const lowerText = (messageText || '').toLowerCase().trim();

  const [conversation, freelancer, activeMatches] = await Promise.all([
    findConversation(phone),
    findFreelancer(phone),
    getActiveMatchesForPhone(phone),
  ]);

  // --- 0.5 SHOW MY MATCHES ---
  if (SHOW_MATCHES_PHRASES.some((phrase) => lowerText.includes(phrase))) {
    const liveMatches = await getAllLiveMatchesForPhone(phone);

    if (liveMatches.length === 0) {
      await sendWhatsAppMessage(phone, `You don't have any active matches right now. We'll notify you as soon as one comes up! 🔔`);
      return;
    }

    // Collect all unique counterpart phones so we can batch-fetch profiles
    const freelancerPhones = new Set();
    const clientPhones = new Set();
    for (const m of liveMatches) {
      if (m.freelancer_phone !== phone) freelancerPhones.add(m.freelancer_phone);
      if (m.job_phone !== phone) clientPhones.add(m.job_phone);
    }

    // Fetch counterpart profiles in parallel
    const profilePromises = [];
    const freelancerMap = new Map();
    const jobMap = new Map();

    for (const fp of freelancerPhones) {
      profilePromises.push(findFreelancer(fp).then(p => p && freelancerMap.set(fp, p)));
    }
    for (const cp of clientPhones) {
      profilePromises.push(findJobRequest(cp).then(j => j && jobMap.set(cp, j)));
    }
    // Also fetch own profiles in case we're on the other side
    profilePromises.push(findFreelancer(phone).then(p => p && freelancerMap.set(phone, p)));
    profilePromises.push(findJobRequest(phone).then(j => j && jobMap.set(phone, j)));
    await Promise.all(profilePromises);

    const blocks = liveMatches.map((m, i) => {
      const isClient = m.job_phone === phone;
      const otherPhone = isClient ? m.freelancer_phone : m.job_phone;

      // Resolve the counterpart's name and the project description
      let otherName;
      let projectDesc;
      if (isClient) {
        const fl = freelancerMap.get(otherPhone);
        otherName = fl?.name || otherPhone;
        const jr = jobMap.get(phone);
        projectDesc = jr?.project_description || jr?.brief_description || 'N/A';
      } else {
        const jr = jobMap.get(otherPhone);
        otherName = jr?.name || otherPhone;
        projectDesc = jr?.project_description || jr?.brief_description || 'N/A';
      }

      // Determine the human-readable stage
      let stage;
      if (m.status === 'connected') {
        stage = '✅ Connected';
      } else if (m.status === 'awaiting_response') {
        // Figure out whose turn it is
        const isFirstParty = m.initiator_role === (isClient ? 'freelancer' : 'client');
        stage = isFirstParty ? '⏳ Awaiting your response' : '⏳ Awaiting their response';
      } else if (m.status === 'awaiting_other') {
        const isFirstParty = m.initiator_role === (isClient ? 'freelancer' : 'client');
        stage = isFirstParty ? '⏳ Awaiting their response' : '⏳ Awaiting your response';
      } else {
        stage = '🔍 Pending';
      }

      const lines = [
        `*Match ${i + 1}:* ${otherName}`,
        `📋 ${projectDesc}`,
        stage,
      ];

      // For connected matches, re-include contact info
      if (m.status === 'connected') {
        if (isClient) {
          const fl = freelancerMap.get(otherPhone);
          lines.push(`📞 ${fl?.phone || otherPhone}`);
          if (fl?.profile_link) lines.push(`🔗 ${fl.profile_link}`);
        } else {
          lines.push(`📞 ${otherPhone}`);
        }
      }

      return lines.join('\n');
    });

    const header = `📊 *Your Matches (${liveMatches.length}):*\n`;
    await sendWhatsAppMessage(phone, header + '\n' + blocks.join('\n\n'));
    return;
  }

  // --- 1. RESET ---
  if (RESET_PHRASES.some((phrase) => lowerText.includes(phrase))) {
    await resetUser(phone);
    await sendWhatsAppMessage(phone, getResetReply());
    return;
  }

  // --- 1.5 MATCH NOTIFICATION RESPONSES ---
  // If the user has a pending match and they reply with "interested" or "not interested"
  const pendingMatch = activeMatches.find(m => m.status === 'awaiting_response' || m.status === 'awaiting_other');
  
  if (pendingMatch) {
    // Determine the user's role in this match
    const isClient = pendingMatch.job_phone === phone;
    const role = isClient ? 'client' : 'freelancer';
    
    // Check if it's their turn to respond
    // If it's awaiting_response, the first notified party should respond.
    // If it's awaiting_other, the SECOND party should respond.
    const isFirstParty = pendingMatch.initiator_role === (isClient ? 'freelancer' : 'client');
    const isTheirTurn = (pendingMatch.status === 'awaiting_response' && isFirstParty) ||
                        (pendingMatch.status === 'awaiting_other' && !isFirstParty);

    if (isTheirTurn) {
      if (lowerText === 'not interested' || lowerText === 'no') {
        await updateMatchStatus(pendingMatch.id, { 
          status: 'declined', 
          declined_by: role,
          responded_at: new Date().toISOString()
        });
        await sendWhatsAppMessage(phone, "Got it, we've passed on this match and will continue looking for you.");
        // TODO: advance to next rank in batch
        return;
      } 
      
      if (lowerText === 'interested' || lowerText === 'yes') {
        if (pendingMatch.status === 'awaiting_response') {
          // First party accepted!
          await updateMatchStatus(pendingMatch.id, { 
            status: 'awaiting_other',
            responded_at: new Date().toISOString()
          });
          
          await sendWhatsAppMessage(phone, "Awesome! We've notified the other party. We'll share contact info as soon as they confirm.");
          
          // Notify the other party (Bug 3 fix)
          const otherPhone = isClient ? pendingMatch.freelancer_phone : pendingMatch.job_phone;
          const notifyText = [
            `🎉 The ${role} has reviewed your profile and is interested in matching!`,
            ``,
            `Reply *interested* if you'd like to connect, or *not interested* to pass.`
          ].join('\n');
          await sendWhatsAppMessage(otherPhone, notifyText);
          return;
          
        } else if (pendingMatch.status === 'awaiting_other') {
          // Both parties accepted!
          await updateMatchStatus(pendingMatch.id, { 
            status: 'connected',
            responded_at: new Date().toISOString()
          });

          // Mark both parties as unavailable so they stop receiving new matches
          await Promise.all([
            setAvailability(pendingMatch.freelancer_phone, 'freelancer', false),
            setAvailability(pendingMatch.job_phone, 'client', false),
          ]);
          
          // Fetch the full profiles
          const [freelancerProfile, jobRequest] = await Promise.all([
            findFreelancer(pendingMatch.freelancer_phone),
            findJobRequest(pendingMatch.job_phone)
          ]);

          // Contact card for the freelancer (sent to the client)
          const freelancerCard = [
            `It's a match! 🥳`,
            ``,
            `Here are the contact details for the freelancer:`,
            `*Name:* ${freelancerProfile?.name || 'N/A'}`,
            `*Phone:* ${freelancerProfile?.phone || pendingMatch.freelancer_phone}`,
            freelancerProfile?.profile_link ? `*Profile:* ${freelancerProfile.profile_link}` : '',
            freelancerProfile?.portfolio ? `*Portfolio:* ${freelancerProfile.portfolio}` : '',
            freelancerProfile?.rate ? `*Rate:* ${freelancerProfile.rate}` : '',
            ``,
            `You can now message them directly to discuss the project!`
          ].filter(Boolean).join('\n');

          // Contact card for the client (sent to the freelancer)
          const clientCard = [
            `It's a match! 🥳`,
            ``,
            `Here are the contact details for the client:`,
            `*Name:* ${jobRequest?.name || 'N/A'}`,
            `*Phone:* ${jobRequest?.phone || pendingMatch.job_phone}`,
            ``,
            `*Project Reminder:*`,
            jobRequest?.project_description || jobRequest?.brief_description || 'N/A',
            ``,
            `They have been given your number and you can also message them directly!`
          ].filter(Boolean).join('\n');

          if (isClient) {
            await sendWhatsAppMessage(phone, freelancerCard);
            await sendWhatsAppMessage(pendingMatch.freelancer_phone, clientCard);
          } else {
            await sendWhatsAppMessage(phone, clientCard);
            await sendWhatsAppMessage(pendingMatch.job_phone, freelancerCard);
          }

          // ── Feature 8: Return-to-Matching Prompt ──────────────────────────
          // After contact is shared, ask both parties if they want to keep
          // receiving matches. Track the pending question via temp_data
          // (same pattern as editing_field).
          const availPrompt = `Would you like to continue receiving matches? Reply *yes* to stay active, or *no* to pause.`;

          const [flConv, clConv] = await Promise.all([
            findConversation(pendingMatch.freelancer_phone),
            findConversation(pendingMatch.job_phone),
          ]);

          const flagUpdates = [];
          if (flConv && !flConv.temp_data?.awaiting_availability_response) {
            flagUpdates.push(saveConversation({
              id: flConv.id,
              phone: pendingMatch.freelancer_phone,
              role: flConv.role,
              step: flConv.step,
              temp_data: { ...flConv.temp_data, awaiting_availability_response: true },
            }));
          }
          if (clConv && !clConv.temp_data?.awaiting_availability_response) {
            flagUpdates.push(saveConversation({
              id: clConv.id,
              phone: pendingMatch.job_phone,
              role: clConv.role,
              step: clConv.step,
              temp_data: { ...clConv.temp_data, awaiting_availability_response: true },
            }));
          }
          await Promise.all(flagUpdates);

          await sendWhatsAppMessage(pendingMatch.freelancer_phone, availPrompt);
          await sendWhatsAppMessage(pendingMatch.job_phone, availPrompt);

          return;
        }
      }

      // Catch-all: user has a pending match and it's their turn, but they
      // sent something other than "interested" / "not interested".
      // Re-prompt instead of falling through to generic handlers.
      await sendWhatsAppMessage(phone, `You have a match waiting for your response!\n\nReply *interested* to connect, or *not interested* to pass.`);
      return;
    }
  }

  // --- 1.7 AVAILABILITY PROMPT RESPONSES ---
  // If the user has an outstanding "continue receiving matches?" question,
  // handle yes/no before any other handler can intercept the message.
  if (conversation?.temp_data?.awaiting_availability_response) {
    const YES_WORDS = new Set(['yes', 'yeah', 'yep', 'yea', 'sure', 'y']);
    const NO_WORDS  = new Set(['no', 'nope', 'nah', 'n']);

    // Clear the pending flag regardless of answer
    const cleanTempData = { ...conversation.temp_data };
    delete cleanTempData.awaiting_availability_response;

    if (YES_WORDS.has(lowerText)) {
      await setAvailability(phone, conversation.role, true);
      await saveConversation({
        id: conversation.id, phone, role: conversation.role,
        step: conversation.step, temp_data: cleanTempData,
      });
      await sendWhatsAppMessage(phone, `You're back in the pool — we'll notify you when there's a match! 🎯`);
      return;
    }

    if (NO_WORDS.has(lowerText)) {
      await saveConversation({
        id: conversation.id, phone, role: conversation.role,
        step: conversation.step, temp_data: cleanTempData,
      });
      await sendWhatsAppMessage(phone, `No problem — you're paused. Message us anytime you want back in! ✌️`);
      return;
    }

    // Unrecognised reply — re-prompt
    await sendWhatsAppMessage(phone, `Would you like to continue receiving matches? Reply *yes* to stay active, or *no* to pause.`);
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
  } else if (conversation && conversation.step === 'collect_client_brief_desc' && isSkipMessage(messageText)) {
    // --- 5b. SKIP CLIENT BRIEF DESC (optional field) ---
    aiResult = {
      role: conversation.role,
      next_step: 'completed',
      extracted_data: { ...(conversation.temp_data || {}), brief_description: null },
      edit_request: { is_edit: false, target_field: null, provided_value: null },
    };
  } else {
    // --- 6. TRY LOCAL HANDLER FIRST (no Groq call for ~80% of messages) ---
    const resolvedRole = conversation?.role || null;
    const localResult = tryHandleLocally(conversation?.step, resolvedRole, messageText, conversation?.temp_data);

    if (localResult) {
      // Local handler succeeded — suppress edit intent on pure ack messages
      if (isAckOnly(messageText) && localResult.edit_request) {
        localResult.edit_request.is_edit = false;
      }
      aiResult = localResult;
    } else {
      // --- 6b. FALL BACK TO GROQ (ambiguous input — role phrasing, hire-type, etc.) ---
      aiResult = await extractConversationData({
        step: conversation?.step,
        role: resolvedRole,
        tempData: conversation?.temp_data,
        messageText,
      });

      // Suppress edit intent for pure acknowledgement messages
      if (isAckOnly(messageText) && aiResult.edit_request) {
        aiResult.edit_request.is_edit = false;
      }

      // PURE DATA COLLECTION GUARD
      const PURE_DATA_STEPS = new Set([
        'collect_client_brief_desc',
        'collect_freelancer_brief_desc',
        'collect_project',
      ]);
      if (PURE_DATA_STEPS.has(conversation?.step) && aiResult.edit_request) {
        aiResult.edit_request.is_edit = false;
      }

      // Post-Groq deadline guard
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

      // Post-Groq availability guard
      if (
        conversation?.step === 'collect_availability' &&
        aiResult.next_step === 'collect_availability'
      ) {
        aiResult.next_step = 'collect_preferences';
        aiResult.extracted_data = {
          ...(aiResult.extracted_data || {}),
          availability: aiResult.extracted_data?.availability || messageText.trim(),
        };
        if (aiResult.edit_request) aiResult.edit_request.is_edit = false;
      }

      // Ensure deadline_normalized is never null when deadline_raw has a value
      if (conversation?.step === 'collect_deadline' || aiResult.extracted_data?.deadline_raw) {
        ensureDeadlineNormalized(aiResult.extracted_data);
      }
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

  // --- 6. ALREADY COMPLETED / ON-DEMAND MATCH CHECK ---
  // If they are fully registered, check if this is an on-demand match request.
  // Otherwise, ignore the message and send the fallback reply.
  if (freelancer || (conversation && conversation.step === 'completed')) {
    const ON_DEMAND_TRIGGERS = new Set(['?', '??', '???', 'bro', 'hey', 'hi', 'matches?']);
    const isMatchCheck = ON_DEMAND_TRIGGERS.has(lowerText) ||
                         lowerText.includes('any match') ||
                         lowerText.includes('find match') ||
                         lowerText.includes('search');

    if (isMatchCheck) {
      let role = 'freelancer';
      let profile = freelancer;
      if (!profile) {
        profile = await findJobRequest(phone);
        role = 'client';
      }

      if (profile) {
        try {
          let matches = [];
          if (role === 'freelancer') {
            matches = await findMatchesForFreelancer(profile);
            if (matches.length > 0) {
              await persistAndNotifyMatches({
                matches,
                initiatorRole: 'freelancer',
                initiatorPhone: phone,
                jobData: null,
                freelancerData: profile,
              });
              await sendWhatsAppMessage(phone, `Found ${matches.length} project match${matches.length > 1 ? 'es' : ''} for you! 🎯`);
            }
          } else {
            matches = await findMatchesForClient(profile);
            if (matches.length > 0) {
              await persistAndNotifyMatches({
                matches,
                initiatorRole: 'client',
                initiatorPhone: phone,
                jobData: profile,
              });
              await sendWhatsAppMessage(phone, `Found ${matches.length} matching freelancer${matches.length > 1 ? 's' : ''}, reaching out to them now! 🎯`);
            }
          }

          if (matches.length === 0) {
            await sendWhatsAppMessage(phone, `Still searching — no match yet, but we'll notify you the moment one shows up! 🔔`);
          }
        } catch (err) {
          console.error('[matching] Error during on-demand match check:', err);
          await sendWhatsAppMessage(phone, `We ran into an issue checking your matches, but we'll keep looking!`);
        }
        return;
      }
    }

    if (freelancer) {
      await sendWhatsAppMessage(phone, getAlreadyRegisteredReply());
    } else {
      await sendWhatsAppMessage(phone, pickPostCompletionReply());
    }
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
    role: aiResult.role || conversation?.role || null,
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

      // Send the completion confirmation message FIRST and await it
      await sendWhatsAppMessage(phone, pickReplyText('completed').text);

      // ── Phase 1: Bidirectional Matching (Freelancer → Clients) ───────────
      try {
        const freelancerData = { phone, ...mergedTempData };
        const matches = await findMatchesForFreelancer(freelancerData);
        console.log(`[matching] ${matches.length} match(es) found for new freelancer ${phone}`);

        if (matches.length > 0) {
          await persistAndNotifyMatches({
            matches,
            initiatorRole: 'freelancer',
            initiatorPhone: phone,
            jobData: null, // N/A, they are matching against multiple jobs
            freelancerData,
          });
          await sendWhatsAppMessage(phone, `Found ${matches.length} project match${matches.length > 1 ? 'es' : ''} for you! 🎯`);
        } else {
          await sendWhatsAppMessage(phone, `We couldn't find an immediate match right now — but we'll notify you as soon as a matching project is available! 🔔`);
        }
      } catch (matchErr) {
        console.error('[matching] Error during freelancer matching flow:', matchErr);
      }

    } else if (effectiveRole === 'client') {
      await saveJobRequest(phone, mergedTempData);

      // Send the completion confirmation message FIRST and await it
      await sendWhatsAppMessage(phone, pickReplyText('completed').text);

      // ── Phase 1: Bidirectional Matching (Client → Freelancers) ───────────
      try {
        const jobRequest = { phone, ...mergedTempData };
        const matches = await findMatchesForClient(jobRequest);
        console.log(`[matching] ${matches.length} match(es) found for new client ${phone}`);

        if (matches.length > 0) {
          await persistAndNotifyMatches({
            matches,
            initiatorRole: 'client',
            initiatorPhone: phone,
            jobData: jobRequest,
          });
          await sendWhatsAppMessage(phone, `Found ${matches.length} matching freelancer${matches.length > 1 ? 's' : ''}, reaching out to them now! 🎯`);
        } else {
          await sendWhatsAppMessage(phone, `We couldn't find an immediate match right now — but we'll notify you as soon as a matching freelancer is available! 🔔`);
        }
      } catch (matchErr) {
        console.error('[matching] Error during client matching flow:', matchErr);
        // Don't block the completion reply
      }
    } else {
      console.warn('[handleMessage] Completion reached but role is unknown — no permanent row written. aiResult.role:', aiResult.role, 'conversation.role:', conversation?.role);
      await sendWhatsAppMessage(phone, pickReplyText('completed').text);
    }

    return;
  }

  // Use the niche-aware picker for collect_preferences, generic picker for everything else
  const replyText = aiResult.next_step === 'collect_preferences'
    ? pickPreferencesReply(mergedTempData)
    : pickReplyText(aiResult.next_step).text;
  await sendWhatsAppMessage(phone, replyText);
}

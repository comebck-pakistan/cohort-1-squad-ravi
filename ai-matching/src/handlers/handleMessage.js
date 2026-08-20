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
  saveReview,
  getReputation,
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
  getStepInteractiveConfig,
} from '../replies.js';
import { sendWhatsAppMessage, sendWhatsAppButtons, sendWelcomeInteractive } from '../whatsapp.js';
import { isAckOnly, parseDeadlineLocally, ensureDeadlineNormalized } from '../deadline.js';
import { tryHandleLocally } from '../localHandler.js';
import { parsePulseSelection, updateFreelancerPulseStatus } from '../pulse.js';

import { handleIcebreakerReply } from './icebreakerHandler.js';
import { matchSearchLimiter, maskPhone } from '../security.js';

/**
 * Builds human-readable summary blocks for live / connected matches.
 */
async function buildLiveMatchBlocks(liveMatches, phone) {
  const freelancerPhones = new Set();
  const clientPhones = new Set();
  for (const m of liveMatches) {
    if (m.freelancer_phone !== phone) freelancerPhones.add(m.freelancer_phone);
    if (m.job_phone !== phone) clientPhones.add(m.job_phone);
  }

  const profilePromises = [];
  const freelancerMap = new Map();
  const jobMap = new Map();

  for (const fp of freelancerPhones) {
    profilePromises.push(findFreelancer(fp).then(p => p && freelancerMap.set(fp, p)));
  }
  for (const cp of clientPhones) {
    profilePromises.push(findJobRequest(cp).then(j => j && jobMap.set(cp, j)));
  }
  profilePromises.push(findFreelancer(phone).then(p => p && freelancerMap.set(phone, p)));
  profilePromises.push(findJobRequest(phone).then(j => j && jobMap.set(phone, j)));
  await Promise.all(profilePromises);

  return liveMatches.map((m, i) => {
    const isClient = m.job_phone === phone;
    const otherPhone = isClient ? m.freelancer_phone : m.job_phone;

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

    let stage;
    if (m.status === 'connected') {
      stage = '✅ Connected';
    } else if (m.status === 'awaiting_response') {
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
}

/**
 * Sends either an interactive button message or regular text message
 * depending on whether the step has interactive buttons configured.
 */
async function sendStepMessage(phone, step, tempData = null) {
  const stepConfig = getStepInteractiveConfig(step, tempData);
  if (stepConfig.buttons && stepConfig.buttons.length > 0) {
    await sendWhatsAppButtons(phone, stepConfig.text, stepConfig.buttons, null, stepConfig.footer || null);
  } else {
    await sendWhatsAppMessage(phone, stepConfig.text);
  }
}

// 14 days in milliseconds
const INACTIVITY_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Returns true when the conversation was last updated more than 14 days ago.
 * A null/missing updated_at (brand-new conversation) is treated as active.
 */
function isReturningAfterInactivity(conversationRow) {
  if (!conversationRow?.updated_at) return false;
  const lastSeen = new Date(conversationRow.updated_at).getTime();
  return (Date.now() - lastSeen) > INACTIVITY_MS;
}

const RESET_PHRASES = ['reset ai', 'reset bot'];
const SEARCH_MATCHES_PHRASES = [
  'show my matches', 'show matches', 'my matches', 'show match', 'my match',
  'find matches', 'find my matches', 'find match', 'search matches', 'search match',
  'search for matches', 'any match', 'any matches', 'have you found any match',
  'have you found any matches', 'check matches', 'look for matches', 'find gigs',
  'find work', 'find clients', 'matches?', 'search'
];
const GET_STARTED_PHRASES = ['get started', 'get_started', 'start_onboarding', 'start onboarding'];
const LEARN_MORE_PHRASES  = ['learn what this bot does', 'learn_more', 'learn more', 'what does this bot do', 'what this bot does'];
const UPDATE_INFO_PHRASES = ['update my info', 'update_info', 'update info'];

/**
 * Handles post-project rating submissions and review notes.
 */
async function handleFeedbackSubmission({ phone, messageText, conversation }) {
  const lowerText = (messageText || '').toLowerCase().trim();
  const tempData = conversation?.temp_data || {};
  const currentFeedback = tempData.feedback || {};

  // Case A: User is submitting the optional review note (or tapping Skip Note)
  if (conversation?.step === 'awaiting_feedback_note' && currentFeedback.rating) {
    const isSkip = messageText === 'skip_feedback_note' || isSkipMessage(lowerText);
    const feedbackNote = isSkip ? null : messageText.trim();

    await saveReview({
      matchId: currentFeedback.matchId,
      reviewerPhone: phone,
      reviewerRole: currentFeedback.reviewerRole || 'client',
      revieweePhone: currentFeedback.revieweePhone,
      revieweeRole: currentFeedback.revieweeRole || 'freelancer',
      rating: currentFeedback.rating,
      feedbackNote,
      projectTitle: currentFeedback.projectTitle,
    });

    const counterpartName = currentFeedback.counterpartName || 'your match';
    const noteAck = feedbackNote ? `\n\n📝 Note: "${feedbackNote}"` : '';

    await sendWhatsAppMessage(
      phone,
      `✅ *Thank you for your feedback!* Your ${currentFeedback.rating}⭐ rating for *${counterpartName}* has been verified and recorded to their reputation score.${noteAck} 🚀`
    );

    // Reset conversation step back to completed
    const nextTempData = { ...tempData };
    delete nextTempData.feedback;
    await saveConversation({
      id: conversation.id,
      phone,
      role: conversation.role,
      step: 'completed',
      temp_data: nextTempData,
    });
    return true;
  }

  // Case B: User clicked an interactive rating button or typed a rating
  const rateButtonMatch = (messageText || '').match(/^rate_([1-5])(?:_(\d+))?$/);
  const textRatingMatch = lowerText.match(/^(?:rate\s*)?([1-5])(?:\s*\/\s*5|\s*stars?)?$/);

  // Only trigger text rating if user is prompted or already completed onboarding
  if (rateButtonMatch || (textRatingMatch && conversation?.step === 'completed')) {
    const rating = parseInt(rateButtonMatch ? rateButtonMatch[1] : textRatingMatch[1], 10);
    const rawMatchId = rateButtonMatch ? rateButtonMatch[2] : null;
    let matchId = rawMatchId ? parseInt(rawMatchId, 10) : null;

    let counterpartName = 'your counterpart';
    let revieweePhone = null;
    let revieweeRole = null;
    let reviewerRole = null;
    let projectTitle = 'Project';

    const liveMatches = await getAllLiveMatchesForPhone(phone);
    const targetMatch =
      (matchId && liveMatches.find(m => m.id === matchId)) ||
      liveMatches.find(m => m.status === 'connected') ||
      liveMatches[0];

    if (targetMatch) {
      matchId = targetMatch.id;
      const isClient = targetMatch.job_phone === phone;
      reviewerRole = isClient ? 'client' : 'freelancer';
      revieweeRole = isClient ? 'freelancer' : 'client';
      revieweePhone = isClient ? targetMatch.freelancer_phone : targetMatch.job_phone;

      if (isClient) {
        const fl = await findFreelancer(revieweePhone);
        counterpartName = fl?.name || 'Freelancer';
        const jr = await findJobRequest(phone);
        projectTitle = jr?.project_description?.slice(0, 40) || 'Project';
      } else {
        const jr = await findJobRequest(revieweePhone);
        counterpartName = jr?.name || 'Client';
        projectTitle = jr?.project_description?.slice(0, 40) || 'Project';
      }
    }

    if (!revieweePhone) {
      if (rateButtonMatch) {
        await sendWhatsAppMessage(phone, `Thanks for the rating! You don't have any active project matches waiting for a review right now.`);
        return true;
      }
      return false;
    }

    // Save pending rating in conversation state and prompt for note
    const nextTempData = {
      ...tempData,
      feedback: {
        matchId,
        rating,
        counterpartName,
        revieweePhone,
        revieweeRole,
        reviewerRole,
        projectTitle,
      },
    };

    await saveConversation({
      id: conversation?.id,
      phone,
      role: conversation?.role || reviewerRole,
      step: 'awaiting_feedback_note',
      temp_data: nextTempData,
    });

    const starIcons = '⭐'.repeat(rating);
    const buttons = [{ id: 'skip_feedback_note', title: 'Skip Note' }];

    await sendWhatsAppButtons(
      phone,
      `Got it! You gave *${counterpartName}* ${rating} / 5 ${starIcons}.\n\nWould you like to leave a quick note about your experience? (e.g. "Great communication and delivered on time!")\n\nOr tap *Skip Note* to submit right away:`,
      buttons,
      '⭐ Add Review Note',
      'Tap Skip Note to submit now'
    );
    return true;
  }

  return false;
}

export async function handleIncomingMessage({ phone, messageText }) {
  // Artificial delay to ensure "typing..." indicator is visible even on fast paths
  await new Promise(resolve => setTimeout(resolve, 800));

  const lowerText = (messageText || '').toLowerCase().trim();

  const [conversation, freelancer, activeMatches] = await Promise.all([
    findConversation(phone),
    findFreelancer(phone),
    getActiveMatchesForPhone(phone),
  ]);

  // --- 0. RETURNING-USER INACTIVITY GATE ---
  // If the user hasn't messaged in 14+ days, send the interactive welcome menu
  // (mirrors the Icebreaker experience for first-time users) and stop.
  if (isReturningAfterInactivity(conversation)) {
    const daysSince = Math.floor(
      (Date.now() - new Date(conversation.updated_at).getTime()) / 86_400_000
    );
    console.log(`[welcome] returning user ${phone}, inactive for ${daysSince} days`);
    await sendWelcomeInteractive(phone);
    return;
  }

  // --- 0.4 META ICEBREAKER PLAIN-TEXT COMMANDS ---
  // When users tap Meta Icebreaker prompts configured in WhatsApp Manager UI,
  // Meta sends them as plain text messages (e.g. "Get started", "Learn what this bot does").
  if (GET_STARTED_PHRASES.includes(lowerText)) {
    await handleIcebreakerReply(phone, 'start_onboarding', messageText);
    return;
  }
  if (LEARN_MORE_PHRASES.includes(lowerText)) {
    await handleIcebreakerReply(phone, 'learn_more', messageText);
    return;
  }
  if (UPDATE_INFO_PHRASES.includes(lowerText)) {
    await handleIcebreakerReply(phone, 'update_info', messageText);
    return;
  }

  // --- 0.5 SHOW MY MATCHES & LIVE ON-DEMAND MATCH SEARCH ---
  const isSearchMatchRequest = SEARCH_MATCHES_PHRASES.some((phrase) => lowerText.includes(phrase));
  if (isSearchMatchRequest) {
    // 1. Resolve registered profile
    let role = conversation?.role;
    let profile = freelancer;
    if (!profile) {
      if (role === 'client') {
        profile = await findJobRequest(phone);
      } else {
        profile = await findFreelancer(phone);
        if (profile) {
          role = 'freelancer';
        } else {
          profile = await findJobRequest(phone);
          if (profile) role = 'client';
        }
      }
    } else {
      role = 'freelancer';
    }

    if (!profile) {
      await sendWhatsAppMessage(
        phone,
        `You haven't completed your profile registration yet! Type *Hi* to get started. 🚀`
      );
      return;
    }

    // 2. Pending match safeguard:
    // If user already has an active pending match in flight, don't blast other candidates
    const pendingMatch = activeMatches.find(m => m.status === 'awaiting_response' || m.status === 'awaiting_other');
    if (pendingMatch) {
      const isClient = pendingMatch.job_phone === phone;
      const isFirstParty = pendingMatch.initiator_role === (isClient ? 'freelancer' : 'client');
      const isTheirTurn = (pendingMatch.status === 'awaiting_response' && isFirstParty) ||
                          (pendingMatch.status === 'awaiting_other' && !isFirstParty);

      if (isTheirTurn) {
        const buttons = [
          { id: 'match_interested', title: '✅ Interested' },
          { id: 'match_declined',   title: '❌ Not Interested' },
        ];
        await sendWhatsAppButtons(
          phone,
          `⏳ *You have a match waiting for your response!*\n\nPlease reply *interested* to connect, or *not interested* to pass before running a new search.`,
          buttons,
          '⏳ Match Pending',
          'Tap an option'
        );
        return;
      } else {
        await sendWhatsAppMessage(
          phone,
          `⏳ *Match in progress!*\nWe've already notified the candidate about your match and are waiting for their response. We'll message you immediately once they confirm! 🔔`
        );
        return;
      }
    }

    // 3. Fetch current live matches
    const liveMatches = await getAllLiveMatchesForPhone(phone);
    const connectedMatches = liveMatches.filter(m => m.status === 'connected');

    // 4. Anti-Abuse Cooldown Check
    const cooldownCheck = matchSearchLimiter.check(phone);
    if (!cooldownCheck.allowed) {
      console.log(`[matching] On-demand search throttled for ${maskPhone(phone)} (retry in ${cooldownCheck.retryAfterMin}m)`);
      if (connectedMatches.length > 0) {
        const blocks = await buildLiveMatchBlocks(connectedMatches, phone);
        await sendWhatsAppMessage(
          phone,
          `🔍 *We searched for matches recently!*\n\n📊 *Your Connected Matches (${connectedMatches.length}):*\n\n` +
          blocks.join('\n\n') +
          `\n\n⏳ You can run another manual search in *${cooldownCheck.retryAfterMin} minute(s)*.`
        );
      } else {
        await sendWhatsAppMessage(
          phone,
          `🔍 *We recently searched for matches for you!*\nOur AI engine continuously scans for new profiles in the background 24/7 and will alert you the moment a new match is found.\n\n⏳ You can run another manual search in *${cooldownCheck.retryAfterMin} minute(s)*.`
        );
      }
      return;
    }

    // 5. Record search timestamp
    matchSearchLimiter.record(phone);

    // 6. Execute live on-demand search
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
          await sendWhatsAppMessage(
            phone,
            `🎯 *Great news!* We found *${matches.length} matching project${matches.length > 1 ? 's' : ''}* for your skills and just reached out to the client! We'll notify you as soon as they confirm. 🚀`
          );
          return;
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
          await sendWhatsAppMessage(
            phone,
            `🎯 *Great news!* We found *${matches.length} matching freelancer${matches.length > 1 ? 's' : ''}* for your project and just reached out to the top candidate! We'll notify you as soon as they confirm. 🚀`
          );
          return;
        }
      }

      // No new matches meeting threshold right now
      if (connectedMatches.length > 0) {
        const blocks = await buildLiveMatchBlocks(connectedMatches, phone);
        await sendWhatsAppMessage(
          phone,
          `🔍 We ran a live scan across all active profiles, but no new matching candidates are available right now.\n\n📊 *Your Connected Matches (${connectedMatches.length}):*\n\n` +
          blocks.join('\n\n') +
          `\n\nWe'll automatically ping you as soon as a new match joins! 🔔`
        );
      } else {
        await sendWhatsAppMessage(
          phone,
          `🔍 We just scanned all active profiles in real-time, but no immediate matches meet the threshold right now.\n\nWe'll automatically alert you the moment a matching ${role === 'client' ? 'freelancer' : 'project'} comes in! 🔔`
        );
      }
    } catch (err) {
      console.error('[matching] Error during on-demand match search:', err);
      await sendWhatsAppMessage(
        phone,
        `We ran into a temporary issue while scanning for matches, but we'll continue searching in the background! 🔔`
      );
    }
    return;
  }

  // --- 1. RESET ---
  if (RESET_PHRASES.some((phrase) => lowerText.includes(phrase))) {
    await resetUser(phone);
    await sendWhatsAppMessage(phone, getResetReply());
    return;
  }

  // --- 1.2 POST-PROJECT FEEDBACK & RATINGS ---
  const feedbackHandled = await handleFeedbackSubmission({ phone, messageText, conversation });
  if (feedbackHandled) {
    return;
  }

  // --- 1.3 WEEKLY AVAILABILITY PULSE REPLIES ---
  const pulseMatch = parsePulseSelection(messageText);
  if (pulseMatch) {
    await updateFreelancerPulseStatus(phone, pulseMatch);
    await sendWhatsAppMessage(phone, pulseMatch.replyMessage);
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
      const isDeclined = lowerText === 'not interested' || lowerText === 'no' || lowerText.startsWith('match_declined');
      const isInterested = lowerText === 'interested' || lowerText === 'yes' || lowerText.startsWith('match_interested');

      if (isDeclined) {
        await updateMatchStatus(pendingMatch.id, { 
          status: 'declined', 
          declined_by: role,
          responded_at: new Date().toISOString()
        });
        await sendWhatsAppMessage(phone, "Got it, we've passed on this match and will continue looking for you.");
        // TODO: advance to next rank in batch
        return;
      } 
      
      if (isInterested) {
        if (pendingMatch.status === 'awaiting_response') {
          // First party accepted!
          await updateMatchStatus(pendingMatch.id, { 
            status: 'awaiting_other',
            responded_at: new Date().toISOString()
          });
          
          await sendWhatsAppMessage(phone, "Awesome! We've notified the other party. We'll share contact info as soon as they confirm.");
          
          // Notify the other party with interactive buttons
          const otherPhone = isClient ? pendingMatch.freelancer_phone : pendingMatch.job_phone;
          const notifyText = [
            `🎉 The ${role} has reviewed your profile and is interested in matching!`,
            ``,
            `Reply *interested* if you'd like to connect, or *not interested* to pass.`
          ].join('\n');
          const buttons = [
            { id: 'match_interested', title: '✅ Interested' },
            { id: 'match_declined',   title: '❌ Not Interested' },
          ];
          await sendWhatsAppButtons(
            otherPhone,
            notifyText,
            buttons,
            '🎉 Match Opportunity',
            'Tap an option to respond'
          );
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
          // receiving matches with interactive buttons.
          const availPrompt = `Would you like to continue receiving matches? Tap below to stay active or pause.`;
          const availButtons = [
            { id: 'avail_active_yes', title: '🟢 Keep Active' },
            { id: 'avail_active_no',  title: '⏸️ Pause Matches' },
          ];

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

          await sendWhatsAppButtons(pendingMatch.freelancer_phone, availPrompt, availButtons, 'Availability Status', 'Tap an option');
          await sendWhatsAppButtons(pendingMatch.job_phone, availPrompt, availButtons, 'Availability Status', 'Tap an option');

          return;
        }
      }

      // Catch-all: user has a pending match and it's their turn, but they
      // sent something other than "interested" / "not interested".
      const buttons = [
        { id: 'match_interested', title: '✅ Interested' },
        { id: 'match_declined',   title: '❌ Not Interested' },
      ];
      await sendWhatsAppButtons(
        phone,
        `You have a match waiting for your response!\n\nReply *interested* to connect, or *not interested* to pass.`,
        buttons,
        '⏳ Match Waiting',
        'Tap an option'
      );
      return;
    }
  }

  // --- 1.7 AVAILABILITY PROMPT RESPONSES ---
  // If the user has an outstanding "continue receiving matches?" question,
  // handle yes/no before any other handler can intercept the message.
  if (conversation?.temp_data?.awaiting_availability_response) {
    const YES_WORDS = new Set(['yes', 'yeah', 'yep', 'yea', 'sure', 'y', 'avail_active_yes']);
    const NO_WORDS  = new Set(['no', 'nope', 'nah', 'n', 'avail_active_no']);

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

    // Unrecognised reply — re-prompt with buttons
    const availButtons = [
      { id: 'avail_active_yes', title: '🟢 Keep Active' },
      { id: 'avail_active_no',  title: '⏸️ Pause Matches' },
    ];
    await sendWhatsAppButtons(
      phone,
      `Would you like to continue receiving matches? Reply *yes* to stay active, or *no* to pause.`,
      availButtons,
      'Availability Status',
      'Tap an option'
    );
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
      await sendStepMessage(phone, conversation.step, conversation.temp_data);
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
      await sendStepMessage(phone, aiResult.next_step, aiResult.extracted_data);
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

  // --- 6. ALREADY COMPLETED FALLBACK ---
  if (freelancer || (conversation && conversation.step === 'completed')) {
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

  await sendStepMessage(phone, aiResult.next_step, mergedTempData);
}

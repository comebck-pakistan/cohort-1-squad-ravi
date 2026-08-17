import { parseYesNoLocally } from './deadline.js';
import {
  findFreelancer,
  findJobRequest,
  findMatchById,
  getPendingContactRequestsForTarget,
  getRankedMatchesForPhone,
  insertNotifications,
  saveConversation,
  updateMatchLifecycle,
  upsertMatchFeedback,
} from './supabase.js';
import { sendWhatsAppMessage } from './whatsapp.js';

const POSITIVE_STATUSES = new Set(['interested', 'shortlisted', 'hired', 'completed']);
const TERMINAL_STATUSES = new Set(['declined', 'completed']);
const SHOW_FILTER_LABELS = {
  all: 'current matches',
  accepted: 'accepted matches',
  declined: 'declined matches',
  shortlisted: 'shortlisted matches',
  pending: 'pending requests',
};

function cleanPhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function whatsappLink(phone) {
  const cleaned = cleanPhone(phone);
  return cleaned ? `wa.me/${cleaned}` : 'Not available';
}

function shortText(text, fallback = 'this match') {
  const value = String(text || fallback).trim();
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

function profileName(profile, role) {
  if (role === 'freelancer') return profile?.name || 'the freelancer';
  return profile?.name || 'the client';
}

function parseRank(text) {
  const match = String(text || '').match(/(?:^|\s)#?(\d{1,2})(?:\s|$)/);
  if (!match) return null;
  const rank = Number(match[1]);
  return Number.isInteger(rank) && rank > 0 ? rank : null;
}

function detectReason(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return { key: null, text: null };
  if (/\bbudget|price|rate|cost|expensive|cheap\b/.test(t)) return { key: 'budget', text };
  if (/\bskill|skills|experience|portfolio|quality|fit\b/.test(t)) return { key: 'skills', text };
  if (/\btiming|deadline|timeline|availability|available|time\b/.test(t)) return { key: 'timing', text };
  if (/\btrust|verify|verified|proof|link|linkedin|github|cv\b/.test(t)) return { key: 'trust', text };
  if (/\bcontact|phone|whatsapp|number|private\b/.test(t)) return { key: 'contact', text };
  if (/\bother|another|misc\b/.test(t)) return { key: 'other', text };
  return { key: 'other', text };
}

function reasonTextFromCommand(text, action) {
  const t = String(text || '').trim();
  if (!action) return '';
  const actionWords = {
    decline: /(decline|declined|not interested|pass|reject|skip)/i,
    useful: /(feedback|useful|helpful|good match|bad match|not useful|not helpful)/i,
  };
  return t.replace(actionWords[action] || /^$/, '').replace(/#?\d{1,2}/, '').trim();
}

function roleSide(role) {
  return role === 'freelancer'
    ? { statusField: 'freelancer_status', timeField: 'freelancer_responded_at' }
    : { statusField: 'client_status', timeField: 'client_responded_at' };
}

function actionToSideStatus(action, role) {
  if (action === 'interested') return 'interested';
  if (action === 'shortlist') return 'shortlisted';
  if (action === 'decline') return 'declined';
  if (action === 'hire') return role === 'client' ? 'hired' : 'interested';
  if (action === 'complete') return 'completed';
  return 'pending';
}

function deriveOverallStatus(next) {
  const freelancerStatus = next.freelancer_status || 'pending';
  const clientStatus = next.client_status || 'pending';

  if (freelancerStatus === 'completed' || clientStatus === 'completed') return 'completed';
  if (freelancerStatus === 'hired' || clientStatus === 'hired') return 'hired';
  if (freelancerStatus === 'declined' || clientStatus === 'declined') return 'declined';
  if (POSITIVE_STATUSES.has(freelancerStatus) && POSITIVE_STATUSES.has(clientStatus)) return 'mutual_interest';
  if (freelancerStatus === 'shortlisted' || clientStatus === 'shortlisted') return 'shortlisted';
  return 'matched';
}

function statusLabel(match) {
  const status = match?.status || 'matched';
  return status.replace(/_/g, ' ');
}

function parseShowFilter(text) {
  const t = String(text || '').trim().toLowerCase();
  const wantsDisplay = /^(show|list|display|see)\b/.test(t) ||
    /^(accepted|declined|shortlisted|pending)$/.test(t) ||
    /\b(matches|offers|projects|results|requests)\b/.test(t);
  if (!wantsDisplay) return null;

  if (/\baccepted\b|\binterested\b/.test(t)) return 'accepted';
  if (/\bdeclined\b|\brejected\b/.test(t)) return 'declined';
  if (/\bshortlist(?:ed)?\b|\bsaved\b/.test(t)) return 'shortlisted';
  if (/\bpending\b/.test(t)) return 'pending';
  return null;
}

function filterMatchesForView(entries, role, filter = 'all') {
  if (!filter || filter === 'all') return entries;

  const { statusField } = roleSide(role);
  const otherStatusField = role === 'freelancer' ? 'client_status' : 'freelancer_status';

  return entries.filter(({ match }) => {
    const status = match.status || 'matched';
    const myStatus = match[statusField] || 'pending';
    const otherStatus = match[otherStatusField] || 'pending';

    if (filter === 'accepted') {
      if (status === 'declined') return false;
      return status === 'mutual_interest' ||
        status === 'hired' ||
        status === 'completed' ||
        myStatus === 'interested' ||
        myStatus === 'hired' ||
        myStatus === 'completed';
    }

    if (filter === 'declined') {
      return status === 'declined' || myStatus === 'declined' || otherStatus === 'declined';
    }

    if (filter === 'shortlisted') {
      if (status === 'declined') return false;
      return status === 'shortlisted' || myStatus === 'shortlisted' || otherStatus === 'shortlisted';
    }

    if (filter === 'pending') {
      return !TERMINAL_STATUSES.has(status) &&
        status !== 'hired' &&
        myStatus === 'pending' &&
        POSITIVE_STATUSES.has(otherStatus);
    }

    return true;
  });
}

function contextLine(match, freelancer, job, role) {
  if (role === 'freelancer') {
    return `${job?.name || 'Client'}: ${shortText(job?.project_description || job?.brief_description, 'matched project')} (Overall ${match?.total_score ?? match?.compatibility_score ?? 'N/A'}%)`;
  }
  return `${freelancer?.name || 'Freelancer'} (Overall ${match?.total_score ?? match?.compatibility_score ?? 'N/A'}%, Skill ${match?.compatibility_score ?? 'N/A'}%)`;
}

function contactLine(targetProfile, targetRole, requestRank) {
  if (targetProfile?.contact_sharing_allowed === true) {
    return `${profileName(targetProfile, targetRole)} WhatsApp: ${whatsappLink(targetProfile.phone)}`;
  }
  if (requestRank) {
    return `${profileName(targetProfile, targetRole)} keeps contact private. Reply "request contact ${requestRank}" and I'll ask them first.`;
  }
  return `${profileName(targetProfile, targetRole)} keeps contact private. Reply "show my matches" to get the request command.`;
}

async function loadProfilesForMatch(match) {
  const [freelancer, job] = await Promise.all([
    findFreelancer(match.freelancer_phone),
    findJobRequest(match.client_phone),
  ]);
  return { freelancer, job };
}

async function rankForMatch(phone, role, matchId) {
  const matches = await getRankedMatchesForPhone(phone, role);
  const index = matches.findIndex((m) => String(m.id) === String(matchId));
  return index >= 0 ? index + 1 : null;
}

async function setPendingFeedback({ phone, conversation, role, matchId, kind, rank }) {
  const tempData = {
    ...(conversation?.temp_data || {}),
    pending_match_feedback: { match_id: matchId, role, kind, rank },
  };
  await saveConversation({
    id: conversation?.id ?? null,
    phone,
    role: conversation?.role || role,
    step: conversation?.step || 'completed',
    temp_data: tempData,
  });
}

async function clearPendingFeedback({ phone, conversation, role }) {
  const tempData = { ...(conversation?.temp_data || {}) };
  delete tempData.pending_match_feedback;
  await saveConversation({
    id: conversation?.id ?? null,
    phone,
    role: conversation?.role || role,
    step: conversation?.step || 'completed',
    temp_data: tempData,
  });
}

function parseFeedbackCommand(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;

  const usefulIntent = /\b(useful|helpful|good match|bad match|not useful|not helpful|feedback)\b/.test(t);
  if (!usefulIntent) return null;

  let useful = null;
  if (/\bnot useful|not helpful|bad match|no|nope|nah|nahi\b/.test(t)) useful = false;
  if (/\bgood match|helpful|yes|yeah|yep|haan|ji|bilkul\b/.test(t) && useful == null) useful = true;

  const rank = parseRank(t);
  const reason = detectReason(reasonTextFromCommand(text, 'useful'));
  return {
    action: 'feedback',
    rank,
    useful,
    reason_key: reason.key,
    reason_text: reason.text,
  };
}

export function parseMatchLifecycleCommand(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;

  const feedback = parseFeedbackCommand(text);
  if (feedback) return feedback;

  const showFilter = parseShowFilter(t);
  if (showFilter) {
    return { action: 'show', filter: showFilter };
  }

  if (/^(show\s+)?(my\s+)?matches\b/.test(t) || /^(match|matches|status|show status)$/.test(t)) {
    return { action: 'show', filter: 'all' };
  }

  const rank = parseRank(t);
  if (/\b(mark\s+)?complete(d)?\b|\bfinish(ed)?\b|\bdone with\b/.test(t)) {
    return { action: 'complete', rank };
  }
  if (/\bhire(d)?\b|\bstart(ed)?\b/.test(t)) {
    return { action: 'hire', rank };
  }
  if (/\bshortlist(ed)?\b|\bsave(d)?\b/.test(t)) {
    return { action: 'shortlist', rank };
  }
  if (/\bdecline(d)?\b|\bnot interested\b|\bpass\b|\breject\b/.test(t)) {
    const reason = detectReason(reasonTextFromCommand(text, 'decline'));
    return {
      action: 'decline',
      rank,
      reason_key: reason.key,
      reason_text: reason.text,
    };
  }
  if (/\binterested\b|\baccept(ed)?\b|\bi'?m in\b|\bapply\b|\blet'?s do\b/.test(t)) {
    return { action: 'interested', rank };
  }

  return null;
}

async function pickMatchForCommand({ phone, role, command }) {
  const matches = await getRankedMatchesForPhone(phone, role);
  if (matches.length === 0) return { match: null, rank: null, count: 0 };

  if (command.rank) {
    return { match: matches[command.rank - 1] || null, rank: command.rank, count: matches.length };
  }

  const { statusField } = roleSide(role);
  const actionable = matches.filter((m) => !TERMINAL_STATUSES.has(m[statusField] || 'pending'));
  if (actionable.length === 1) {
    const rank = matches.findIndex((m) => String(m.id) === String(actionable[0].id)) + 1;
    return { match: actionable[0], rank, count: matches.length };
  }

  return { match: null, rank: null, count: matches.length };
}

async function sendMatchSummary({ phone, role, filter = 'all' }) {
  const matches = await getRankedMatchesForPhone(phone, role);
  const pendingContactRequests = filter === 'pending'
    ? await getPendingContactRequestsForTarget(phone)
    : [];
  if (matches.length === 0) {
    if (pendingContactRequests.length === 0) {
      await sendWhatsAppMessage(phone, "You don't have active matches yet. I'll message you when a strong one appears.");
      return true;
    }
  }

  const pendingContactLines = [];
  for (let i = 0; i < pendingContactRequests.length; i += 1) {
    const request = pendingContactRequests[i];
    const match = await findMatchById(request.match_id);
    if (!match) continue;
    const { freelancer, job } = await loadProfilesForMatch(match);
    const requesterRole = request.requester_role;
    const requesterProfile = requesterRole === 'freelancer' ? freelancer : job;
    pendingContactLines.push(
      `Contact request ${i + 1}. ${profileName(requesterProfile, requesterRole)} wants your WhatsApp contact.\n` +
      `   ${contextLine(match, freelancer, job, role)}\n` +
      '   Reply YES to approve the latest contact request, or NO to decline.',
    );
  }

  if (matches.length === 0 && pendingContactLines.length > 0) {
    await sendWhatsAppMessage(phone, `Here are your pending requests:\n\n${pendingContactLines.join('\n\n')}`);
    return true;
  }

  const rankedEntries = matches.map((match, index) => ({ match, rank: index + 1 }));
  const filteredEntries = filterMatchesForView(rankedEntries, role, filter);
  if (filteredEntries.length === 0 && pendingContactLines.length === 0) {
    const label = SHOW_FILTER_LABELS[filter] || 'matches in that category';
    await sendWhatsAppMessage(phone, `No ${label} yet. Reply "show my matches" to see everything.`);
    return true;
  }

  const top = filteredEntries.slice(0, 5);
  const lines = [];
  for (const entry of top) {
    const { match, rank } = entry;
    const { freelancer, job } = await loadProfilesForMatch(match);
    const sideStatus = role === 'freelancer' ? match.freelancer_status : match.client_status;
    const otherProfile = role === 'freelancer' ? job : freelancer;
    const otherRole = role === 'freelancer' ? 'client' : 'freelancer';
    lines.push(
      `${rank}. ${contextLine(match, freelancer, job, role)}\n` +
      `   Status: ${statusLabel(match)} · Your side: ${sideStatus || 'pending'}\n` +
      `   ${contactLine(otherProfile, otherRole, rank)}`,
    );
  }

  const commands = role === 'freelancer'
    ? 'Reply "interested 1", "decline 1", "completed 1", "request contact 1", or "useful 1 yes/no".'
    : 'Reply "shortlist 1", "hire 1", "decline 1", "completed 1", "request contact 1", or "useful 1 yes/no".';
  const title = SHOW_FILTER_LABELS[filter] || SHOW_FILTER_LABELS.all;
  const extra = filter === 'all'
    ? 'You can also reply "show accepted", "show declined", "show shortlisted", or "show pending".'
    : 'Reply "show my matches" to see everything.';
  const sections = [];
  if (pendingContactLines.length > 0) sections.push(pendingContactLines.join('\n\n'));
  if (lines.length > 0) sections.push(lines.join('\n\n'));
  const commandHint = lines.length > 0 ? `\n\n${commands}` : '';
  await sendWhatsAppMessage(phone, `Here are your ${title}:\n\n${sections.join('\n\n')}${commandHint}\n${extra}`);
  return true;
}

async function sendMutualInterestMessages({ match, freelancer, job }) {
  const clientRank = await rankForMatch(job.phone, 'client', match.id);
  const freelancerRank = await rankForMatch(freelancer.phone, 'freelancer', match.id);

  await sendWhatsAppMessage(
    job.phone,
    `Mutual interest confirmed for ${freelancer.name || 'this freelancer'}.\n\n${contactLine(freelancer, 'freelancer', clientRank)}\n\nReply "hire ${clientRank || ''}" when you decide to move forward.`.trim(),
  );
  await sendWhatsAppMessage(
    freelancer.phone,
    `Mutual interest confirmed for ${job.name || 'this client'}'s project.\n\n${contactLine(job, 'client', freelancerRank)}\n\nReply "completed ${freelancerRank || ''}" when the work is done.`.trim(),
  );
}

async function writeLifecycleNotifications({ actorRole, action, match, freelancer, job }) {
  const actorName = actorRole === 'freelancer' ? freelancer?.name || 'A freelancer' : job?.name || 'A client';
  const targetPhone = actorRole === 'freelancer' ? match.client_phone : match.freelancer_phone;
  const titleByAction = {
    interested: 'Match marked interested',
    shortlist: 'Match shortlisted',
    decline: 'Match declined',
    hire: 'Match marked hired',
    complete: 'Match marked completed',
  };
  await insertNotifications([{
    phone: targetPhone,
    type: 'match_status',
    title: titleByAction[action] || 'Match updated',
    body: `${actorName} updated a match: ${statusLabel(match)}.`,
  }]);
}

async function recordFeedback({ phone, role, matchId, useful, reasonKey, reasonText }) {
  await upsertMatchFeedback({
    match_id: matchId,
    phone,
    role,
    useful,
    reason_key: reasonKey,
    reason_text: reasonText,
  });
}

export async function handlePendingMatchFeedback({ phone, conversation, messageText }) {
  const pending = conversation?.temp_data?.pending_match_feedback;
  if (!pending?.match_id) return false;

  const role = pending.role || conversation?.role;
  const match = await findMatchById(pending.match_id);
  if (!match) {
    await clearPendingFeedback({ phone, conversation, role });
    await sendWhatsAppMessage(phone, "I couldn't find that match anymore, so I cleared the feedback prompt.");
    return true;
  }

  if (pending.kind === 'useful') {
    const useful = parseYesNoLocally(messageText);
    if (useful === null) {
      await sendWhatsAppMessage(phone, 'Just a quick yes or no — was that match useful?');
      return true;
    }
    await recordFeedback({ phone, role, matchId: match.id, useful, reasonKey: null, reasonText: null });
    await clearPendingFeedback({ phone, conversation, role });
    await sendWhatsAppMessage(phone, "Thanks — I'll use that to improve future rankings.");
    return true;
  }

  const reason = detectReason(messageText);
  await recordFeedback({
    phone,
    role,
    matchId: match.id,
    useful: false,
    reasonKey: reason.key || 'other',
    reasonText: reason.text,
  });
  await clearPendingFeedback({ phone, conversation, role });
  await sendWhatsAppMessage(phone, "Got it — thanks. I'll factor that into future matches.");
  return true;
}

export async function handleMatchLifecycleCommand({ phone, role, conversation, command }) {
  if (!role || !['client', 'freelancer'].includes(role)) {
    await sendWhatsAppMessage(phone, 'Finish registration first, then I can manage your matches here.');
    return true;
  }

  if (command.action === 'show') {
    return sendMatchSummary({ phone, role, filter: command.filter || 'all' });
  }

  if (command.action === 'feedback') {
    const { match, rank, count } = await pickMatchForCommand({ phone, role, command });
    if (!match) {
      await sendWhatsAppMessage(
        phone,
        count > 1
          ? 'Which match is this feedback for? Try: useful 1 yes'
          : "I couldn't find that match. Reply \"show my matches\" to see the latest list.",
      );
      return true;
    }

    if (command.useful === null || command.useful === undefined) {
      await setPendingFeedback({ phone, conversation, role, matchId: match.id, kind: 'useful', rank });
      await sendWhatsAppMessage(phone, `Was match #${rank} useful? Reply yes or no.`);
      return true;
    }

    await recordFeedback({
      phone,
      role,
      matchId: match.id,
      useful: command.useful,
      reasonKey: command.reason_key,
      reasonText: command.reason_text,
    });
    await sendWhatsAppMessage(phone, "Thanks — I'll use that to improve future rankings.");
    return true;
  }

  const effectiveAction = command.action === 'hire' && role === 'freelancer'
    ? 'interested'
    : command.action;
  const { match, rank, count } = await pickMatchForCommand({ phone, role, command });
  if (!match) {
    await sendWhatsAppMessage(
      phone,
      count > 1
        ? `Which match do you mean? Reply with the number, like "${command.action} 1", or say "show my matches".`
        : "I couldn't find that match. Reply \"show my matches\" to see your current matches.",
    );
    return true;
  }

  const { freelancer, job } = await loadProfilesForMatch(match);
  if (!freelancer || !job) {
    await sendWhatsAppMessage(phone, "I found the match, but couldn't load both profiles. Try again in a minute.");
    return true;
  }

  const { statusField, timeField } = roleSide(role);
  const sideStatus = actionToSideStatus(effectiveAction, role);
  const patch = {
    [statusField]: sideStatus,
    [timeField]: new Date().toISOString(),
  };
  if (effectiveAction === 'hire') patch.hired_at = new Date().toISOString();
  if (effectiveAction === 'complete') patch.completed_at = new Date().toISOString();
  patch.status = deriveOverallStatus({ ...match, ...patch });

  const updated = await updateMatchLifecycle(match.id, patch);
  if (!updated) {
    await sendWhatsAppMessage(phone, "I couldn't update that match right now. Please try again in a bit.");
    return true;
  }

  await writeLifecycleNotifications({ actorRole: role, action: effectiveAction, match: updated, freelancer, job });

  const otherPhone = role === 'freelancer' ? match.client_phone : match.freelancer_phone;
  const actorName = role === 'freelancer' ? freelancer.name || 'The freelancer' : job.name || 'The client';
  const otherRank = await rankForMatch(otherPhone, role === 'freelancer' ? 'client' : 'freelancer', match.id);

  if (effectiveAction === 'decline') {
    await sendWhatsAppMessage(otherPhone, `${actorName} declined this match for now.`);
    if (command.reason_key) {
      await recordFeedback({
        phone,
        role,
        matchId: match.id,
        useful: false,
        reasonKey: command.reason_key,
        reasonText: command.reason_text,
      });
      await sendWhatsAppMessage(phone, `No problem — I marked match #${rank} declined and saved the feedback.`);
    } else {
      await setPendingFeedback({ phone, conversation, role, matchId: match.id, kind: 'decline_reason', rank });
      await sendWhatsAppMessage(phone, `No problem — I marked match #${rank} declined. What was the main reason? budget / skills / timing / trust / contact / other`);
    }
    return true;
  }

  const actionLabels = {
    interested: 'interested',
    shortlist: 'shortlisted',
    hire: 'hired',
    complete: 'completed',
  };
  await sendWhatsAppMessage(
    phone,
    `Done — match #${rank} is marked ${actionLabels[effectiveAction] || sideStatus}. You can also reply "useful ${rank} yes/no" after reviewing the match.`,
  );

  await sendWhatsAppMessage(
    otherPhone,
    `${actorName} marked your match as ${actionLabels[effectiveAction] || sideStatus}.${otherRank ? ` Reply "show my matches" or update it with match #${otherRank}.` : ''}`,
  );

  const becameMutual = updated.status === 'mutual_interest' && match.status !== 'mutual_interest';
  if (becameMutual || effectiveAction === 'hire') {
    await sendMutualInterestMessages({ match: updated, freelancer, job });
  }

  return true;
}

import { parseYesNoLocally } from './deadline.js';
import {
  createContactRequest,
  findFreelancer,
  findJobRequest,
  findLatestPendingContactApproval,
  findMatchById,
  findPendingContactRequest,
  getRankedMatchesForPhone,
  updateContactRequestStatus,
} from './supabase.js';
import { sendWhatsAppMessage } from './whatsapp.js';

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

function contactAllowed(profile) {
  return profile?.contact_sharing_allowed === true;
}

function profileName(profile, role) {
  if (role === 'freelancer') return profile?.name || 'the freelancer';
  return profile?.name || 'the client';
}

function contextLine(match, freelancer, job) {
  const project = shortText(job?.project_description || job?.brief_description, 'the matched project');
  const freelancerName = freelancer?.name || 'Freelancer';
  return `${freelancerName} <> ${project} (Overall ${match?.total_score ?? match?.compatibility_score ?? 'N/A'}%)`;
}

function parseRank(text) {
  const match = String(text || '').match(/(?:^|\s)#?(\d{1,2})(?:\s|$)/);
  if (!match) return null;
  const rank = Number(match[1]);
  return Number.isInteger(rank) && rank > 0 ? rank : null;
}

function parseApprovalDecision(text) {
  const local = parseYesNoLocally(text);
  if (local !== null) return local;
  const t = String(text || '').trim().toLowerCase().replace(/[!.]+$/, '');
  if (['approve', 'approved', 'allow', 'share', 'share it', 'ok share'].includes(t)) return true;
  if (['decline', 'declined', 'deny', 'reject', "don't share", 'do not share'].includes(t)) return false;
  return null;
}

export function parseContactRequestCommand(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return null;
  const hasContactWord = /\b(contact|whatsapp|phone|number|info)\b/.test(t);
  const hasRequestIntent = /\b(request|ask|want|get|send|share)\b/.test(t) || /^contact\s+#?\d+/.test(t);
  if (!hasContactWord || !hasRequestIntent) return null;
  return { rank: parseRank(t) };
}

async function loadProfilesForMatch(match) {
  const [freelancer, job] = await Promise.all([
    findFreelancer(match.freelancer_phone),
    findJobRequest(match.client_phone),
  ]);
  return { freelancer, job };
}

async function sendContactToRequester(requesterPhone, targetRole, targetProfile, prefix = 'Contact approved') {
  await sendWhatsAppMessage(
    requesterPhone,
    `${prefix}:\n\n${profileName(targetProfile, targetRole)}\nWhatsApp: ${whatsappLink(targetProfile?.phone)}`,
  );
}

function approvalPrompt({ request, match, freelancer, job }) {
  if (request.target_role === 'freelancer') {
    return `A matched client wants your WhatsApp contact.\n\nProject: ${shortText(job?.project_description || job?.brief_description, 'matched project')}\nClient: ${job?.name || 'Client'}\nMatch: Overall ${match.total_score ?? match.compatibility_score ?? 'N/A'}%, Skill ${match.compatibility_score ?? 'N/A'}%\n\nReply YES to share your contact, or NO to decline.`;
  }

  return `A matched freelancer wants your WhatsApp contact.\n\nFreelancer: ${freelancer?.name || 'Freelancer'}\nProject: ${shortText(job?.project_description || job?.brief_description, 'your project')}\nMatch: Overall ${match.total_score ?? match.compatibility_score ?? 'N/A'}%, Skill ${match.compatibility_score ?? 'N/A'}%\n\nReply YES to share your contact, or NO to decline.`;
}

export async function requestContactForMatchRank({ requesterPhone, requesterRole, rank }) {
  if (!requesterRole || !['client', 'freelancer'].includes(requesterRole)) {
    await sendWhatsAppMessage(requesterPhone, "I couldn't tell whether you're a client or freelancer yet. Finish registration first, then ask for contact info.");
    return true;
  }

  if (!rank) {
    await sendWhatsAppMessage(requesterPhone, 'Tell me which match number you want, like: request contact 1');
    return true;
  }

  const matches = await getRankedMatchesForPhone(requesterPhone, requesterRole);
  const match = matches[rank - 1];
  if (!match) {
    await sendWhatsAppMessage(requesterPhone, `I couldn't find match #${rank}. Reply after you get a ranked match list, like "request contact 1".`);
    return true;
  }

  const { freelancer, job } = await loadProfilesForMatch(match);
  const targetRole = requesterRole === 'client' ? 'freelancer' : 'client';
  const targetPhone = targetRole === 'freelancer' ? match.freelancer_phone : match.client_phone;
  const targetProfile = targetRole === 'freelancer' ? freelancer : job;

  if (!targetProfile) {
    await sendWhatsAppMessage(requesterPhone, "I found the match, but couldn't load their profile. Try again in a minute.");
    return true;
  }

  if (contactAllowed(targetProfile)) {
    await sendContactToRequester(requesterPhone, targetRole, targetProfile, 'They allow direct contact');
    return true;
  }

  const existing = await findPendingContactRequest({
    matchId: match.id,
    requesterPhone,
    targetPhone,
  });
  if (existing) {
    await sendWhatsAppMessage(requesterPhone, "I've already asked them for approval. I'll message you here if they say yes.");
    return true;
  }

  const request = await createContactRequest({
    match_id: match.id,
    requester_phone: requesterPhone,
    requester_role: requesterRole,
    target_phone: targetPhone,
    target_role: targetRole,
    status: 'pending',
  });

  if (!request) {
    await sendWhatsAppMessage(requesterPhone, "I couldn't create that contact request right now. Please try again in a bit.");
    return true;
  }

  await sendWhatsAppMessage(targetPhone, approvalPrompt({ request, match, freelancer, job }));
  await sendWhatsAppMessage(
    requesterPhone,
    `I've asked ${profileName(targetProfile, targetRole)} for approval. If they say yes, I'll send you the contact here.`,
  );
  console.log(`[contactRequests] pending request ${request.id}: ${requesterPhone} -> ${targetPhone} (${contextLine(match, freelancer, job)})`);
  return true;
}

export async function handlePendingContactApproval({ phone, messageText }) {
  const decision = parseApprovalDecision(messageText);
  if (decision === null) return false;

  const request = await findLatestPendingContactApproval(phone);
  if (!request) return false;

  const match = await findMatchById(request.match_id);
  if (!match) {
    await updateContactRequestStatus(request.id, 'declined');
    await sendWhatsAppMessage(phone, "I couldn't find that match anymore, so I closed the contact request.");
    return true;
  }

  const { freelancer, job } = await loadProfilesForMatch(match);
  const targetProfile = request.target_role === 'freelancer' ? freelancer : job;
  if (!targetProfile) {
    await updateContactRequestStatus(request.id, 'declined');
    await sendWhatsAppMessage(phone, "I couldn't load your profile for that contact request, so I closed it.");
    await sendWhatsAppMessage(request.requester_phone, 'That contact request could not be completed because the profile is no longer available.');
    return true;
  }

  if (decision === true) {
    await updateContactRequestStatus(request.id, 'approved');
    await sendContactToRequester(request.requester_phone, request.target_role, targetProfile);
    await sendWhatsAppMessage(phone, `Done — I shared your WhatsApp contact for:\n${contextLine(match, freelancer, job)}`);
    return true;
  }

  await updateContactRequestStatus(request.id, 'declined');
  await sendWhatsAppMessage(
    request.requester_phone,
    `${profileName(targetProfile, request.target_role)} declined to share contact info for now.`,
  );
  await sendWhatsAppMessage(phone, 'No problem — I declined that contact request.');
  return true;
}

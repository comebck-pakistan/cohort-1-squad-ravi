"""contact_requests.py - contact privacy requests and approval/decline replies."""
import re

from app.deadline import parse_yes_no_locally
from app.supabase_client import (
    create_contact_request,
    find_freelancer,
    find_job_request,
    find_latest_pending_contact_approval,
    find_match_by_id,
    find_pending_contact_request,
    get_ranked_matches_for_phone,
    update_contact_request_status,
)
from app.whatsapp import send_whatsapp_message


def _clean_phone(phone) -> str:
    return re.sub(r"\D", "", str(phone or ""))


def _whatsapp_link(phone) -> str:
    cleaned = _clean_phone(phone)
    return f"wa.me/{cleaned}" if cleaned else "Not available"


def _short_text(text, fallback: str = "this match") -> str:
    value = str(text or fallback).strip()
    return f"{value[:117]}..." if len(value) > 120 else value


def _contact_allowed(profile: dict | None) -> bool:
    return (profile or {}).get("contact_sharing_allowed") is True


def _profile_name(profile: dict | None, role: str) -> str:
    if role == "freelancer":
        return (profile or {}).get("name") or "the freelancer"
    return (profile or {}).get("name") or "the client"


def _context_line(match: dict, freelancer: dict | None, job: dict | None) -> str:
    project = _short_text((job or {}).get("project_description") or (job or {}).get("brief_description"), "the matched project")
    freelancer_name = (freelancer or {}).get("name") or "Freelancer"
    score = match.get("total_score") if match.get("total_score") is not None else match.get("compatibility_score", "N/A")
    return f"{freelancer_name} <> {project} (Overall {score}%)"


def _parse_rank(text) -> int | None:
    match = re.search(r"(?:^|\s)#?(\d{1,2})(?:\s|$)", str(text or ""))
    if not match:
        return None
    rank = int(match.group(1))
    return rank if rank > 0 else None


def _parse_approval_decision(text) -> bool | None:
    local = parse_yes_no_locally(text)
    if local is not None:
        return local
    t = re.sub(r"[!.]+$", "", str(text or "").strip().lower())
    if t in ("approve", "approved", "allow", "share", "share it", "ok share"):
        return True
    if t in ("decline", "declined", "deny", "reject", "don't share", "do not share"):
        return False
    return None


def parse_contact_request_command(text) -> dict | None:
    t = str(text or "").strip().lower()
    if not t:
        return None
    has_contact_word = bool(re.search(r"\b(contact|whatsapp|phone|number|info)\b", t))
    has_request_intent = bool(re.search(r"\b(request|ask|want|get|send|share)\b", t)) or bool(re.match(r"^contact\s+#?\d+", t))
    if not has_contact_word or not has_request_intent:
        return None
    return {"rank": _parse_rank(t)}


async def _load_profiles_for_match(match: dict) -> tuple[dict | None, dict | None]:
    freelancer = await find_freelancer(match["freelancer_phone"])
    job = await find_job_request(match["client_phone"])
    return freelancer, job


async def _send_contact_to_requester(requester_phone: str, target_role: str, target_profile: dict, prefix: str = "Contact approved") -> None:
    await send_whatsapp_message(
        requester_phone,
        f"{prefix}:\n\n{_profile_name(target_profile, target_role)}\nWhatsApp: {_whatsapp_link(target_profile.get('phone'))}",
    )


def _approval_prompt(request: dict, match: dict, freelancer: dict | None, job: dict | None) -> str:
    score = match.get("total_score") if match.get("total_score") is not None else match.get("compatibility_score", "N/A")
    skill_score = match.get("compatibility_score", "N/A")
    if request["target_role"] == "freelancer":
        return (
            f"A matched client wants your WhatsApp contact.\n\n"
            f"Project: {_short_text((job or {}).get('project_description') or (job or {}).get('brief_description'), 'matched project')}\n"
            f"Client: {(job or {}).get('name') or 'Client'}\n"
            f"Match: Overall {score}%, Skill {skill_score}%\n\n"
            f"Reply YES to share your contact, or NO to decline."
        )

    return (
        f"A matched freelancer wants your WhatsApp contact.\n\n"
        f"Freelancer: {(freelancer or {}).get('name') or 'Freelancer'}\n"
        f"Project: {_short_text((job or {}).get('project_description') or (job or {}).get('brief_description'), 'your project')}\n"
        f"Match: Overall {score}%, Skill {skill_score}%\n\n"
        f"Reply YES to share your contact, or NO to decline."
    )


async def request_contact_for_match_rank(requester_phone: str, requester_role: str | None, rank: int | None) -> bool:
    if not requester_role or requester_role not in ("client", "freelancer"):
        await send_whatsapp_message(
            requester_phone,
            "I couldn't tell whether you're a client or freelancer yet. Finish registration first, then ask for contact info.",
        )
        return True

    if not rank:
        await send_whatsapp_message(requester_phone, "Tell me which match number you want, like: request contact 1")
        return True

    matches = await get_ranked_matches_for_phone(requester_phone, requester_role)
    match = matches[rank - 1] if 0 <= rank - 1 < len(matches) else None
    if not match:
        await send_whatsapp_message(
            requester_phone,
            f'I couldn\'t find match #{rank}. Reply after you get a ranked match list, like "request contact 1".',
        )
        return True

    freelancer, job = await _load_profiles_for_match(match)
    target_role = "freelancer" if requester_role == "client" else "client"
    target_phone = match["freelancer_phone"] if target_role == "freelancer" else match["client_phone"]
    target_profile = freelancer if target_role == "freelancer" else job

    if not target_profile:
        await send_whatsapp_message(requester_phone, "I found the match, but couldn't load their profile. Try again in a minute.")
        return True

    if _contact_allowed(target_profile):
        await _send_contact_to_requester(requester_phone, target_role, target_profile, "They allow direct contact")
        return True

    existing = await find_pending_contact_request(match["id"], requester_phone, target_phone)
    if existing:
        await send_whatsapp_message(requester_phone, "I've already asked them for approval. I'll message you here if they say yes.")
        return True

    request = await create_contact_request({
        "match_id": match["id"],
        "requester_phone": requester_phone,
        "requester_role": requester_role,
        "target_phone": target_phone,
        "target_role": target_role,
        "status": "pending",
    })

    if not request:
        await send_whatsapp_message(requester_phone, "I couldn't create that contact request right now. Please try again in a bit.")
        return True

    await send_whatsapp_message(target_phone, _approval_prompt(request, match, freelancer, job))
    await send_whatsapp_message(
        requester_phone,
        f"I've asked {_profile_name(target_profile, target_role)} for approval. If they say yes, I'll send you the contact here.",
    )
    print(f"[contactRequests] pending request {request['id']}: {requester_phone} -> {target_phone} ({_context_line(match, freelancer, job)})")
    return True


async def handle_pending_contact_approval(phone: str, message_text: str) -> bool:
    decision = _parse_approval_decision(message_text)
    if decision is None:
        return False

    request = await find_latest_pending_contact_approval(phone)
    if not request:
        return False

    match = await find_match_by_id(request["match_id"])
    if not match:
        await update_contact_request_status(request["id"], "declined")
        await send_whatsapp_message(phone, "I couldn't find that match anymore, so I closed the contact request.")
        return True

    freelancer, job = await _load_profiles_for_match(match)
    target_profile = freelancer if request["target_role"] == "freelancer" else job
    if not target_profile:
        await update_contact_request_status(request["id"], "declined")
        await send_whatsapp_message(phone, "I couldn't load your profile for that contact request, so I closed it.")
        await send_whatsapp_message(request["requester_phone"], "That contact request could not be completed because the profile is no longer available.")
        return True

    if decision is True:
        await update_contact_request_status(request["id"], "approved")
        await _send_contact_to_requester(request["requester_phone"], request["target_role"], target_profile)
        await send_whatsapp_message(phone, f"Done — I shared your WhatsApp contact for:\n{_context_line(match, freelancer, job)}")
        return True

    await update_contact_request_status(request["id"], "declined")
    await send_whatsapp_message(
        request["requester_phone"],
        f"{_profile_name(target_profile, request['target_role'])} declined to share contact info for now.",
    )
    await send_whatsapp_message(phone, "No problem — I declined that contact request.")
    return True

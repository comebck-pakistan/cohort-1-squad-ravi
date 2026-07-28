"""match_lifecycle.py - WhatsApp match lifecycle commands, mutual-interest detection, and match feedback."""
import re
from datetime import datetime, timezone

from app.deadline import parse_yes_no_locally
from app.supabase_client import (
    find_freelancer,
    find_job_request,
    find_match_by_id,
    get_pending_contact_requests_for_target,
    get_ranked_matches_for_phone,
    insert_notifications,
    save_conversation,
    update_match_lifecycle,
    upsert_match_feedback,
)
from app.whatsapp import send_whatsapp_message

POSITIVE_STATUSES = {"interested", "shortlisted", "hired", "completed"}
TERMINAL_STATUSES = {"declined", "completed"}
SHOW_FILTER_LABELS = {
    "all": "current matches",
    "accepted": "accepted matches",
    "declined": "declined matches",
    "shortlisted": "shortlisted matches",
    "pending": "pending requests",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _clean_phone(phone) -> str:
    return re.sub(r"\D", "", str(phone or ""))


def _whatsapp_link(phone) -> str:
    cleaned = _clean_phone(phone)
    return f"wa.me/{cleaned}" if cleaned else "Not available"


def _short_text(text, fallback: str = "this match") -> str:
    value = str(text or fallback).strip()
    return f"{value[:117]}..." if len(value) > 120 else value


def _profile_name(profile: dict | None, role: str) -> str:
    if role == "freelancer":
        return (profile or {}).get("name") or "the freelancer"
    return (profile or {}).get("name") or "the client"


def _parse_rank(text) -> int | None:
    match = re.search(r"(?:^|\s)#?(\d{1,2})(?:\s|$)", str(text or ""))
    if not match:
        return None
    rank = int(match.group(1))
    return rank if rank > 0 else None


def _detect_reason(text) -> dict:
    t = str(text or "").strip().lower()
    if not t:
        return {"key": None, "text": None}
    if re.search(r"\bbudget|price|rate|cost|expensive|cheap\b", t):
        return {"key": "budget", "text": t}
    if re.search(r"\bskill|skills|experience|portfolio|quality|fit\b", t):
        return {"key": "skills", "text": t}
    if re.search(r"\btiming|deadline|timeline|availability|available|time\b", t):
        return {"key": "timing", "text": t}
    if re.search(r"\btrust|verify|verified|proof|link|linkedin|github|cv\b", t):
        return {"key": "trust", "text": t}
    if re.search(r"\bcontact|phone|whatsapp|number|private\b", t):
        return {"key": "contact", "text": t}
    if re.search(r"\bother|another|misc\b", t):
        return {"key": "other", "text": t}
    return {"key": "other", "text": t}


_ACTION_WORDS = {
    "decline": re.compile(r"(decline|declined|not interested|pass|reject|skip)", re.I),
    "useful": re.compile(r"(feedback|useful|helpful|good match|bad match|not useful|not helpful)", re.I),
}


def _reason_text_from_command(text, action: str | None) -> str:
    t = str(text or "").strip()
    if not action:
        return ""
    t = _ACTION_WORDS.get(action, re.compile(r"^$")).sub("", t)
    return re.sub(r"#?\d{1,2}", "", t).strip()


def _role_side(role: str) -> tuple[str, str]:
    if role == "freelancer":
        return "freelancer_status", "freelancer_responded_at"
    return "client_status", "client_responded_at"


def _action_to_side_status(action: str, role: str) -> str:
    if action == "interested":
        return "interested"
    if action == "shortlist":
        return "shortlisted"
    if action == "decline":
        return "declined"
    if action == "hire":
        return "hired" if role == "client" else "interested"
    if action == "complete":
        return "completed"
    return "pending"


def _derive_overall_status(next_state: dict) -> str:
    freelancer_status = next_state.get("freelancer_status") or "pending"
    client_status = next_state.get("client_status") or "pending"

    if freelancer_status == "completed" or client_status == "completed":
        return "completed"
    if freelancer_status == "hired" or client_status == "hired":
        return "hired"
    if freelancer_status == "declined" or client_status == "declined":
        return "declined"
    if freelancer_status in POSITIVE_STATUSES and client_status in POSITIVE_STATUSES:
        return "mutual_interest"
    if freelancer_status == "shortlisted" or client_status == "shortlisted":
        return "shortlisted"
    return "matched"


def _status_label(match: dict | None) -> str:
    status = (match or {}).get("status") or "matched"
    return status.replace("_", " ")


def _parse_show_filter(t: str) -> str | None:
    wants_display = (
        bool(re.match(r"^(show|list|display|see)\b", t))
        or bool(re.match(r"^(accepted|declined|shortlisted|pending)$", t))
        or bool(re.search(r"\b(matches|offers|projects|results|requests)\b", t))
    )
    if not wants_display:
        return None

    if re.search(r"\baccepted\b|\binterested\b", t):
        return "accepted"
    if re.search(r"\bdeclined\b|\brejected\b", t):
        return "declined"
    if re.search(r"\bshortlist(?:ed)?\b|\bsaved\b", t):
        return "shortlisted"
    if re.search(r"\bpending\b", t):
        return "pending"
    return None


def _filter_matches_for_view(entries: list[dict], role: str, filter_: str = "all") -> list[dict]:
    if not filter_ or filter_ == "all":
        return entries

    status_field, _ = _role_side(role)
    other_status_field = "client_status" if role == "freelancer" else "freelancer_status"

    def keep(entry: dict) -> bool:
        match = entry["match"]
        status = match.get("status") or "matched"
        my_status = match.get(status_field) or "pending"
        other_status = match.get(other_status_field) or "pending"

        if filter_ == "accepted":
            if status == "declined":
                return False
            return (
                status in ("mutual_interest", "hired", "completed")
                or my_status in ("interested", "hired", "completed")
            )

        if filter_ == "declined":
            return status == "declined" or my_status == "declined" or other_status == "declined"

        if filter_ == "shortlisted":
            if status == "declined":
                return False
            return status == "shortlisted" or my_status == "shortlisted" or other_status == "shortlisted"

        if filter_ == "pending":
            return status not in TERMINAL_STATUSES and status != "hired" and my_status == "pending" and other_status in POSITIVE_STATUSES

        return True

    return [e for e in entries if keep(e)]


def _context_line(match: dict, freelancer: dict | None, job: dict | None, role: str) -> str:
    score = match.get("total_score") if match.get("total_score") is not None else match.get("compatibility_score", "N/A")
    if role == "freelancer":
        return f"{(job or {}).get('name') or 'Client'}: {_short_text((job or {}).get('project_description') or (job or {}).get('brief_description'), 'matched project')} (Overall {score}%)"
    return f"{(freelancer or {}).get('name') or 'Freelancer'} (Overall {score}%, Skill {match.get('compatibility_score', 'N/A')}%)"


def _contact_line(target_profile: dict | None, target_role: str, request_rank: int | None) -> str:
    if (target_profile or {}).get("contact_sharing_allowed") is True:
        return f"{_profile_name(target_profile, target_role)} WhatsApp: {_whatsapp_link(target_profile.get('phone'))}"
    if request_rank:
        return f'{_profile_name(target_profile, target_role)} keeps contact private. Reply "request contact {request_rank}" and I\'ll ask them first.'
    return f'{_profile_name(target_profile, target_role)} keeps contact private. Reply "show my matches" to get the request command.'


async def _load_profiles_for_match(match: dict) -> tuple[dict | None, dict | None]:
    freelancer = await find_freelancer(match["freelancer_phone"])
    job = await find_job_request(match["client_phone"])
    return freelancer, job


async def _rank_for_match(phone: str, role: str, match_id) -> int | None:
    matches = await get_ranked_matches_for_phone(phone, role)
    for index, m in enumerate(matches):
        if str(m.get("id")) == str(match_id):
            return index + 1
    return None


async def _set_pending_feedback(phone: str, conversation: dict | None, role: str, match_id, kind: str, rank: int | None) -> None:
    temp_data = {
        **((conversation or {}).get("temp_data") or {}),
        "pending_match_feedback": {"match_id": match_id, "role": role, "kind": kind, "rank": rank},
    }
    await save_conversation(
        (conversation or {}).get("id"),
        phone,
        (conversation or {}).get("role") or role,
        (conversation or {}).get("step") or "completed",
        temp_data,
    )


async def _clear_pending_feedback(phone: str, conversation: dict | None, role: str) -> None:
    temp_data = {**((conversation or {}).get("temp_data") or {})}
    temp_data.pop("pending_match_feedback", None)
    await save_conversation(
        (conversation or {}).get("id"),
        phone,
        (conversation or {}).get("role") or role,
        (conversation or {}).get("step") or "completed",
        temp_data,
    )


def _parse_feedback_command(text) -> dict | None:
    t = str(text or "").strip().lower()
    if not t:
        return None

    if not re.search(r"\b(useful|helpful|good match|bad match|not useful|not helpful|feedback)\b", t):
        return None

    useful = None
    if re.search(r"\bnot useful|not helpful|bad match|no|nope|nah|nahi\b", t):
        useful = False
    if re.search(r"\bgood match|helpful|yes|yeah|yep|haan|ji|bilkul\b", t) and useful is None:
        useful = True

    rank = _parse_rank(t)
    reason = _detect_reason(_reason_text_from_command(text, "useful"))
    return {"action": "feedback", "rank": rank, "useful": useful, "reason_key": reason["key"], "reason_text": reason["text"]}


def parse_match_lifecycle_command(text) -> dict | None:
    t = str(text or "").strip().lower()
    if not t:
        return None

    feedback = _parse_feedback_command(text)
    if feedback:
        return feedback

    show_filter = _parse_show_filter(t)
    if show_filter:
        return {"action": "show", "filter": show_filter}

    if re.match(r"^(show\s+)?(my\s+)?matches\b", t) or re.match(r"^(match|matches|status|show status)$", t):
        return {"action": "show", "filter": "all"}

    rank = _parse_rank(t)
    if re.search(r"\b(mark\s+)?complete(d)?\b|\bfinish(ed)?\b|\bdone with\b", t):
        return {"action": "complete", "rank": rank}
    if re.search(r"\bhire(d)?\b|\bstart(ed)?\b", t):
        return {"action": "hire", "rank": rank}
    if re.search(r"\bshortlist(ed)?\b|\bsave(d)?\b", t):
        return {"action": "shortlist", "rank": rank}
    if re.search(r"\bdecline(d)?\b|\bnot interested\b|\bpass\b|\breject\b", t):
        reason = _detect_reason(_reason_text_from_command(text, "decline"))
        return {"action": "decline", "rank": rank, "reason_key": reason["key"], "reason_text": reason["text"]}
    if re.search(r"\binterested\b|\baccept(ed)?\b|\bi'?m in\b|\bapply\b|\blet'?s do\b", t):
        return {"action": "interested", "rank": rank}

    return None


async def _pick_match_for_command(phone: str, role: str, command: dict) -> dict:
    matches = await get_ranked_matches_for_phone(phone, role)
    if not matches:
        return {"match": None, "rank": None, "count": 0}

    if command.get("rank"):
        rank = command["rank"]
        match = matches[rank - 1] if 0 <= rank - 1 < len(matches) else None
        return {"match": match, "rank": rank, "count": len(matches)}

    status_field, _ = _role_side(role)
    actionable = [m for m in matches if (m.get(status_field) or "pending") not in TERMINAL_STATUSES]
    if len(actionable) == 1:
        rank = next(i for i, m in enumerate(matches) if str(m["id"]) == str(actionable[0]["id"])) + 1
        return {"match": actionable[0], "rank": rank, "count": len(matches)}

    return {"match": None, "rank": None, "count": len(matches)}


async def _send_match_summary(phone: str, role: str, filter_: str = "all") -> bool:
    matches = await get_ranked_matches_for_phone(phone, role)
    pending_contact_requests = await get_pending_contact_requests_for_target(phone) if filter_ == "pending" else []
    if not matches and not pending_contact_requests:
        await send_whatsapp_message(phone, "You don't have active matches yet. I'll message you when a strong one appears.")
        return True

    pending_contact_lines = []
    for i, request in enumerate(pending_contact_requests):
        match = await find_match_by_id(request["match_id"])
        if not match:
            continue
        freelancer, job = await _load_profiles_for_match(match)
        requester_role = request["requester_role"]
        requester_profile = freelancer if requester_role == "freelancer" else job
        pending_contact_lines.append(
            f"Contact request {i + 1}. {_profile_name(requester_profile, requester_role)} wants your WhatsApp contact.\n"
            f"   {_context_line(match, freelancer, job, role)}\n"
            "   Reply YES to approve the latest contact request, or NO to decline."
        )

    if not matches and pending_contact_lines:
        pending_text = "\n\n".join(pending_contact_lines)
        await send_whatsapp_message(phone, f"Here are your pending requests:\n\n{pending_text}")
        return True

    ranked_entries = [{"match": m, "rank": i + 1} for i, m in enumerate(matches)]
    filtered_entries = _filter_matches_for_view(ranked_entries, role, filter_)
    if not filtered_entries and not pending_contact_lines:
        label = SHOW_FILTER_LABELS.get(filter_, "matches in that category")
        await send_whatsapp_message(phone, f'No {label} yet. Reply "show my matches" to see everything.')
        return True

    top = filtered_entries[:5]
    lines = []
    for entry in top:
        match, rank = entry["match"], entry["rank"]
        freelancer, job = await _load_profiles_for_match(match)
        side_status = match.get("freelancer_status") if role == "freelancer" else match.get("client_status")
        other_profile = job if role == "freelancer" else freelancer
        other_role = "client" if role == "freelancer" else "freelancer"
        lines.append(
            f"{rank}. {_context_line(match, freelancer, job, role)}\n"
            f"   Status: {_status_label(match)} · Your side: {side_status or 'pending'}\n"
            f"   {_contact_line(other_profile, other_role, rank)}"
        )

    commands = (
        'Reply "interested 1", "decline 1", "completed 1", "request contact 1", or "useful 1 yes/no".'
        if role == "freelancer"
        else 'Reply "shortlist 1", "hire 1", "decline 1", "completed 1", "request contact 1", or "useful 1 yes/no".'
    )
    title = SHOW_FILTER_LABELS.get(filter_, SHOW_FILTER_LABELS["all"])
    extra = (
        'You can also reply "show accepted", "show declined", "show shortlisted", or "show pending".'
        if filter_ == "all"
        else 'Reply "show my matches" to see everything.'
    )
    sections = []
    if pending_contact_lines:
        sections.append("\n\n".join(pending_contact_lines))
    if lines:
        sections.append("\n\n".join(lines))
    command_hint = f"\n\n{commands}" if lines else ""
    sections_text = "\n\n".join(sections)
    await send_whatsapp_message(phone, f"Here are your {title}:\n\n{sections_text}{command_hint}\n{extra}")
    return True


async def _send_mutual_interest_messages(match: dict, freelancer: dict, job: dict) -> None:
    client_rank = await _rank_for_match(job["phone"], "client", match["id"])
    freelancer_rank = await _rank_for_match(freelancer["phone"], "freelancer", match["id"])

    await send_whatsapp_message(
        job["phone"],
        (
            f"Mutual interest confirmed for {freelancer.get('name') or 'this freelancer'}.\n\n"
            f"{_contact_line(freelancer, 'freelancer', client_rank)}\n\n"
            f"Reply \"hire {client_rank or ''}\" when you decide to move forward."
        ).strip(),
    )
    await send_whatsapp_message(
        freelancer["phone"],
        (
            f"Mutual interest confirmed for {job.get('name') or 'this client'}'s project.\n\n"
            f"{_contact_line(job, 'client', freelancer_rank)}\n\n"
            f"Reply \"completed {freelancer_rank or ''}\" when the work is done."
        ).strip(),
    )


_ACTION_TITLES = {
    "interested": "Match marked interested",
    "shortlist": "Match shortlisted",
    "decline": "Match declined",
    "hire": "Match marked hired",
    "complete": "Match marked completed",
}


async def _write_lifecycle_notifications(actor_role: str, action: str, match: dict, freelancer: dict | None, job: dict | None) -> None:
    actor_name = (freelancer or {}).get("name") or "A freelancer" if actor_role == "freelancer" else (job or {}).get("name") or "A client"
    target_phone = match["client_phone"] if actor_role == "freelancer" else match["freelancer_phone"]
    await insert_notifications([{
        "phone": target_phone,
        "type": "match_status",
        "title": _ACTION_TITLES.get(action, "Match updated"),
        "body": f"{actor_name} updated a match: {_status_label(match)}.",
    }])


async def _record_feedback(phone: str, role: str, match_id, useful: bool | None, reason_key: str | None, reason_text: str | None) -> None:
    await upsert_match_feedback({
        "match_id": match_id,
        "phone": phone,
        "role": role,
        "useful": useful,
        "reason_key": reason_key,
        "reason_text": reason_text,
    })


async def handle_pending_match_feedback(phone: str, conversation: dict | None, message_text: str) -> bool:
    pending = (conversation or {}).get("temp_data", {}).get("pending_match_feedback") if conversation else None
    if not pending or not pending.get("match_id"):
        return False

    role = pending.get("role") or (conversation or {}).get("role")
    match = await find_match_by_id(pending["match_id"])
    if not match:
        await _clear_pending_feedback(phone, conversation, role)
        await send_whatsapp_message(phone, "I couldn't find that match anymore, so I cleared the feedback prompt.")
        return True

    if pending.get("kind") == "useful":
        useful = parse_yes_no_locally(message_text)
        if useful is None:
            await send_whatsapp_message(phone, "Just a quick yes or no — was that match useful?")
            return True
        await _record_feedback(phone, role, match["id"], useful, None, None)
        await _clear_pending_feedback(phone, conversation, role)
        await send_whatsapp_message(phone, "Thanks — I'll use that to improve future rankings.")
        return True

    reason = _detect_reason(message_text)
    await _record_feedback(phone, role, match["id"], False, reason["key"] or "other", reason["text"])
    await _clear_pending_feedback(phone, conversation, role)
    await send_whatsapp_message(phone, "Got it — thanks. I'll factor that into future matches.")
    return True


async def handle_match_lifecycle_command(phone: str, role: str | None, conversation: dict | None, command: dict) -> bool:
    if not role or role not in ("client", "freelancer"):
        await send_whatsapp_message(phone, "Finish registration first, then I can manage your matches here.")
        return True

    if command["action"] == "show":
        return await _send_match_summary(phone, role, command.get("filter") or "all")

    if command["action"] == "feedback":
        picked = await _pick_match_for_command(phone, role, command)
        match, rank, count = picked["match"], picked["rank"], picked["count"]
        if not match:
            await send_whatsapp_message(
                phone,
                "Which match is this feedback for? Try: useful 1 yes"
                if count > 1
                else 'I couldn\'t find that match. Reply "show my matches" to see the latest list.',
            )
            return True

        if command.get("useful") is None:
            await _set_pending_feedback(phone, conversation, role, match["id"], "useful", rank)
            await send_whatsapp_message(phone, f"Was match #{rank} useful? Reply yes or no.")
            return True

        await _record_feedback(phone, role, match["id"], command["useful"], command.get("reason_key"), command.get("reason_text"))
        await send_whatsapp_message(phone, "Thanks — I'll use that to improve future rankings.")
        return True

    effective_action = "interested" if command["action"] == "hire" and role == "freelancer" else command["action"]
    picked = await _pick_match_for_command(phone, role, command)
    match, rank, count = picked["match"], picked["rank"], picked["count"]
    if not match:
        await send_whatsapp_message(
            phone,
            f'Which match do you mean? Reply with the number, like "{command["action"]} 1", or say "show my matches".'
            if count > 1
            else 'I couldn\'t find that match. Reply "show my matches" to see your current matches.',
        )
        return True

    freelancer, job = await _load_profiles_for_match(match)
    if not freelancer or not job:
        await send_whatsapp_message(phone, "I found the match, but couldn't load both profiles. Try again in a minute.")
        return True

    status_field, time_field = _role_side(role)
    side_status = _action_to_side_status(effective_action, role)
    patch = {status_field: side_status, time_field: _now_iso()}
    if effective_action == "hire":
        patch["hired_at"] = _now_iso()
    if effective_action == "complete":
        patch["completed_at"] = _now_iso()
    patch["status"] = _derive_overall_status({**match, **patch})

    updated = await update_match_lifecycle(match["id"], patch)
    if not updated:
        await send_whatsapp_message(phone, "I couldn't update that match right now. Please try again in a bit.")
        return True

    await _write_lifecycle_notifications(role, effective_action, updated, freelancer, job)

    other_phone = match["client_phone"] if role == "freelancer" else match["freelancer_phone"]
    actor_name = freelancer.get("name") or "The freelancer" if role == "freelancer" else job.get("name") or "The client"
    other_rank = await _rank_for_match(other_phone, "client" if role == "freelancer" else "freelancer", match["id"])

    if effective_action == "decline":
        await send_whatsapp_message(other_phone, f"{actor_name} declined this match for now.")
        if command.get("reason_key"):
            await _record_feedback(phone, role, match["id"], False, command["reason_key"], command.get("reason_text"))
            await send_whatsapp_message(phone, f"No problem — I marked match #{rank} declined and saved the feedback.")
        else:
            await _set_pending_feedback(phone, conversation, role, match["id"], "decline_reason", rank)
            await send_whatsapp_message(
                phone,
                f"No problem — I marked match #{rank} declined. What was the main reason? budget / skills / timing / trust / contact / other",
            )
        return True

    action_labels = {"interested": "interested", "shortlist": "shortlisted", "hire": "hired", "complete": "completed"}
    await send_whatsapp_message(
        phone,
        f"Done — match #{rank} is marked {action_labels.get(effective_action, side_status)}. "
        f'You can also reply "useful {rank} yes/no" after reviewing the match.',
    )

    other_rank_hint = f' Reply "show my matches" or update it with match #{other_rank}.' if other_rank else ""
    await send_whatsapp_message(
        other_phone,
        f"{actor_name} marked your match as {action_labels.get(effective_action, side_status)}.{other_rank_hint}",
    )

    became_mutual = updated["status"] == "mutual_interest" and match.get("status") != "mutual_interest"
    if became_mutual or effective_action == "hire":
        await _send_mutual_interest_messages(updated, freelancer, job)

    return True

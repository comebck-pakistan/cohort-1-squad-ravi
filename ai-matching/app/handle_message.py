"""handle_message.py - the whole conversation flow / step machine.

This is an ordered pipeline - each numbered section either returns (handling
the message fully) or falls through to the next. The order matters and
mirrors the Node implementation section-for-section; see that file's comments
for why each guard exists.
"""
import asyncio
import json

from app.supabase_client import (
    find_conversation,
    find_freelancer,
    save_conversation,
    save_freelancer_profile,
    save_job_request,
    reset_user,
    update_freelancer_field,
    update_job_request_field,
    delete_matches_for_phone,
)
from app.groq_client import extract_conversation_data
from app.replies import (
    pick_reply_text,
    pick_post_completion_reply,
    get_already_registered_reply,
    get_reset_reply,
    is_skip_message,
    pick_edit_vague_reply,
    pick_edit_confirm_reply,
    pick_edit_success_reply,
    pick_preferences_reply,
)
from app.whatsapp import send_whatsapp_message
from app.deadline import is_ack_only, parse_deadline_locally, parse_yes_no_locally, ensure_deadline_normalized
from app.matching import run_matching_for_client, run_matching_for_freelancer
from app.vetting import classify_link_field, extract_first_url, revet_artifact, run_vetting_for_freelancer
from app.contact_requests import (
    handle_pending_contact_approval,
    parse_contact_request_command,
    request_contact_for_match_rank,
)
from app.match_lifecycle import (
    handle_match_lifecycle_command,
    handle_pending_match_feedback,
    parse_match_lifecycle_command,
)

RESET_PHRASES = ["reset ai", "reset bot"]

# -- Hiring/Working status flags ----------------------------------------------
# Boolean fields answered with yes/no. Only users with a True flag take part
# in matching; flipping to "no" removes their matches, flipping to "yes"
# re-runs matching for them.
YESNO_STEPS = {
    "collect_hiring_status": {"field": "hiring_currently", "next": "collect_contact_sharing"},
    "collect_working_status": {"field": "working_currently", "next": "collect_contact_sharing"},
    "collect_contact_sharing": {
        "field": "contact_sharing_allowed",
        "next_by_role": {
            "client": "collect_client_brief_desc",
            "freelancer": "collect_freelancer_brief_desc",
        },
    },
}
BOOLEAN_FIELDS = {"hiring_currently", "working_currently", "contact_sharing_allowed"}
MATCH_STATUS_FIELDS = {"hiring_currently", "working_currently"}
FLAG_QUESTIONS = {
    "hiring_currently": "are you currently hiring?",
    "working_currently": "are you currently open to work?",
    "contact_sharing_allowed": "can matched people see your WhatsApp contact directly?",
}
LINK_STEPS = {
    "collect_profile_link": {"field": "linkedin_url", "next": "collect_github"},  # legacy alias
    "collect_linkedin": {"field": "linkedin_url", "next": "collect_github"},
    "collect_github": {"field": "github_url", "next": "collect_cv"},
    "collect_cv": {"field": "cv_url", "next": "collect_support_docs"},
    "collect_support_docs": {"field": "support_docs", "next": "collect_portfolio"},
    "collect_portfolio": {"field": "portfolio", "next": "collect_skills"},
}
LINK_FIELDS = {"linkedin_url", "github_url", "cv_url", "support_docs", "portfolio"}


def _canonical_link_field(field):
    return "linkedin_url" if field == "profile_link" else field


def _format_field_value(value):
    if value is True:
        return "yes"
    if value is False:
        return "no"
    return value


async def _apply_flag_side_effects(phone: str, field: str, value) -> None:
    try:
        if value is False:
            await delete_matches_for_phone(phone)
            return
        if field == "working_currently":
            await run_matching_for_freelancer(phone)
        else:
            await run_matching_for_client(phone)
    except Exception as err:
        print(f"[handleMessage] Flag side effects failed for {field}={value}, {phone}: {err}")


def _next_step_for_yes_no(step_config: dict, role: str | None) -> str:
    if "next_by_role" in step_config:
        return step_config["next_by_role"].get(role) or "welcome"
    return step_config["next"]


async def _apply_link_side_effects(phone: str, field: str) -> None:
    if field not in LINK_FIELDS:
        return
    try:
        await revet_artifact(phone, field)
    except Exception as err:
        print(f"[handleMessage] Link re-vet failed for {field}, {phone}: {err}")


def _pending_broken_artifact(freelancer: dict | None) -> str | None:
    broken = ((freelancer or {}).get("trust_breakdown") or {}).get("broken_links") or []
    unique_artifacts = list({item["artifact"] for item in broken if item.get("artifact") in LINK_FIELDS})
    return unique_artifacts[0] if len(unique_artifacts) == 1 else None


async def handle_incoming_message(phone: str, message_text: str) -> None:
    # Artificial delay to ensure "typing..." indicator is visible even on fast paths
    await asyncio.sleep(0.8)

    lower_text = (message_text or "").lower()

    conversation, freelancer = await asyncio.gather(
        find_conversation(phone),
        find_freelancer(phone),
    )

    # --- 1. RESET ---
    if any(phrase in lower_text for phrase in RESET_PHRASES):
        await reset_user(phone)
        await send_whatsapp_message(phone, get_reset_reply())
        return

    # --- 1a. CONTACT REQUEST APPROVAL / REQUEST COMMANDS (local - NO Groq call) ---
    if await handle_pending_contact_approval(phone, message_text):
        return

    if await handle_pending_match_feedback(phone, conversation, message_text):
        return

    contact_command = parse_contact_request_command(message_text)
    if contact_command:
        requester_role = "freelancer" if freelancer else (conversation or {}).get("role")
        await request_contact_for_match_rank(phone, requester_role, contact_command["rank"])
        return

    match_lifecycle_command = parse_match_lifecycle_command(message_text)
    if match_lifecycle_command and (freelancer or (conversation or {}).get("step") == "completed"):
        role = "freelancer" if freelancer else (conversation or {}).get("role")
        await handle_match_lifecycle_command(phone, role, conversation, match_lifecycle_command)
        return

    # --- 1b. COMPLETED FREELANCER LINK RE-VET FAST-PATH ---
    # A completed freelancer can resend just one broken proof link. We classify
    # locally and re-check only that artifact - no Groq call.
    incoming_url = extract_first_url(message_text)
    if (conversation or {}).get("step") == "completed" and freelancer and incoming_url:
        field = _canonical_link_field(classify_link_field(incoming_url) or _pending_broken_artifact(freelancer))
        if field and field in LINK_FIELDS:
            await update_freelancer_field(phone, field, incoming_url)
            await send_whatsapp_message(phone, f"Got it — re-checking your {field.replace('_', ' ')} now.")
            await _apply_link_side_effects(phone, field)
            return

    # --- 2. ACTIVE EDITING STATE ---
    editing_field_raw = (conversation or {}).get("temp_data", {}).get("editing_field") if conversation else None
    if editing_field_raw:
        editing_field = _canonical_link_field(editing_field_raw)

        if editing_field == "vague":
            ai_result = await extract_conversation_data(
                conversation["step"], conversation["role"], conversation["temp_data"], message_text
            )

            if (ai_result.get("edit_request") or {}).get("target_field"):
                new_temp_data = {**conversation["temp_data"], "editing_field": ai_result["edit_request"]["target_field"]}
                await save_conversation(conversation["id"], phone, conversation["role"], conversation["step"], new_temp_data)
                await send_whatsapp_message(phone, pick_edit_confirm_reply(ai_result["edit_request"]["target_field"]))
                return
            else:
                await send_whatsapp_message(
                    phone,
                    "I didn't quite catch which field you want to edit. Please reply with the name of the field (e.g. 'rate', 'portfolio', 'name').",
                )
                return
        else:
            # Receiving the new value for the active editingField
            new_value = message_text.strip()

            # Flag fields are booleans - coerce a yes/no answer, and re-ask instead
            # of storing free text when the answer isn't a clear yes or no.
            if editing_field in BOOLEAN_FIELDS:
                parsed = parse_yes_no_locally(new_value)
                if parsed is None:
                    await send_whatsapp_message(phone, f"Just a quick yes or no — {FLAG_QUESTIONS[editing_field]}")
                    return
                new_value = parsed
            if editing_field in LINK_FIELDS:
                new_value = None if is_skip_message(message_text) else (extract_first_url(message_text) or new_value)

            new_temp_data = {**conversation["temp_data"]}
            new_temp_data[editing_field] = new_value

            resume_step = new_temp_data.get("resume_step") or conversation["step"]
            new_temp_data.pop("editing_field", None)
            new_temp_data.pop("resume_step", None)

            await save_conversation(conversation["id"], phone, conversation["role"], resume_step, new_temp_data)

            if freelancer:
                await update_freelancer_field(phone, editing_field, new_value)
            elif conversation["role"] == "client":
                await update_job_request_field(phone, editing_field, new_value)

            await send_whatsapp_message(phone, pick_edit_success_reply(editing_field, _format_field_value(new_value)))
            if editing_field in MATCH_STATUS_FIELDS:
                await _apply_flag_side_effects(phone, editing_field, new_value)
            if freelancer and editing_field in LINK_FIELDS:
                await _apply_link_side_effects(phone, editing_field)
            return

    # --- 3. ACK-WORD SHORT-CIRCUIT ---
    # For post-brief-desc and completed steps, a bare ack re-sends the current
    # question (or post-completion reply) without spending a Groq call.
    post_deadline_steps = {"collect_client_brief_desc", "collect_freelancer_brief_desc", "completed"}
    conv_step = (conversation or {}).get("step")
    if is_ack_only(message_text) and conv_step in post_deadline_steps:
        if conversation["step"] == "completed":
            await send_whatsapp_message(phone, pick_post_completion_reply())
        else:
            await send_whatsapp_message(phone, pick_reply_text(conversation["step"])["text"])
        return

    # --- 4. DEADLINE FAST-PATH (local parser - NO Groq call) ---
    # If the current step is collect_deadline and the local regex parser is
    # confident, we advance the state immediately without spending an API call.
    ai_result = None
    if conv_step == "collect_deadline" and not is_ack_only(message_text):
        local_result = parse_deadline_locally(message_text)
        if local_result["confidence"] == "high":
            # Build a synthetic ai_result that looks identical to what Groq would return
            ai_result = {
                "role": conversation["role"],
                "next_step": "collect_hiring_status",
                "extracted_data": {
                    **(conversation.get("temp_data") or {}),
                    "deadline": local_result["deadline_normalized"],
                    "deadline_raw": local_result["deadline_raw"],
                    "is_recurring": local_result["is_recurring"],
                },
                "edit_request": {"is_edit": False, "target_field": None, "provided_value": None},
            }
            # Skip all Groq & edit-request logic - go straight to save + reply
            await save_conversation(
                (conversation or {}).get("id"), phone, ai_result["role"], ai_result["next_step"], ai_result["extracted_data"]
            )
            await send_whatsapp_message(phone, pick_reply_text(ai_result["next_step"])["text"])
            return
        # confidence == 'low' -> fall through to Groq below

    # --- 4b. HIRING/WORKING/CONTACT-SHARING STATUS FAST-PATH (local parser - NO Groq call) ---
    # A clear yes/no at these steps sets the boolean flag and advances without
    # an API call. Ambiguous answers fall through to Groq, whose prompt re-asks.
    if conv_step in YESNO_STEPS:
        parsed = parse_yes_no_locally(message_text)
        if parsed is not None:
            step_config = YESNO_STEPS[conv_step]
            field = step_config["field"]
            next_step = _next_step_for_yes_no(step_config, conversation["role"])
            await save_conversation(
                conversation["id"], phone, conversation["role"], next_step,
                {**(conversation.get("temp_data") or {}), field: parsed},
            )
            await send_whatsapp_message(phone, pick_reply_text(next_step)["text"])
            return

    # --- 5. LINK FAST-PATH (local parser - NO Groq call) ---
    if conversation and conv_step in LINK_STEPS:
        step_config = LINK_STEPS[conv_step]
        field, next_step = step_config["field"], step_config["next"]
        url = extract_first_url(message_text)
        if url or is_skip_message(message_text):
            temp_data = {**(conversation.get("temp_data") or {}), field: url or None}
            await save_conversation(conversation["id"], phone, conversation["role"], next_step, temp_data)
            await send_whatsapp_message(phone, pick_reply_text(next_step)["text"])
            return

    # --- 6. NORMAL GROQ EXTRACTION (one call, same as before) ---
    ai_result = await extract_conversation_data(
        (conversation or {}).get("step"), (conversation or {}).get("role"), (conversation or {}).get("temp_data"), message_text
    )

    # Suppress edit intent for pure acknowledgement messages
    if is_ack_only(message_text) and ai_result.get("edit_request"):
        ai_result["edit_request"]["is_edit"] = False

    # -- PURE DATA COLLECTION GUARD --------------------------------------------
    # The brief_desc and collect_project steps collect free-form text that may
    # contain words like "edit", "change", "update" - these are part of the
    # user's answer, NOT edit requests for a previous field. Force is_edit=False
    # here as a code-level safety net regardless of what Groq returned.
    pure_data_steps = {"collect_client_brief_desc", "collect_freelancer_brief_desc", "collect_project"}
    if conv_step in pure_data_steps and ai_result.get("edit_request"):
        ai_result["edit_request"]["is_edit"] = False

    # Post-Groq deadline guard: if Groq still didn't advance (unusual phrasing
    # that passed local check with low confidence), force advancement using the
    # raw message as the deadline value.
    if conv_step == "collect_deadline" and ai_result["next_step"] == "collect_deadline":
        ai_result["next_step"] = "collect_hiring_status"
        ai_result["extracted_data"] = {
            **(ai_result.get("extracted_data") or {}),
            "deadline": (ai_result.get("extracted_data") or {}).get("deadline") or message_text.strip(),
        }
        if ai_result.get("edit_request"):
            ai_result["edit_request"]["is_edit"] = False

    # Ensure deadline_normalized is never null when deadline_raw has a value.
    # Runs on every Groq response - cheap (no API call), idempotent.
    if conv_step == "collect_deadline" or (ai_result.get("extracted_data") or {}).get("deadline_raw"):
        ensure_deadline_normalized(ai_result.get("extracted_data"))

    # --- 7. NEW EDIT REQUEST ---
    if (ai_result.get("edit_request") or {}).get("is_edit"):
        field = _canonical_link_field(ai_result["edit_request"]["target_field"])
        value = ai_result["edit_request"]["provided_value"]
        current_step = conv_step or ai_result["next_step"]

        # Flag fields are booleans - coerce a provided yes/no value. If it isn't a
        # clear yes/no, null it out so the ask-for-value branch below takes over.
        if field and field in BOOLEAN_FIELDS and value is not None and not isinstance(value, bool):
            value = parse_yes_no_locally(str(value))

        if field and (value or value is False):
            if field in LINK_FIELDS:
                value = None if is_skip_message(str(value)) else (extract_first_url(str(value)) or value)
            # Direct update - merge with existing temp_data to avoid losing fields
            new_temp_data = {**((conversation or {}).get("temp_data") or {}), **(ai_result.get("extracted_data") or {})}
            new_temp_data[field] = value

            await save_conversation((conversation or {}).get("id"), phone, ai_result["role"], current_step, new_temp_data)

            if freelancer:
                await update_freelancer_field(phone, field, value)
            elif ((conversation or {}).get("role") or ai_result["role"]) == "client":
                await update_job_request_field(phone, field, value)

            await send_whatsapp_message(phone, pick_edit_success_reply(field, _format_field_value(value)))
            if field in MATCH_STATUS_FIELDS:
                await _apply_flag_side_effects(phone, field, value)
            if freelancer and field in LINK_FIELDS:
                await _apply_link_side_effects(phone, field)
            return
        elif field:
            # Specific field, ask for value - merge with existing temp_data
            new_temp_data = {
                **((conversation or {}).get("temp_data") or {}),
                **(ai_result.get("extracted_data") or {}),
                "editing_field": field,
                "resume_step": current_step,
            }
            await save_conversation((conversation or {}).get("id"), phone, ai_result["role"], current_step, new_temp_data)
            await send_whatsapp_message(phone, pick_edit_confirm_reply(field))
            return
        else:
            # Vague edit intent - merge with existing temp_data
            new_temp_data = {
                **((conversation or {}).get("temp_data") or {}),
                **(ai_result.get("extracted_data") or {}),
                "editing_field": "vague",
                "resume_step": current_step,
            }
            await save_conversation((conversation or {}).get("id"), phone, ai_result["role"], current_step, new_temp_data)

            existing_data = freelancer or new_temp_data
            clean_data = {
                k: v for k, v in existing_data.items()
                if k not in ("id", "phone", "created_at", "updated_at", "editing_field", "resume_step")
            }

            await send_whatsapp_message(phone, pick_edit_vague_reply(clean_data))
            return

    # --- 6 (sic, matches Node's duplicate label). ALREADY COMPLETED CHECK ---
    # If no edit request and they are completed, ignore the message and send the fallback reply
    if freelancer:
        await send_whatsapp_message(phone, get_already_registered_reply())
        return
    if conversation and conversation["step"] == "completed":
        await send_whatsapp_message(phone, pick_post_completion_reply())
        return

    # --- 8. NORMAL ONBOARDING PROGRESSION ---
    # CRITICAL: merge extracted_data INTO existing temp_data so that fields Groq
    # fails to echo back are never silently lost. New keys overwrite, but old
    # keys that Groq omitted are preserved.
    merged_temp_data = {**((conversation or {}).get("temp_data") or {}), **ai_result["extracted_data"]}

    print(
        f"[handleMessage] MERGE temp_data (step {conv_step} -> {ai_result['next_step']}):\n"
        f"  existing: {json.dumps((conversation or {}).get('temp_data') or {})}\n"
        f"  extracted: {json.dumps(ai_result['extracted_data'])}\n"
        f"  merged: {json.dumps(merged_temp_data)}"
    )

    await save_conversation((conversation or {}).get("id"), phone, ai_result["role"], ai_result["next_step"], merged_temp_data)

    completed_role = None
    if ai_result["next_step"] == "completed":
        # ai_result['role'] can be None on the final brief_desc step because Groq
        # doesn't always re-emit it. Fall back to the role stored in the
        # conversation row, which was set definitively when the user first
        # identified themselves.
        effective_role = ai_result["role"] or (conversation or {}).get("role")

        print(f"[handleMessage] Completion reached — effectiveRole={effective_role}, phone={phone}")

        if effective_role == "freelancer":
            await save_freelancer_profile(phone, merged_temp_data)
            completed_role = "freelancer"
        elif effective_role == "client":
            await save_job_request(phone, merged_temp_data)
            completed_role = "client"
        else:
            print(
                f"[handleMessage] Completion reached but role is unknown — no permanent row written. "
                f"aiResult.role: {ai_result['role']}, conversation.role: {(conversation or {}).get('role')}"
            )

    # Use the niche-aware picker for collect_preferences, generic picker for everything else
    reply_text = (
        pick_preferences_reply(merged_temp_data)
        if ai_result["next_step"] == "collect_preferences"
        else pick_reply_text(ai_result["next_step"])["text"]
    )
    await send_whatsapp_message(phone, reply_text)

    # Matching runs AFTER the completion reply so "All done! 🎉" arrives before
    # the match results. A matching failure must never surface to the user -
    # their profile is already saved at this point.
    if completed_role:
        if completed_role == "freelancer":
            try:
                await run_vetting_for_freelancer(phone)
            except Exception as err:
                print(f"[handleMessage] Vetting failed for freelancer {phone}: {err}")

        try:
            if completed_role == "client":
                await run_matching_for_client(phone)
            else:
                await run_matching_for_freelancer(phone)
        except Exception as err:
            print(f"[handleMessage] Matching failed for {completed_role} {phone}: {err}")

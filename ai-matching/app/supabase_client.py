"""supabase_client.py - all Supabase reads/writes (search, upsert, create, delete).

Every helper mirrors its Node/supabase-js counterpart 1:1, including the "log
and return a safe default, never raise" convention - a failed read returns
None/[] and a failed write just logs, so a DB hiccup never crashes the
conversation pipeline.

Note: supabase-py's `.execute()` RAISES `postgrest.exceptions.APIError` on a
non-2xx response (unlike supabase-js, which returns {data, error}), so every
call site here is wrapped in try/except to restore that same safe-return
behavior. Also, this postgrest-py version's `.select()` chained after
`.update()`/`.insert()` does not expose `.single()`, so single-row lookups use
`.limit(1)` + `data[0] if data else None` instead - functionally equivalent,
and arguably safer since it never raises when zero rows match.
"""
import asyncio
from datetime import datetime, timezone

from postgrest.exceptions import APIError
from supabase import acreate_client
from supabase._async.client import AsyncClient

from app.config import config

_client: AsyncClient | None = None
_client_lock = asyncio.Lock()


async def get_client() -> AsyncClient:
    global _client
    if _client is None:
        async with _client_lock:
            if _client is None:
                _client = await acreate_client(config.supabase.url, config.supabase.service_role_key)
    return _client


def _now_iso() -> str:
    """Millisecond-precision UTC ISO timestamp with a 'Z' suffix, matching the
    shape of JS's `new Date().toISOString()`."""
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


# -- Equivalent of "Search Conversations" node --------------------------------
async def find_conversation(phone: str) -> dict | None:
    """Returns the most recent conversation row for a phone number, or None."""
    try:
        client = await get_client()
        res = await (
            client.table("conversations")
            .select("*")
            .eq("phone", phone)
            .order("id", desc=True)
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None
    except APIError as err:
        print(f"findConversation error: {err}")
        return None


async def get_inactive_incomplete_conversations(stale_before: str, limit: int = 25) -> list[dict]:
    try:
        client = await get_client()
        res = await (
            client.table("conversations")
            .select("*")
            .neq("step", "completed")
            .lt("updated_at", stale_before)
            .order("updated_at", desc=False)
            .limit(limit)
            .execute()
        )
        return res.data or []
    except APIError as err:
        print(f"[supabase] getInactiveIncompleteConversations FAILED: {err}")
        return []


async def mark_registration_reminder_sent(conversation: dict) -> None:
    temp_data = {
        **(conversation.get("temp_data") or {}),
        "registration_reminder_sent_at": _now_iso(),
    }
    try:
        client = await get_client()
        # Deliberately preserves the ORIGINAL updated_at (not a fresh timestamp)
        # so marking the reminder sent doesn't reset the staleness clock the
        # reminder loop uses to decide who else is due a nudge.
        await (
            client.table("conversations")
            .update({"temp_data": temp_data, "updated_at": conversation.get("updated_at")})
            .eq("id", conversation["id"])
            .execute()
        )
    except APIError as err:
        print(f"[supabase] markRegistrationReminderSent FAILED: {err}")


# -- Equivalent of "Search Freelancers" node ----------------------------------
async def find_freelancer(phone: str) -> dict | None:
    try:
        client = await get_client()
        res = await (
            client.table("freelancers")
            .select("*")
            .eq("phone", phone)
            .order("id", desc=True)
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None
    except APIError as err:
        print(f"findFreelancer error: {err}")
        return None


# -- Equivalent of "Upsert/Create Conversation" nodes + the "If" branch -------
async def save_conversation(id: int | None, phone: str, role: str | None, step: str | None, temp_data: dict) -> None:
    """Updates by id if the row already exists, otherwise inserts a new row."""
    row = {
        "phone": phone,
        "role": role,
        "step": step,
        "temp_data": temp_data,
        "updated_at": _now_iso(),
    }
    try:
        client = await get_client()
        if id:
            await client.table("conversations").update(row).eq("id", id).execute()
        else:
            await client.table("conversations").insert(row).execute()
    except APIError as err:
        print(f"saveConversation error: {err}")


# -- Equivalent of "Delete Conversations" + "Delete Freelancers" (reset) ------
async def reset_user(phone: str) -> None:
    """Matches reference freelancers/job_requests by phone - clear them first
    so the reset also works on databases without ON DELETE CASCADE."""
    client = await get_client()
    for coro in [
        client.table("matches").delete().or_(f"freelancer_phone.eq.{phone},client_phone.eq.{phone}").execute(),
        client.table("notifications").delete().eq("phone", phone).execute(),
        client.table("insights").delete().eq("phone", phone).execute(),
        client.table("vetting_checks").delete().eq("phone", phone).execute(),
        client.table("conversations").delete().eq("phone", phone).execute(),
        client.table("freelancers").delete().eq("phone", phone).execute(),
        client.table("job_requests").delete().eq("phone", phone).execute(),
    ]:
        try:
            await coro
        except APIError as err:
            print(f"[supabase] resetUser step FAILED: {err}")


# -- Save / upsert a completed freelancer profile -----------------------------
# Writes every field the onboarding flow collects - matching depends on
# skills/rate/availability being present in the permanent table.
async def save_freelancer_profile(phone: str, data: dict) -> None:
    row = {
        "phone": phone,
        "name": data.get("name") or None,
        "profile_link": data.get("linkedin_url") or data.get("cv_url") or data.get("profile_link") or None,
        "linkedin_url": data.get("linkedin_url") or None,
        "github_url": data.get("github_url") or None,
        "cv_url": data.get("cv_url") or None,
        "support_docs": data.get("support_docs") or None,
        "portfolio": data.get("portfolio") or None,
        "skills": data.get("skills") or None,
        "tools": data.get("tools") or None,
        "rate": data.get("rate") or None,
        "availability": data.get("availability") or None,
        "preferences": data.get("preferences") or None,
        "working_currently": data.get("working_currently") if data.get("working_currently") is not None else None,
        "contact_sharing_allowed": data.get("contact_sharing_allowed") if data.get("contact_sharing_allowed") is not None else None,
        "brief_description": data.get("brief_description") or None,
        "updated_at": _now_iso(),
    }
    print(f"[supabase] saveFreelancerProfile — upserting row: {row}")
    try:
        client = await get_client()
        res = await client.table("freelancers").upsert(row, on_conflict="phone").select().execute()
        row_id = res.data[0]["id"] if res.data else None
        print(f"[supabase] saveFreelancerProfile OK — row id: {row_id}")
    except APIError as err:
        print(f"[supabase] saveFreelancerProfile FAILED: {err}")


# -- Save / upsert a completed client job request -----------------------------
async def save_job_request(phone: str, data: dict) -> None:
    row = {
        "phone": phone,
        "name": data.get("name") or None,
        "project_description": data.get("project_description") or None,
        "hire_type": data.get("hire_type") or None,
        "budget_project": data.get("budget_project") or None,
        "budget_hourly": data.get("budget_hourly") or None,
        "project_count": data.get("project_count") or None,
        "deadline": data.get("deadline") or None,
        "deadline_normalized": data.get("deadline_normalized") or None,
        "is_recurring": data.get("is_recurring") if data.get("is_recurring") is not None else None,
        "hiring_currently": data.get("hiring_currently") if data.get("hiring_currently") is not None else None,
        "contact_sharing_allowed": data.get("contact_sharing_allowed") if data.get("contact_sharing_allowed") is not None else None,
        "brief_description": data.get("brief_description") or None,
    }
    print(f"[supabase] saveJobRequest — upserting row: {row}")
    try:
        client = await get_client()
        res = await client.table("job_requests").upsert(row, on_conflict="phone").select().execute()
        row_id = res.data[0]["id"] if res.data else None
        print(f"[supabase] saveJobRequest OK — row id: {row_id}")
    except APIError as err:
        print(f"[supabase] saveJobRequest FAILED: {err}")


# -- Reads used by the matching engine -----------------------------------------
async def find_job_request(phone: str) -> dict | None:
    try:
        client = await get_client()
        res = await (
            client.table("job_requests")
            .select("*")
            .eq("phone", phone)
            .order("id", desc=True)
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None
    except APIError as err:
        print(f"findJobRequest error: {err}")
        return None


async def get_all_freelancers() -> list[dict]:
    try:
        client = await get_client()
        res = await client.table("freelancers").select("*").execute()
        return res.data or []
    except APIError as err:
        print(f"getAllFreelancers error: {err}")
        return []


async def get_all_job_requests() -> list[dict]:
    try:
        client = await get_client()
        res = await client.table("job_requests").select("*").execute()
        return res.data or []
    except APIError as err:
        print(f"getAllJobRequests error: {err}")
        return []


# -- Writes used by the matching engine ----------------------------------------
async def upsert_matches(rows: list[dict]) -> list[dict]:
    """Upserts on (freelancer_phone, client_phone) so re-running matching after
    a profile edit refreshes scores instead of duplicating rows."""
    if not rows:
        return []
    try:
        client = await get_client()
        res = await (
            client.table("matches")
            .upsert(rows, on_conflict="freelancer_phone,client_phone")
            .select()
            .execute()
        )
        print(f"[supabase] upsertMatches OK — {len(res.data or [])} row(s)")
        return res.data or []
    except APIError as err:
        print(f"[supabase] upsertMatches FAILED: {err}")
        return []


async def get_ranked_matches_for_phone(phone: str, role: str) -> list[dict]:
    field = "freelancer_phone" if role == "freelancer" else "client_phone"
    try:
        client = await get_client()
        res = await (
            client.table("matches")
            .select("*")
            .eq(field, phone)
            .order("total_score", desc=True, nullsfirst=False)
            .order("compatibility_score", desc=True)
            .order("created_at", desc=True)
            .execute()
        )
        return res.data or []
    except APIError as err:
        print(f"[supabase] getRankedMatchesForPhone FAILED: {err}")
        return []


async def find_match_by_id(id) -> dict | None:
    try:
        client = await get_client()
        res = await client.table("matches").select("*").eq("id", id).limit(1).execute()
        return res.data[0] if res.data else None
    except APIError as err:
        print(f"[supabase] findMatchById FAILED: {err}")
        return None


async def update_match_lifecycle(id, patch: dict) -> dict | None:
    try:
        client = await get_client()
        res = await client.table("matches").update(patch).eq("id", id).select().execute()
        return res.data[0] if res.data else None
    except APIError as err:
        print(f"[supabase] updateMatchLifecycle FAILED: {err}")
        return None


async def upsert_match_feedback(row: dict) -> dict | None:
    stamped = {**row, "updated_at": _now_iso()}
    try:
        client = await get_client()
        res = await (
            client.table("match_feedback")
            .upsert(stamped, on_conflict="match_id,phone")
            .select()
            .execute()
        )
        return res.data[0] if res.data else None
    except APIError as err:
        print(f"[supabase] upsertMatchFeedback FAILED: {err}")
        return None


async def find_pending_contact_request(match_id, requester_phone: str, target_phone: str) -> dict | None:
    try:
        client = await get_client()
        res = await (
            client.table("contact_requests")
            .select("*")
            .eq("match_id", match_id)
            .eq("requester_phone", requester_phone)
            .eq("target_phone", target_phone)
            .eq("status", "pending")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None
    except APIError as err:
        print(f"[supabase] findPendingContactRequest FAILED: {err}")
        return None


async def find_latest_pending_contact_approval(target_phone: str) -> dict | None:
    try:
        client = await get_client()
        res = await (
            client.table("contact_requests")
            .select("*")
            .eq("target_phone", target_phone)
            .eq("status", "pending")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None
    except APIError as err:
        print(f"[supabase] findLatestPendingContactApproval FAILED: {err}")
        return None


async def get_pending_contact_requests_for_target(target_phone: str) -> list[dict]:
    try:
        client = await get_client()
        res = await (
            client.table("contact_requests")
            .select("*")
            .eq("target_phone", target_phone)
            .eq("status", "pending")
            .order("created_at", desc=True)
            .execute()
        )
        return res.data or []
    except APIError as err:
        print(f"[supabase] getPendingContactRequestsForTarget FAILED: {err}")
        return []


async def create_contact_request(row: dict) -> dict | None:
    try:
        client = await get_client()
        res = await client.table("contact_requests").insert(row).select().execute()
        return res.data[0] if res.data else None
    except APIError as err:
        print(f"[supabase] createContactRequest FAILED: {err}")
        return None


async def update_contact_request_status(id, status: str) -> dict | None:
    try:
        client = await get_client()
        res = await (
            client.table("contact_requests")
            .update({"status": status, "responded_at": _now_iso()})
            .eq("id", id)
            .select()
            .execute()
        )
        return res.data[0] if res.data else None
    except APIError as err:
        print(f"[supabase] updateContactRequestStatus FAILED: {err}")
        return None


async def insert_notifications(rows: list[dict]) -> None:
    if not rows:
        return
    try:
        client = await get_client()
        await client.table("notifications").insert(rows).execute()
    except APIError as err:
        print(f"[supabase] insertNotifications FAILED: {err}")


# Insights are a snapshot, not a log - replace the user's old rows each time
# they're regenerated so the dashboard never shows stale duplicates.
async def replace_insights(phone: str, rows: list[dict]) -> None:
    try:
        client = await get_client()
        await client.table("insights").delete().eq("phone", phone).execute()
    except APIError as err:
        print(f"[supabase] replaceInsights delete FAILED: {err}")
    if not rows:
        return
    try:
        client = await get_client()
        await client.table("insights").insert(rows).execute()
    except APIError as err:
        print(f"[supabase] replaceInsights insert FAILED: {err}")


# -- Vetting checks are replaced per full run or per single artifact re-vet ---
async def replace_vetting_checks(phone: str, rows: list[dict], artifact: str | None = None) -> list[dict]:
    try:
        client = await get_client()
        query = client.table("vetting_checks").delete().eq("phone", phone)
        if artifact:
            query = query.eq("artifact", artifact)
        await query.execute()
    except APIError as err:
        print(f"[supabase] replaceVettingChecks delete FAILED: {err}")

    if not rows:
        return []

    stamped = [
        {
            "phone": phone,
            "artifact": row["artifact"],
            "check_type": row["check_type"],
            "status": row["status"],
            "evidence": row.get("evidence") or {},
        }
        for row in rows
    ]

    try:
        client = await get_client()
        res = await client.table("vetting_checks").insert(stamped).select().execute()
        return res.data or []
    except APIError as err:
        print(f"[supabase] replaceVettingChecks insert FAILED: {err}")
        return []


async def get_vetting_checks(phone: str) -> list[dict]:
    try:
        client = await get_client()
        res = await client.table("vetting_checks").select("*").eq("phone", phone).execute()
        return res.data or []
    except APIError as err:
        print(f"[supabase] getVettingChecks FAILED: {err}")
        return []


async def update_freelancer_trust(phone: str, trust_score, trust_tier, trust_breakdown, vetted_at: str | None = None) -> None:
    row = {
        "trust_score": trust_score if trust_score is not None else None,
        "trust_tier": trust_tier or None,
        "trust_breakdown": trust_breakdown or None,
        "vetted_at": vetted_at or _now_iso(),
        "updated_at": _now_iso(),
    }
    try:
        client = await get_client()
        await client.table("freelancers").update(row).eq("phone", phone).execute()
    except APIError as err:
        print(f"[supabase] updateFreelancerTrust FAILED: {err}")


# -- Updates a single field for an already-completed freelancer --------------
async def update_freelancer_field(phone: str, field: str, value) -> None:
    try:
        client = await get_client()
        await (
            client.table("freelancers")
            .update({field: value, "updated_at": _now_iso()})
            .eq("phone", phone)
            .execute()
        )
    except APIError as err:
        print(f"[supabase] updateFreelancerField ({field}) error: {err}")


# -- Updates a single field for an already-completed client job request ------
# No-op (0 rows) when the client hasn't completed onboarding yet.
async def update_job_request_field(phone: str, field: str, value) -> None:
    try:
        client = await get_client()
        await client.table("job_requests").update({field: value}).eq("phone", phone).execute()
    except APIError as err:
        print(f"[supabase] updateJobRequestField ({field}) error: {err}")


# -- Removes a user's matches (either side) -----------------------------------
# Used when someone flips hiring_currently / working_currently to "no", so
# they stop being displayed until they opt back in.
async def delete_matches_for_phone(phone: str) -> None:
    try:
        client = await get_client()
        await (
            client.table("matches")
            .delete()
            .or_(f"freelancer_phone.eq.{phone},client_phone.eq.{phone}")
            .execute()
        )
    except APIError as err:
        print(f"[supabase] deleteMatchesForPhone error: {err}")

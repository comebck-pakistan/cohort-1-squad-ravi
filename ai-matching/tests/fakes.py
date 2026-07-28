"""
An in-memory stand-in for Supabase + a scripted stand-in for Groq, used to
drive the REAL handle_incoming_message pipeline through realistic multi-turn
conversations without touching the network. This is the one thing the
per-function pipeline tests (test_matching_pipeline.py, test_vetting_flow.py)
don't cover: whether handle_message.py's ~350-line state machine is actually
wired correctly end-to-end.
"""
import re

import app.contact_requests as contact_requests
import app.handle_message as handle_message
import app.match_lifecycle as match_lifecycle
import app.matching as matching
import app.vetting as vetting


class FakeBackend:
    def __init__(self):
        self.conversations: dict[str, dict] = {}
        self.freelancers: dict[str, dict] = {}
        self.job_requests: dict[str, dict] = {}
        self.matches: list[dict] = []
        self.notifications: list[dict] = []
        self.insights: dict[str, list[dict]] = {}
        self.vetting_checks: dict[str, list[dict]] = {}
        self.contact_requests: list[dict] = []
        self.match_feedback: list[dict] = []
        self.whatsapp_messages: list[tuple[str, str]] = []
        self.groq_match_analysis_calls = 0
        self.groq_vetting_analysis_calls = 0
        self._next_id = 1

    def _id(self) -> int:
        i = self._next_id
        self._next_id += 1
        return i

    # -- conversations ---------------------------------------------------------
    async def find_conversation(self, phone):
        return self.conversations.get(phone)

    async def save_conversation(self, id, phone, role, step, temp_data):
        row = self.conversations.get(phone)
        if row is None or id is None:
            row = {"id": self._id(), "phone": phone, "updated_at": "2026-01-01T00:00:00Z"}
            self.conversations[phone] = row
        row.update({"role": role, "step": step, "temp_data": temp_data})

    async def reset_user(self, phone):
        self.matches = [m for m in self.matches if m["freelancer_phone"] != phone and m["client_phone"] != phone]
        self.notifications = [n for n in self.notifications if n["phone"] != phone]
        self.insights.pop(phone, None)
        self.vetting_checks.pop(phone, None)
        self.conversations.pop(phone, None)
        self.freelancers.pop(phone, None)
        self.job_requests.pop(phone, None)

    # -- freelancers -------------------------------------------------------------
    async def find_freelancer(self, phone):
        return self.freelancers.get(phone)

    async def save_freelancer_profile(self, phone, data):
        row = {
            "phone": phone,
            "name": data.get("name") or None,
            "profile_link": data.get("linkedin_url") or data.get("cv_url") or None,
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
            "working_currently": data.get("working_currently"),
            "contact_sharing_allowed": data.get("contact_sharing_allowed"),
            "brief_description": data.get("brief_description") or None,
            "trust_score": None, "trust_tier": None, "trust_breakdown": None,
        }
        self.freelancers[phone] = row

    async def update_freelancer_field(self, phone, field, value):
        if phone in self.freelancers:
            self.freelancers[phone][field] = value

    async def update_freelancer_trust(self, phone, trust_score, trust_tier, trust_breakdown, vetted_at=None):
        if phone in self.freelancers:
            self.freelancers[phone].update(
                trust_score=trust_score, trust_tier=trust_tier, trust_breakdown=trust_breakdown
            )

    async def get_all_freelancers(self):
        return list(self.freelancers.values())

    # -- job requests --------------------------------------------------------------
    async def find_job_request(self, phone):
        return self.job_requests.get(phone)

    async def save_job_request(self, phone, data):
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
            "is_recurring": data.get("is_recurring"),
            "hiring_currently": data.get("hiring_currently"),
            "contact_sharing_allowed": data.get("contact_sharing_allowed"),
            "brief_description": data.get("brief_description") or None,
        }
        self.job_requests[phone] = row

    async def update_job_request_field(self, phone, field, value):
        if phone in self.job_requests:
            self.job_requests[phone][field] = value

    async def get_all_job_requests(self):
        return list(self.job_requests.values())

    # -- matches ---------------------------------------------------------------------
    async def upsert_matches(self, rows):
        written = []
        for row in rows:
            existing = next(
                (m for m in self.matches
                 if m["freelancer_phone"] == row["freelancer_phone"] and m["client_phone"] == row["client_phone"]),
                None,
            )
            if existing:
                existing.update(row)
                written.append(existing)
            else:
                stamped = {
                    "id": self._id(), "status": "matched", "freelancer_status": "pending",
                    "client_status": "pending", **row,
                }
                self.matches.append(stamped)
                written.append(stamped)
        return written

    async def get_ranked_matches_for_phone(self, phone, role):
        field = "freelancer_phone" if role == "freelancer" else "client_phone"
        rows = [m for m in self.matches if m[field] == phone]
        return sorted(rows, key=lambda m: (m.get("total_score") or 0, m.get("compatibility_score") or 0), reverse=True)

    async def find_match_by_id(self, id):
        return next((m for m in self.matches if str(m["id"]) == str(id)), None)

    async def update_match_lifecycle(self, id, patch):
        match = next((m for m in self.matches if str(m["id"]) == str(id)), None)
        if match:
            match.update(patch)
        return match

    async def delete_matches_for_phone(self, phone):
        self.matches = [m for m in self.matches if m["freelancer_phone"] != phone and m["client_phone"] != phone]

    # -- notifications / insights / vetting checks ------------------------------------
    async def insert_notifications(self, rows):
        self.notifications.extend(rows)

    async def replace_insights(self, phone, rows):
        self.insights[phone] = rows

    async def replace_vetting_checks(self, phone, rows, artifact=None):
        existing = self.vetting_checks.get(phone, [])
        if artifact:
            existing = [r for r in existing if r["artifact"] != artifact]
        else:
            existing = []
        existing.extend(rows)
        self.vetting_checks[phone] = existing
        return rows

    async def get_vetting_checks(self, phone):
        return self.vetting_checks.get(phone, [])

    # -- contact requests / feedback ---------------------------------------------------
    async def create_contact_request(self, row):
        stamped = {**row, "id": self._id(), "created_at": "2026-01-01T00:00:00Z"}
        self.contact_requests.append(stamped)
        return stamped

    async def find_pending_contact_request(self, match_id, requester_phone, target_phone):
        return next(
            (r for r in self.contact_requests
             if r["match_id"] == match_id and r["requester_phone"] == requester_phone
             and r["target_phone"] == target_phone and r["status"] == "pending"),
            None,
        )

    async def find_latest_pending_contact_approval(self, target_phone):
        pending = [r for r in self.contact_requests if r["target_phone"] == target_phone and r["status"] == "pending"]
        return pending[-1] if pending else None

    async def get_pending_contact_requests_for_target(self, target_phone):
        return [r for r in self.contact_requests if r["target_phone"] == target_phone and r["status"] == "pending"]

    async def update_contact_request_status(self, id, status):
        row = next((r for r in self.contact_requests if r["id"] == id), None)
        if row:
            row["status"] = status
        return row

    async def upsert_match_feedback(self, row):
        stamped = {**row, "id": self._id()}
        self.match_feedback.append(stamped)
        return stamped

    # -- WhatsApp / Groq ------------------------------------------------------------------
    async def send_whatsapp_message(self, phone, text):
        self.whatsapp_messages.append((phone, text))

    async def generate_match_analyses(self, job, candidates):
        self.groq_match_analysis_calls += 1
        return {
            str(c["freelancer"]["phone"]): {
                "ai_explanation": f"Fits based on {', '.join(c['skills_overlap']) or 'overall profile'}.",
                "potential_risks": "None flagged.",
                "recommended_action": "Reach out to confirm scope.",
            }
            for c in candidates
        }

    async def generate_vetting_analysis(self, profile, claimed_skills, evidence):
        self.groq_vetting_analysis_calls += 1
        return {
            "consistency_score": 70, "name_matches": [],
            "supported_skills": claimed_skills, "unsupported_skills": [], "summary": "ok",
        }

    def last_message_to(self, phone: str) -> str:
        return next(text for (p, text) in reversed(self.whatsapp_messages) if p == phone)

    def all_messages_to(self, phone: str) -> list[str]:
        return [text for (p, text) in self.whatsapp_messages if p == phone]


# -- Scripted fake Groq extractor (only covers steps the fast-paths don't) --------------
_FIELD_ALIASES = {"rate": "rate", "budget": "budget_project", "skills": "skills", "name": "name", "portfolio": "portfolio"}


def _detect_edit_field(text: str) -> str | None:
    match = re.search(r"(?:change|edit|update)\s+(?:my\s+)?(\w+)", text.lower())
    if not match:
        return None
    return _FIELD_ALIASES.get(match.group(1))


async def fake_extract_conversation_data(step, role, temp_data, message_text):
    """A scripted stand-in for the real Groq call - only handles the specific
    steps/messages the test scenarios below actually send. This tests the
    PIPELINE wiring (does handle_message.py correctly save/merge/advance),
    not Groq's actual language understanding, which can only be verified
    against the live API."""
    no_edit = {"is_edit": False, "target_field": None, "provided_value": None}

    if step == "completed":
        field = _detect_edit_field(message_text)
        if field:
            return {"role": role, "next_step": "completed", "extracted_data": {},
                     "edit_request": {"is_edit": True, "target_field": field, "provided_value": None}}
        return {"role": role, "next_step": "completed", "extracted_data": {}, "edit_request": no_edit}

    if step in (None, "welcome"):
        return {"role": None, "next_step": "collect_role", "extracted_data": {}, "edit_request": no_edit}

    if step == "collect_role":
        detected_role = "client" if "client" in message_text.lower() else "freelancer"
        return {"role": detected_role, "next_step": "collect_name", "extracted_data": {}, "edit_request": no_edit}

    if step == "collect_name":
        next_step = "collect_linkedin" if role == "freelancer" else "collect_project"
        return {"role": role, "next_step": next_step, "extracted_data": {"name": message_text.strip()}, "edit_request": no_edit}

    if step == "collect_project":
        return {"role": role, "next_step": "collect_hire_type",
                "extracted_data": {"project_description": message_text.strip()}, "edit_request": no_edit}

    if step == "collect_hire_type":
        hire_type = "full-time" if "full" in message_text.lower() else "project-based"
        next_step = "collect_budget_fulltime" if hire_type == "full-time" else "collect_budget_project"
        return {"role": role, "next_step": next_step, "extracted_data": {"hire_type": hire_type}, "edit_request": no_edit}

    if step in ("collect_budget_project", "collect_budget_fulltime"):
        extracted = {"budget_project": message_text.strip(), "project_count": "1"} if step == "collect_budget_project" \
            else {"budget_hourly": message_text.strip()}
        return {"role": role, "next_step": "collect_deadline", "extracted_data": extracted, "edit_request": no_edit}

    if step == "collect_skills":
        return {"role": role, "next_step": "collect_rate",
                "extracted_data": {"skills": message_text.strip(), "tools": ""}, "edit_request": no_edit}

    if step == "collect_rate":
        return {"role": role, "next_step": "collect_availability",
                "extracted_data": {"rate": message_text.strip()}, "edit_request": no_edit}

    if step == "collect_availability":
        return {"role": role, "next_step": "collect_preferences",
                "extracted_data": {"availability": message_text.strip()}, "edit_request": no_edit}

    if step == "collect_preferences":
        return {"role": role, "next_step": "collect_working_status",
                "extracted_data": {"preferences": message_text.strip()}, "edit_request": no_edit}

    if step in ("collect_freelancer_brief_desc", "collect_client_brief_desc"):
        return {"role": role, "next_step": "completed",
                "extracted_data": {"brief_description": message_text.strip()}, "edit_request": no_edit}

    # Fallback: re-ask (mirrors the real prompt's chit-chat fallback rule)
    return {"role": role, "next_step": step, "extracted_data": {}, "edit_request": no_edit}


def patch_all(monkeypatch, backend: FakeBackend) -> None:
    """Patches every Supabase/Groq/WhatsApp call site across every module that
    handle_incoming_message can reach, using one shared in-memory backend."""
    supabase_fns = [
        "find_conversation", "save_conversation", "reset_user",
        "find_freelancer", "save_freelancer_profile", "update_freelancer_field", "update_freelancer_trust",
        "get_all_freelancers", "find_job_request", "save_job_request", "update_job_request_field",
        "get_all_job_requests", "upsert_matches", "get_ranked_matches_for_phone", "find_match_by_id",
        "update_match_lifecycle", "delete_matches_for_phone", "insert_notifications", "replace_insights",
        "replace_vetting_checks", "get_vetting_checks", "create_contact_request", "find_pending_contact_request",
        "find_latest_pending_contact_approval", "get_pending_contact_requests_for_target",
        "update_contact_request_status", "upsert_match_feedback",
    ]
    for module in (handle_message, matching, vetting, contact_requests, match_lifecycle):
        for name in supabase_fns:
            if hasattr(module, name):
                monkeypatch.setattr(module, name, getattr(backend, name))
        if hasattr(module, "send_whatsapp_message"):
            monkeypatch.setattr(module, "send_whatsapp_message", backend.send_whatsapp_message)

    monkeypatch.setattr(handle_message, "extract_conversation_data", fake_extract_conversation_data)
    monkeypatch.setattr(matching, "generate_match_analyses", backend.generate_match_analyses)
    monkeypatch.setattr(vetting, "generate_vetting_analysis", backend.generate_vetting_analysis)

"""groq_client.py - the Groq calls + system prompts (data extraction, match analysis, vetting analysis)."""
import json
import re
from datetime import date, datetime, timezone

import httpx

from app.config import config
from app.deadline import parse_yes_no_locally

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"

SYSTEM_PROMPT = """You are the assistant's data-extraction engine for a WhatsApp onboarding flow matching clients with freelancers.

CRITICAL RULE: You must ONLY respond with a valid JSON object. No other text.

JSON Schema:
{
  "role": "freelancer" or "client" or null,
  "next_step": "the next step string",
  "extracted_data": {
    "linkedin_url": "LinkedIn profile URL or null",
    "github_url": "GitHub profile URL or null",
    "cv_url": "CV/resume URL or null",
    "support_docs": "supporting proof/certificates/docs URL or null",
    "deadline": "verbatim deadline/timeline text from user",
    "deadline_raw": "user's exact words (same as deadline)",
    "deadline_normalized": "clean version: e.g. 'every week', '2026-07-15', '3 weeks'",
    "is_recurring": true or false,
    "deadline_date": "YYYY-MM-DD or null (best-effort, never blocks advancement)",
    "availability_date": "YYYY-MM-DD or null",
    "contact_sharing_allowed": true or false
  },
  "edit_request": {
    "is_edit": true or false,
    "target_field": "name of field to edit or null if vague",
    "provided_value": "new value if provided in the message or null"
  }
}

Rules:
- ALWAYS preserve all existing keys/values in 'Collected Data So Far' into your 'extracted_data' output. Merge new data, never overwrite or delete old data.
- Determine next_step and extracted_data using the flow below. Do NOT write any reply text.
- If the user explicitly asks to change or edit a previously provided piece of info, set edit_request.is_edit to true. Determine the internal 'target_field' (e.g., 'rate', 'skills', 'budget_project', 'name', 'hiring_currently' for a client's hiring status, 'working_currently' for a freelancer's open-to-work status, 'contact_sharing_allowed' for whether their WhatsApp contact can be shown directly). If they provide the new value in the same message, put it in 'provided_value'. If vague, set target_field to null. If editing, keep next_step the same.
- CRITICAL EDIT RULE: Short acknowledgement/filler words (e.g., "ok", "perf", "thanks", "great", "cool", "nice", "got it", emojis) with no actual new value or explicit field reference MUST NEVER be classified as an edit request. Set edit_request.is_edit to false for these.
Date Parsing Rules:
- You will be given [TODAY'S DATE] in the user prompt.
- When extracting a Client's 'deadline' or a Freelancer's 'availability', store the user's raw text verbatim in 'deadline' or 'availability'. Additionally, if you can compute a concrete calendar date, store it in 'deadline_date' or 'availability_date' (YYYY-MM-DD). That calculated date is OPTIONAL and best-effort — it must NEVER block step advancement.
- Sensible calendar-date defaults (only when a concrete date is calculable):
  - "this week" -> end of current week (upcoming Sunday)
  - "next week" -> end of next week (Sunday of next week)
  - "this month" -> last day of the current month
  - "next month" -> last day of the next month
  - "immediately", "asap", "now", "today" -> today's date
- Recurring or relative durations like "weekly", "every week", "every 2 weeks", "monthly", "in 3 days", "2 weeks" ARE valid deadline/availability answers. Store them verbatim and leave deadline_date/availability_date as null. Advance the step normally.
- ONLY leave 'deadline'/'availability' blank AND re-ask (keep next_step the same) if the user's message has NO time or duration reference at all (e.g. pure chit-chat with zero timeline content).

Onboarding Steps:

1. welcome -> next_step: collect_role

2. collect_role
   - If Freelancer: role='freelancer', next_step='collect_name'.
   - If Client: role='client', next_step='collect_name'.

3. collect_name: extract 'name'.
   - If role='freelancer' next_step='collect_linkedin'.
   - If role='client' next_step='collect_project'.

=== FREELANCER FLOW ===
4. collect_profile_link: LEGACY ALIAS for collect_linkedin. Extract 'linkedin_url' if the user provides a URL; if they decline / say they don't have one, set linkedin_url=null and advance. next_step: collect_github.
5. collect_linkedin: extract 'linkedin_url' (LinkedIn URL preferred). If the user declines / says they don't have one, set linkedin_url=null and advance. If chit-chat, keep next_step the same. next_step: collect_github.
6. collect_github: extract 'github_url'. If the user declines / says they don't have one, set github_url=null and advance. If chit-chat, keep next_step the same. next_step: collect_cv.
7. collect_cv: extract 'cv_url' (CV/resume link). If the user declines / says they don't have one, set cv_url=null and advance. If chit-chat, keep next_step the same. next_step: collect_support_docs.
8. collect_support_docs: extract 'support_docs' (certificates, docs, or extra proof link). If the user declines / says they don't have one, set support_docs=null and advance. If chit-chat, keep next_step the same. next_step: collect_portfolio.
9. collect_portfolio: extract 'portfolio' (any URL). If the user declines / says they don't have one, set portfolio=null and advance. next_step: collect_skills.
10. collect_skills: extract 'skills' and 'tools'. next_step: collect_rate.
11. collect_rate: extract 'rate' (hourly rate). next_step: collect_availability.
12. collect_availability: extract 'availability'. next_step: collect_preferences.
13. collect_preferences: extract 'preferences'. next_step: collect_working_status.
13b. collect_working_status: extract 'working_currently' as boolean — true ONLY if the freelancer clearly says yes (they are currently open to / available for new work), false ONLY if they clearly say no. If the answer is neither a clear yes nor a clear no, leave it out and keep next_step the same (re-ask). next_step: collect_contact_sharing.
13c. collect_contact_sharing: extract 'contact_sharing_allowed' as boolean — true ONLY if the user clearly says yes (matched people can see their WhatsApp contact directly), false ONLY if they clearly say no (matched people must request approval first). If ambiguous, leave it out and keep next_step the same. If role='freelancer' next_step: collect_freelancer_brief_desc. If role='client' next_step: collect_client_brief_desc.
13d. collect_freelancer_brief_desc: extract EXACTLY the raw text of the user's message into 'brief_description'. Do not try to extract structured fields. next_step: completed.

=== CLIENT FLOW ===
10. collect_project: extract WHATEVER the client says as 'project_description' (even a short single sentence). next_step: collect_hire_type.
11. collect_hire_type: extract 'hire_type' as exactly 'full-time' or 'project-based' based on user's answer. If full-time: next_step='collect_budget_fulltime'. If project-based: next_step='collect_budget_project'.
12. collect_budget_fulltime: extract 'budget_hourly' (their expected hourly rate budget). next_step: collect_deadline.
13. collect_budget_project: extract 'budget_project' (project budget) and 'project_count' (how many projects, default 1 if unclear). next_step: collect_deadline.
14. collect_deadline: extract 'deadline' (timeline/when they need it done). Accept ANY reasonable answer: a date ("July 15"), a duration ("2 weeks", "week"), a recurring cadence ("weekly", "every week"), or a relative phrase ("asap", "this month"). Store the raw user text in 'deadline'. Always advance next_step to 'collect_hiring_status' as long as the message contains any time/duration/frequency reference. Only re-ask if the message has zero time reference.
14b. collect_hiring_status: extract 'hiring_currently' as boolean — true ONLY if the client clearly says yes (they are actively hiring for this right now), false ONLY if they clearly say no (just planning/exploring). If the answer is neither a clear yes nor a clear no, leave it out and keep next_step the same (re-ask). next_step: collect_contact_sharing.
14c. collect_contact_sharing: extract 'contact_sharing_allowed' as boolean — true ONLY if the user clearly says yes (matched people can see their WhatsApp contact directly), false ONLY if they clearly say no (matched people must request approval first). If ambiguous, leave it out and keep next_step the same. If role='client' next_step: collect_client_brief_desc. If role='freelancer' next_step: collect_freelancer_brief_desc.
14d. collect_client_brief_desc: extract EXACTLY the raw text of the user's message into 'brief_description'. Do not try to extract structured fields. next_step: completed.

CRITICAL DATA COLLECTION RULE (overrides ALL edit detection):
- Steps collect_freelancer_brief_desc, collect_client_brief_desc, and collect_project are PURE DATA COLLECTION steps. The user's ENTIRE message is their answer to the current question. No matter what words appear in the message (including words like "edit", "change", "update", "actually"), you MUST set edit_request.is_edit = false and extract the full message as the field value. These steps NEVER produce an edit request.

Fallback Rules:
- If user chit-chats, keep next_step the same (re-ask for current step's data).
- If Current Step is empty, unknown, or 'welcome', execute step 1."""

# Groq occasionally uses synonyms for the canonical keys our code expects.
KEY_ALIASES = {
    "full_name": "name",
    "user_name": "name",
    "username": "name",
    "description": "brief_description",
    "brief_desc": "brief_description",
    "project_brief": "brief_description",
    "type": "hire_type",
    "hiring_type": "hire_type",
    "employment_type": "hire_type",
    "budget": "budget_project",
    "hourly_rate": "rate",
    "project_type": "hire_type",
    "currently_hiring": "hiring_currently",
    "is_hiring": "hiring_currently",
    "hiring_status": "hiring_currently",
    "currently_working": "working_currently",
    "working_status": "working_currently",
    "open_to_work": "working_currently",
    "share_contact": "contact_sharing_allowed",
    "contact_sharing": "contact_sharing_allowed",
    "contact_allowed": "contact_sharing_allowed",
    "show_contact": "contact_sharing_allowed",
    "contact_visible": "contact_sharing_allowed",
    "phone_visible": "contact_sharing_allowed",
    "profile_link": "linkedin_url",
    "linkedin": "linkedin_url",
    "linkedin_link": "linkedin_url",
    "linkedin_profile": "linkedin_url",
    "linkedin_url": "linkedin_url",
    "github": "github_url",
    "github_link": "github_url",
    "github_profile": "github_url",
    "github_url": "github_url",
    "cv": "cv_url",
    "cv_link": "cv_url",
    "resume": "cv_url",
    "resume_link": "cv_url",
    "resume_url": "cv_url",
    "cv_url": "cv_url",
    "additional_docs": "support_docs",
    "support_documents": "support_docs",
    "supporting_docs": "support_docs",
    "certificates": "support_docs",
    "certificate_url": "support_docs",
    "support_docs_url": "support_docs",
}

# These columns are booleans - Groq occasionally returns "yes"/"no" strings,
# which would fail the Supabase insert.
BOOLEAN_KEYS = {"hiring_currently", "working_currently", "contact_sharing_allowed"}


def _parse_json_maybe_fenced(raw_content: str) -> dict:
    try:
        return json.loads(raw_content)
    except json.JSONDecodeError:
        cleaned = re.sub(r"```json|```", "", raw_content).strip()
        return json.loads(cleaned)


async def _post_groq(system_prompt: str, user_content: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {config.groq.api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": config.groq.model,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
            },
        )

    if not response.is_success:
        raise RuntimeError(f"Groq API error ({response.status_code}): {response.text}")

    data = response.json()
    raw_content = data["choices"][0]["message"]["content"]
    return _parse_json_maybe_fenced(raw_content)


async def extract_conversation_data(step: str | None, role: str | None, temp_data: dict | None, message_text: str) -> dict:
    """Equivalent of the 'Groq AI Completion' + 'Parse Groq JSON' nodes combined."""
    today = date.today().isoformat()
    user_content = (
        f"[TODAY'S DATE]: {today} | "
        f"Current Step: {step or 'welcome'} | "
        f"Current Role: {role or 'unknown'} | "
        f"Collected Data So Far: {json.dumps(temp_data or {})} | "
        f"User Message: {message_text}"
    )

    parsed = await _post_groq(SYSTEM_PROMPT, user_content)

    print(f"[groq] RAW extraction (step={step or 'welcome'}):\n{json.dumps(parsed, indent=2)}")

    raw_extracted = parsed.get("extracted_data") or {}
    normalised: dict = {}
    for key, raw_value in raw_extracted.items():
        canonical = KEY_ALIASES.get(key, key)
        value = raw_value
        if canonical in BOOLEAN_KEYS and isinstance(value, str):
            value = parse_yes_no_locally(value)
        if canonical not in normalised:
            normalised[canonical] = value

    # Normalise the edit target through the same alias map, so e.g.
    # target_field 'working_status' resolves to the real 'working_currently' column.
    edit_request = parsed.get("edit_request") or {"is_edit": False, "target_field": None, "provided_value": None}
    if edit_request.get("target_field") and edit_request["target_field"] in KEY_ALIASES:
        edit_request["target_field"] = KEY_ALIASES[edit_request["target_field"]]

    return {
        "role": parsed.get("role") or None,
        "next_step": parsed.get("next_step") or "welcome",
        "extracted_data": normalised,
        "edit_request": edit_request,
    }


MATCH_ANALYSIS_PROMPT = """You are a freelance-marketplace matchmaking analyst. You are given one client job request and a list of candidate freelancers that were already scored by a local algorithm.

CRITICAL RULE: You must ONLY respond with a valid JSON object. No other text, no markdown.

JSON Schema:
{
  "analyses": [
    {
      "freelancer_phone": "echo the candidate's phone EXACTLY as given",
      "ai_explanation": "1-2 plain sentences on why this freelancer fits this specific project — mention concrete skills",
      "potential_risks": "one short sentence on the main risk or unknown (e.g. rate above budget, vague availability, unverified/broken trust evidence). Never empty.",
      "recommended_action": "one short imperative next step for the client (e.g. 'Ask for two recent video samples before committing.')"
    }
  ]
}

Rules:
- Return exactly one entry per candidate, in the same order they were given.
- Plain conversational text only — no markdown, no bullet points, no emojis.
- Use trust_score/trust_tier and broken/unverifiable verification facts when present. Reflect meaningful verification gaps in potential_risks.
- Base everything on the provided data. Do not invent skills, rates, or history."""


async def generate_match_analyses(job: dict, candidates: list[dict]) -> dict[str, dict]:
    """One batched call per matching run: takes the job + top candidates and
    returns a dict of freelancer_phone -> {ai_explanation, potential_risks,
    recommended_action}. Raises on API/parse failure - the caller falls back
    to template text."""
    user_content = json.dumps({
        "job": {
            "name": job.get("name"),
            "project_description": job.get("project_description"),
            "hire_type": job.get("hire_type"),
            "budget_project": job.get("budget_project"),
            "budget_hourly": job.get("budget_hourly"),
            "deadline": job.get("deadline"),
            "brief_description": job.get("brief_description"),
        },
        "candidates": [
            {
                "freelancer_phone": c["freelancer"]["phone"],
                "name": c["freelancer"].get("name"),
                "skills": c["freelancer"].get("skills"),
                "tools": c["freelancer"].get("tools"),
                "rate": c["freelancer"].get("rate"),
                "availability": c["freelancer"].get("availability"),
                "preferences": c["freelancer"].get("preferences"),
                "brief_description": c["freelancer"].get("brief_description"),
                "local_score": c["score"],
                "skills_overlap": c["skills_overlap"],
                "budget_fit": c["budget_fit"],
                "availability_fit": c["availability_fit"],
                "trust_score": c.get("trust_score") if c.get("trust_score") is not None else c["freelancer"].get("trust_score"),
                "trust_tier": c["freelancer"].get("trust_tier"),
                "broken_links": (c["freelancer"].get("trust_breakdown") or {}).get("broken_links", []),
                "unverifiable_links": (c["freelancer"].get("trust_breakdown") or {}).get("unverifiable_links", []),
            }
            for c in candidates
        ],
    })

    parsed = await _post_groq(MATCH_ANALYSIS_PROMPT, user_content)

    by_phone: dict[str, dict] = {}
    for entry in parsed.get("analyses") or []:
        phone = entry.get("freelancer_phone")
        if phone:
            by_phone[str(phone)] = entry
    return by_phone


VETTING_ANALYSIS_PROMPT = """You are a verification analyst for a freelance marketplace. Compare a freelancer's claimed skills and identity against evidence extracted from their submitted links.

CRITICAL RULE: You must ONLY respond with a valid JSON object. No other text, no markdown.

JSON Schema:
{
  "consistency_score": 0-100,
  "name_matches": [
    { "artifact": "artifact name", "matches": true or false or null, "reason": "short reason" }
  ],
  "supported_skills": ["skill names from the claimed list that evidence supports"],
  "unsupported_skills": ["skill names from the claimed list that evidence does not support"],
  "summary": "one short plain-English summary"
}

Rules:
- Use only the supplied evidence snippets; do not browse or invent facts.
- If evidence is thin but not contradictory, use a middling consistency_score instead of zero.
- supported_skills and unsupported_skills must use the exact claimed skill names when possible.
- Plain text only inside JSON values."""


async def generate_vetting_analysis(profile: dict, claimed_skills: list[str], evidence: list[dict]) -> dict:
    """One optional Groq call per full vet. Re-vets reuse the stored claims row."""
    user_content = json.dumps({
        "profile": {
            "name": profile.get("name"),
            "skills": profile.get("skills"),
            "tools": profile.get("tools"),
            "brief_description": profile.get("brief_description"),
            "linkedin_url": profile.get("linkedin_url"),
            "github_url": profile.get("github_url"),
            "cv_url": profile.get("cv_url"),
            "portfolio": profile.get("portfolio"),
            "support_docs": profile.get("support_docs"),
        },
        "claimed_skills": claimed_skills,
        "evidence": evidence,
    })

    parsed = await _post_groq(VETTING_ANALYSIS_PROMPT, user_content)

    consistency_score_raw = parsed.get("consistency_score")
    try:
        consistency_score = max(0, min(100, float(consistency_score_raw)))
    except (TypeError, ValueError):
        consistency_score = 0

    return {
        "consistency_score": consistency_score,
        "name_matches": parsed.get("name_matches") if isinstance(parsed.get("name_matches"), list) else [],
        "supported_skills": parsed.get("supported_skills") if isinstance(parsed.get("supported_skills"), list) else [],
        "unsupported_skills": parsed.get("unsupported_skills") if isinstance(parsed.get("unsupported_skills"), list) else [],
        "summary": parsed.get("summary") or "",
    }

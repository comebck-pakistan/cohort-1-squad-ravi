"""
End-to-end dry run of run_matching_for_client / run_matching_for_freelancer
with every I/O boundary (Supabase, Groq, WhatsApp) replaced by AsyncMocks.
Mirrors the same four scenarios validated against the original Node backend:
a hiring client, a working freelancer, a non-hiring client, and a
non-working freelancer (perfect skill fit, but gated out).
"""
from unittest.mock import AsyncMock

import pytest

import app.matching as matching


FREELANCERS = [
    {
        "phone": "923001111111", "name": "Ahmed",
        "skills": "video editing, motion graphics", "tools": "Premiere Pro, After Effects",
        "rate": "$15/hr", "availability": "25 hours a week", "preferences": "YouTube channels",
        "brief_description": "I edit long-form YouTube videos and reels",
        "working_currently": True, "contact_sharing_allowed": True,
        "trust_score": None, "trust_tier": None, "trust_breakdown": None,
    },
    {
        "phone": "923002222222", "name": "Sara",
        "skills": "content writing, SEO", "tools": "Google Docs",
        "rate": "$50/hr", "availability": "5 hours", "preferences": None,
        "brief_description": "SEO blog writer for SaaS",
        "working_currently": True, "contact_sharing_allowed": True,
    },
    {
        # Perfect skill fit but NOT open to work - must never be matched
        "phone": "923003333333", "name": "Bilal",
        "skills": "video editing, motion graphics", "tools": "Premiere Pro",
        "rate": "$10/hr", "availability": "40 hours a week", "preferences": "YouTube",
        "brief_description": "YouTube video editor",
        "working_currently": False, "contact_sharing_allowed": True,
    },
]

JOBS = [
    {
        "phone": "923009999999", "name": "Ali",
        "project_description": "Need weekly video editing for my YouTube channel",
        "hire_type": "project-based", "budget_project": "$300/month", "budget_hourly": "$20",
        "project_count": "4", "deadline": "weekly", "deadline_normalized": "every week",
        "is_recurring": True, "brief_description": "Ongoing YouTube video editing, 2 videos per week",
        "hiring_currently": True, "contact_sharing_allowed": True,
    },
    {
        # Video job that would match Ahmed, but client is NOT actively hiring
        "phone": "923008888888", "name": "Usman",
        "project_description": "Video editing for product demos",
        "hire_type": "project-based", "budget_project": "$500", "budget_hourly": "$25",
        "project_count": "2", "deadline": "next month", "deadline_normalized": "next month",
        "is_recurring": False, "brief_description": "Planning ahead, video editing help",
        "hiring_currently": False, "contact_sharing_allowed": True,
    },
]


class Capture:
    def __init__(self):
        self.matches_written: list[list[dict]] = []
        self.notifications: list[list[dict]] = []
        self.whatsapp: list[tuple[str, str]] = []
        self.groq_calls = 0
        self._next_id = 1

    async def upsert_matches(self, rows):
        stamped = []
        for row in rows:
            stamped.append({**row, "id": self._next_id})
            self._next_id += 1
        self.matches_written.append(stamped)
        return stamped

    async def insert_notifications(self, rows):
        self.notifications.append(rows)

    async def send_whatsapp_message(self, phone, text):
        self.whatsapp.append((phone, text))

    async def generate_match_analyses(self, job, candidates):
        self.groq_calls += 1
        return {
            str(c["freelancer"]["phone"]): {
                "ai_explanation": f"AI says {c['freelancer'].get('name')} fits because of {', '.join(c['skills_overlap']) or 'general fit'}.",
                "potential_risks": "AI risk line.",
                "recommended_action": "AI action line.",
            }
            for c in candidates
        }


@pytest.fixture
def capture(monkeypatch):
    cap = Capture()

    async def find_job_request(phone):
        return next((j for j in JOBS if j["phone"] == phone), None)

    async def find_freelancer(phone):
        return next((f for f in FREELANCERS if f["phone"] == phone), None)

    async def get_all_freelancers():
        return FREELANCERS

    async def get_all_job_requests():
        return JOBS

    async def replace_insights(phone, rows):
        pass

    async def get_ranked_matches_for_phone(phone, role):
        # Not needed for these assertions - rank hints degrade gracefully to None.
        return []

    monkeypatch.setattr(matching, "find_job_request", find_job_request)
    monkeypatch.setattr(matching, "find_freelancer", find_freelancer)
    monkeypatch.setattr(matching, "get_all_freelancers", get_all_freelancers)
    monkeypatch.setattr(matching, "get_all_job_requests", get_all_job_requests)
    monkeypatch.setattr(matching, "replace_insights", replace_insights)
    monkeypatch.setattr(matching, "get_ranked_matches_for_phone", get_ranked_matches_for_phone)
    monkeypatch.setattr(matching, "upsert_matches", cap.upsert_matches)
    monkeypatch.setattr(matching, "insert_notifications", cap.insert_notifications)
    monkeypatch.setattr(matching, "send_whatsapp_message", cap.send_whatsapp_message)
    monkeypatch.setattr(matching, "generate_match_analyses", cap.generate_match_analyses)

    return cap


async def test_client_run_matches_only_the_working_high_scorer(capture):
    await matching.run_matching_for_client("923009999999")

    assert len(capture.matches_written) == 1
    rows = capture.matches_written[0]
    assert len(rows) == 1
    assert rows[0]["freelancer_phone"] == "923001111111"  # Ahmed only

    # Bilal (working_currently=False) must never appear despite perfect skills
    assert all(r["freelancer_phone"] != "923003333333" for r in rows)

    # Match row carries all dashboard-required fields
    for field in ("compatibility_score", "trust_score", "total_score", "skills_overlap",
                  "budget_fit", "availability_fit", "ai_explanation", "potential_risks", "recommended_action"):
        assert field in rows[0]
    assert isinstance(rows[0]["skills_overlap"], list)
    assert rows[0]["ai_explanation"].startswith("AI says")

    assert len(capture.notifications) == 1
    assert capture.groq_calls == 1

    client_message = next(text for (phone, text) in capture.whatsapp if phone == "923009999999")
    assert "Ahmed" in client_message


async def test_freelancer_run_matches_only_the_hiring_job(capture):
    await matching.run_matching_for_freelancer("923001111111")

    assert len(capture.matches_written) == 1
    rows = capture.matches_written[0]
    assert len(rows) == 1
    assert rows[0]["client_phone"] == "923009999999"  # Ali (hiring) only, not Usman

    assert capture.groq_calls == 1

    freelancer_message = next(text for (phone, text) in capture.whatsapp if phone == "923001111111")
    assert "match" in freelancer_message.lower()


async def test_non_hiring_client_gets_hold_off_message_and_no_matches(capture):
    await matching.run_matching_for_client("923008888888")  # Usman, hiring_currently=False

    assert capture.matches_written == []
    assert capture.groq_calls == 0
    message = next(text for (phone, text) in capture.whatsapp if phone == "923008888888")
    assert "not actively hiring" in message


async def test_non_working_freelancer_gets_hold_off_message_and_no_matches(capture):
    await matching.run_matching_for_freelancer("923003333333")  # Bilal, working_currently=False

    assert capture.matches_written == []
    assert capture.groq_calls == 0
    message = next(text for (phone, text) in capture.whatsapp if phone == "923003333333")
    assert "not taking on work" in message

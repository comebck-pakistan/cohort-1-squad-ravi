"""
Drives the REAL handle_incoming_message pipeline through full, realistic
multi-turn conversations - the one thing the per-function pipeline tests
don't cover. Only Supabase/Groq/WhatsApp are faked (via tests/fakes.py);
every fast-path (deadline regex, yes/no regex, link regex, ack detection),
the temp_data merge logic, completion handling, vetting, matching, the edit
flow, match-lifecycle commands, and reset all run as real code.
"""
import asyncio
from unittest.mock import AsyncMock

import pytest

from app.handle_message import handle_incoming_message
from tests.fakes import FakeBackend, patch_all

FREELANCER_PHONE = "923005550001"
CLIENT_PHONE = "923005550002"


@pytest.fixture
def backend(monkeypatch):
    b = FakeBackend()
    patch_all(monkeypatch, b)
    # Each turn faithfully ports the original's 800ms "typing indicator" delay
    # (real, intentional production behavior) - harmless to skip in tests,
    # which otherwise take 15-25+ real seconds per multi-turn scenario.
    monkeypatch.setattr(asyncio, "sleep", AsyncMock())
    return b


async def _say(phone: str, text: str) -> None:
    await handle_incoming_message(phone, text)


async def _onboard_freelancer(backend: FakeBackend) -> None:
    p = FREELANCER_PHONE
    await _say(p, "hi")
    assert backend.conversations[p]["step"] == "collect_role"

    await _say(p, "I'm a freelancer")
    assert backend.conversations[p]["role"] == "freelancer"
    assert backend.conversations[p]["step"] == "collect_name"

    await _say(p, "Ahmed Khan")
    assert backend.conversations[p]["temp_data"]["name"] == "Ahmed Khan"
    assert backend.conversations[p]["step"] == "collect_linkedin"

    # Skip every proof-link step via the real local link fast-path (no Groq calls)
    for step_after in ("collect_github", "collect_cv", "collect_support_docs", "collect_portfolio", "collect_skills"):
        await _say(p, "skip")
        assert backend.conversations[p]["step"] == step_after

    await _say(p, "video editing, motion graphics")
    assert backend.conversations[p]["step"] == "collect_rate"

    await _say(p, "$15/hr")
    assert backend.conversations[p]["step"] == "collect_availability"

    await _say(p, "25 hours a week")
    assert backend.conversations[p]["step"] == "collect_preferences"

    await _say(p, "YouTube channels")
    assert backend.conversations[p]["step"] == "collect_working_status"

    await _say(p, "yes")  # local yes/no fast-path, no Groq call
    assert backend.conversations[p]["temp_data"]["working_currently"] is True
    assert backend.conversations[p]["step"] == "collect_contact_sharing"

    await _say(p, "yes")  # local yes/no fast-path
    assert backend.conversations[p]["step"] == "collect_freelancer_brief_desc"

    await _say(p, "I'm a video editor for YouTubers")
    assert backend.conversations[p]["step"] == "completed"


async def _onboard_client(backend: FakeBackend) -> None:
    p = CLIENT_PHONE
    await _say(p, "hi")
    await _say(p, "I'm a client")
    assert backend.conversations[p]["role"] == "client"

    await _say(p, "Ali Raza")
    await _say(p, "Need weekly video editing for my YouTube channel")
    assert backend.conversations[p]["step"] == "collect_hire_type"

    await _say(p, "project based")
    assert backend.conversations[p]["step"] == "collect_budget_project"

    await _say(p, "$300 for 4 videos")
    assert backend.conversations[p]["step"] == "collect_deadline"

    await _say(p, "weekly")  # REAL local deadline regex fast-path, not the fake Groq
    assert backend.conversations[p]["temp_data"]["is_recurring"] is True
    assert backend.conversations[p]["step"] == "collect_hiring_status"

    await _say(p, "yes")
    assert backend.conversations[p]["step"] == "collect_contact_sharing"

    await _say(p, "yes")
    assert backend.conversations[p]["step"] == "collect_client_brief_desc"

    await _say(p, "Looking for a long-term editor")
    assert backend.conversations[p]["step"] == "completed"


async def test_freelancer_completes_and_gets_vetted_with_zero_groq_calls(backend):
    await _onboard_freelancer(backend)

    freelancer = backend.freelancers[FREELANCER_PHONE]
    assert freelancer["name"] == "Ahmed Khan"
    assert freelancer["skills"] == "video editing, motion graphics"
    assert freelancer["working_currently"] is True
    assert freelancer["contact_sharing_allowed"] is True

    # Vetting ran (trust columns populated)...
    assert freelancer["trust_score"] is not None
    assert freelancer["trust_tier"] == "unverified"  # no proof links were provided
    # ...but with every link skipped, no artifact ever yields evidence, so the
    # optional Groq vetting call must never fire - zero tokens spent.
    assert backend.groq_vetting_analysis_calls == 0

    # No jobs exist yet, so no match - but insights were still generated.
    assert backend.matches == []
    assert FREELANCER_PHONE in backend.insights

    trust_message = backend.last_message_to(FREELANCER_PHONE)
    assert "Trust Score" in trust_message


async def test_client_completes_and_matches_the_freelancer(backend):
    await _onboard_freelancer(backend)
    await _onboard_client(backend)

    assert len(backend.matches) == 1
    match = backend.matches[0]
    assert match["freelancer_phone"] == FREELANCER_PHONE
    assert match["client_phone"] == CLIENT_PHONE
    assert "Video Editing" in match["skills_overlap"]
    assert match["compatibility_score"] >= 80
    assert match["total_score"] is not None
    assert backend.groq_match_analysis_calls == 1  # exactly one batched call

    client_message = backend.last_message_to(CLIENT_PHONE)
    assert "Ahmed" in client_message

    freelancer_messages = backend.all_messages_to(FREELANCER_PHONE)
    assert any("match" in m.lower() for m in freelancer_messages[-2:])


async def test_show_my_matches_command(backend):
    await _onboard_freelancer(backend)
    await _onboard_client(backend)

    await _say(FREELANCER_PHONE, "show my matches")
    summary = backend.last_message_to(FREELANCER_PHONE)
    assert "Ali" in summary or "matches" in summary.lower()


async def test_edit_flow_updates_rate_without_a_second_groq_dependent_step(backend):
    await _onboard_freelancer(backend)

    await _say(FREELANCER_PHONE, "change my rate")
    conv = backend.conversations[FREELANCER_PHONE]
    assert conv["temp_data"]["editing_field"] == "rate"
    ask_message = backend.last_message_to(FREELANCER_PHONE)
    assert "rate" in ask_message.lower()

    await _say(FREELANCER_PHONE, "$25/hr")
    assert backend.freelancers[FREELANCER_PHONE]["rate"] == "$25/hr"
    assert "editing_field" not in backend.conversations[FREELANCER_PHONE]["temp_data"]
    assert backend.conversations[FREELANCER_PHONE]["step"] == "completed"


async def test_reset_wipes_client_data_and_removes_their_matches(backend):
    await _onboard_freelancer(backend)
    await _onboard_client(backend)
    assert len(backend.matches) == 1

    await _say(CLIENT_PHONE, "reset ai")

    assert CLIENT_PHONE not in backend.conversations
    assert CLIENT_PHONE not in backend.job_requests
    assert backend.matches == []  # match involving the reset client is gone
    # Freelancer side is untouched by the client's reset
    assert FREELANCER_PHONE in backend.freelancers

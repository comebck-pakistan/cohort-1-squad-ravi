"""
Full vetting-flow tests with the artifact checkers (real network calls) and
the Groq consistency call mocked out - verifies the orchestration logic:
storing rows, computing the score, messaging the freelancer, the
broken-link resend prompt, and that a single-artifact re-vet touches only
that one artifact and refreshes existing match totals.
"""
import pytest

import app.vetting as vetting


FREELANCER = {
    "phone": "923001111111", "name": "Ahmed",
    "linkedin_url": "https://linkedin.com/in/ahmed",
    "github_url": "https://github.com/ahmed",
    "cv_url": None, "portfolio": None, "support_docs": None,
    "skills": "video editing", "tools": "Premiere Pro",
    "brief_description": "YouTube editor",
    "trust_score": None, "trust_tier": None, "trust_breakdown": None,
}


class VettingCapture:
    def __init__(self):
        self.stored_rows: list[tuple[str, list[dict], str | None]] = []
        self.trust_updates: list[tuple] = []
        self.whatsapp: list[tuple[str, str]] = []
        self.refresh_calls: list[str] = []
        self.check_calls: list[str] = []
        self._rows_by_artifact: dict[str, list[dict]] = {}

    async def find_freelancer(self, phone):
        return FREELANCER

    async def replace_vetting_checks(self, phone, rows, artifact=None):
        self.stored_rows.append((phone, rows, artifact))
        if artifact:
            self._rows_by_artifact[artifact] = [r for r in rows if r["artifact"] == artifact]
        else:
            for r in rows:
                self._rows_by_artifact.setdefault(r["artifact"], []).append(r)
        return rows

    async def get_vetting_checks(self, phone):
        return [r for rows in self._rows_by_artifact.values() for r in rows]

    async def update_freelancer_trust(self, phone, trust_score, trust_tier, trust_breakdown, vetted_at=None):
        self.trust_updates.append((phone, trust_score, trust_tier, trust_breakdown))

    async def send_whatsapp_message(self, phone, text):
        self.whatsapp.append((phone, text))

    async def refresh_match_totals_for_freelancer(self, phone):
        self.refresh_calls.append(phone)

    async def generate_vetting_analysis(self, profile, claimed_skills, evidence):
        return {
            "consistency_score": 80,
            "name_matches": [],
            "supported_skills": claimed_skills,
            "unsupported_skills": [],
            "summary": "Looks consistent.",
        }

    def make_check_artifact(self, broken_artifact: str | None = None):
        async def _check_artifact(artifact, url, freelancer, evidence_for_groq):
            self.check_calls.append(artifact)
            if not url:
                return []
            if artifact == broken_artifact:
                return [{"artifact": artifact, "check_type": "liveness", "status": "fail",
                         "evidence": {"url": url, "status_code": 404}}]
            if artifact == "github_url":
                evidence_for_groq.append({"artifact": artifact, "text": "video editing premiere"})
                return [
                    {"artifact": artifact, "check_type": "liveness", "status": "pass", "evidence": {"url": url}},
                    {"artifact": artifact, "check_type": "identity", "status": "pass", "evidence": {"name_matched": True}},
                    {"artifact": artifact, "check_type": "content", "status": "pass", "evidence": {"skills_found": ["Video Editing"]}},
                ]
            return [
                {"artifact": artifact, "check_type": "liveness", "status": "unverifiable", "evidence": {"url": url}},
                {"artifact": artifact, "check_type": "identity", "status": "unverifiable", "evidence": {"name_matched": None}},
            ]
        return _check_artifact


@pytest.fixture
def cap(monkeypatch):
    c = VettingCapture()
    monkeypatch.setattr(vetting, "find_freelancer", c.find_freelancer)
    monkeypatch.setattr(vetting, "replace_vetting_checks", c.replace_vetting_checks)
    monkeypatch.setattr(vetting, "get_vetting_checks", c.get_vetting_checks)
    monkeypatch.setattr(vetting, "update_freelancer_trust", c.update_freelancer_trust)
    monkeypatch.setattr(vetting, "send_whatsapp_message", c.send_whatsapp_message)
    monkeypatch.setattr(vetting, "refresh_match_totals_for_freelancer", c.refresh_match_totals_for_freelancer)
    monkeypatch.setattr(vetting, "_check_artifact", c.make_check_artifact())
    monkeypatch.setattr(vetting, "generate_vetting_analysis", c.generate_vetting_analysis)

    return c


async def test_full_vet_stores_rows_and_messages_freelancer(cap):
    result = await vetting.run_vetting_for_freelancer("923001111111")

    assert result is not None
    assert result["trust_score"] > 0
    assert len(cap.trust_updates) == 1
    assert len(cap.whatsapp) == 1
    phone, message = cap.whatsapp[0]
    assert phone == "923001111111"
    assert "Trust Score" in message
    assert "Identity & Links" in message


async def test_broken_link_scores_first_then_prompts_resend(cap, monkeypatch):
    monkeypatch.setattr(vetting, "_check_artifact", cap.make_check_artifact(broken_artifact="github_url"))

    result = await vetting.run_vetting_for_freelancer("923001111111")

    # Score was still computed and stored despite the broken link
    assert result is not None
    assert len(cap.trust_updates) == 1

    _, message = cap.whatsapp[0]
    assert "didn't open" in message
    assert "resend" in message.lower() or "Resend" in message


async def test_revet_touches_only_the_one_artifact_and_refreshes_matches(cap):
    # Seed prior state as if a full vet already ran
    await vetting.run_vetting_for_freelancer("923001111111")
    cap.check_calls.clear()
    cap.trust_updates.clear()
    cap.whatsapp.clear()

    result = await vetting.revet_artifact("923001111111", "github_url")

    assert result is not None
    assert cap.check_calls == ["github_url"]  # only that one artifact re-checked
    assert len(cap.trust_updates) == 1
    assert cap.refresh_calls == ["923001111111"]
    assert "Updated Trust Score" in cap.whatsapp[0][1]


async def test_revet_rejects_unknown_artifact(cap):
    result = await vetting.revet_artifact("923001111111", "not_a_real_field")
    assert result is None
    assert cap.check_calls == []

from app.vetting import extract_first_url, classify_link_field, compute_trust_score, _tier_for_score


def test_extract_first_url():
    assert extract_first_url("here: https://github.com/johndoe check it") == "https://github.com/johndoe"
    assert extract_first_url("no links here") is None


def test_classify_link_field():
    assert classify_link_field("https://github.com/johndoe") == "github_url"
    assert classify_link_field("https://linkedin.com/in/johndoe") == "linkedin_url"
    assert classify_link_field("https://docs.google.com/document/d/abc123") == "cv_url"
    assert classify_link_field("https://drive.google.com/file/d/xyz") == "cv_url"
    assert classify_link_field("https://example.com/portfolio") is None


BASE_FREELANCER = {
    "name": "Jane Doe",
    "linkedin_url": "https://linkedin.com/in/jane",
    "github_url": "https://github.com/jane",
    "cv_url": None,
    "portfolio": None,
    "support_docs": None,
    "skills": None,
    "tools": None,
    "brief_description": None,
}


def test_coverage_rule_two_or_more_links():
    result = compute_trust_score(BASE_FREELANCER, [])
    assert result["trust_breakdown"]["coverage_points"] == 10


def test_coverage_rule_one_link():
    f = {**BASE_FREELANCER, "github_url": None}
    result = compute_trust_score(f, [])
    assert result["trust_breakdown"]["coverage_points"] == 4


def test_coverage_rule_zero_links():
    f = {**BASE_FREELANCER, "github_url": None, "linkedin_url": None}
    result = compute_trust_score(f, [])
    assert result["trust_breakdown"]["coverage_points"] == 0


def test_missing_third_link_costs_nothing_when_two_present():
    # BASE_FREELANCER has linkedin+github (2 of the trio) and no cv_url -
    # coverage should already be maxed at 10, same as if cv_url were also set.
    with_cv = {**BASE_FREELANCER, "cv_url": "https://docs.google.com/document/d/abc"}
    result_without_cv = compute_trust_score(BASE_FREELANCER, [])
    result_with_cv = compute_trust_score(with_cv, [])
    assert result_without_cv["trust_breakdown"]["coverage_points"] == result_with_cv["trust_breakdown"]["coverage_points"] == 10


def test_tier_thresholds():
    assert _tier_for_score(80) == "highly_trusted"
    assert _tier_for_score(60) == "trusted"
    assert _tier_for_score(40) == "basic"
    assert _tier_for_score(10) == "unverified"


def test_skill_proof_uses_content_rows():
    rows = [
        {"artifact": "github_url", "check_type": "liveness", "status": "pass", "evidence": {}},
        {"artifact": "github_url", "check_type": "content", "status": "pass", "evidence": {"skills_found": ["Video Editing"]}},
    ]
    f = {**BASE_FREELANCER, "skills": "video editing"}
    result = compute_trust_score(f, rows)
    assert result["trust_breakdown"]["skill_proof"] > 0
    assert "Video Editing" in result["trust_breakdown"]["local_supported_skills"]


def test_broken_link_recorded_and_no_groq_penalty_when_skipped():
    rows = [
        {"artifact": "github_url", "check_type": "liveness", "status": "fail", "evidence": {"url": "https://github.com/doesnotexist999", "status_code": 404}},
    ]
    result = compute_trust_score(BASE_FREELANCER, rows)
    broken = result["trust_breakdown"]["broken_links"]
    assert len(broken) == 1
    assert broken[0]["artifact"] == "github_url"
    assert broken[0]["status_code"] == 404
    # No Groq claims row -> claims_consistency must be 0, not penalized further
    assert result["trust_breakdown"]["claims_consistency"] == 0
    assert result["trust_breakdown"]["groq_ran"] is False

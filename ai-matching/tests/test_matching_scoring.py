from app.matching import extract_skills, parse_money, parse_hours_per_week, score_match, compute_total_score


def test_extract_skills():
    assert extract_skills("I edit videos in Premiere Pro and After Effects") == ["Video Editing"]
    assert extract_skills("") == []
    assert extract_skills("I run a bakery") == []
    skills = extract_skills("Full-stack web developer, React, Next.js and Node")
    assert set(skills) == {"Web Development", "React", "Node.js", "JavaScript"}


def test_parse_money():
    assert parse_money("$20/hr", "min") == 20
    assert parse_money("$20-30/hr", "max") == 30
    assert parse_money("$20-30/hr", "min") == 20
    assert parse_money("around 1.5k", "max") == 1500
    assert parse_money("depends on the project", "min") is None


def test_parse_hours_per_week():
    assert parse_hours_per_week("20 hours a week") == 20
    assert parse_hours_per_week("full-time") == 40
    assert parse_hours_per_week("part-time") == 20
    assert parse_hours_per_week("30") == 30
    assert parse_hours_per_week("whenever needed") is None


def test_score_match_strong_pairing():
    freelancer = {
        "skills": "video editing, motion graphics",
        "tools": "Premiere Pro, After Effects",
        "rate": "$15/hr",
        "availability": "25 hours a week",
        "preferences": "YouTube channels",
        "brief_description": "I edit long-form YouTube videos and shorts",
    }
    job = {
        "project_description": "Need weekly video editing for my YouTube channel",
        "hire_type": "project-based",
        "budget_hourly": "$20/hr",
        "brief_description": "Ongoing YouTube video editing, 2 videos per week",
    }
    result = score_match(freelancer, job)
    assert result["budget_fit"] is True
    assert result["availability_fit"] is True
    assert "Video Editing" in result["skills_overlap"]
    assert result["score"] >= 80


def test_score_match_weak_pairing_scores_low():
    freelancer = {
        "skills": "content writing, SEO blogs",
        "tools": "Google Docs",
        "rate": "$50/hr",
        "availability": "5 hours a week",
        "brief_description": "SEO blog writer",
    }
    job = {
        "project_description": "Need weekly video editing for my YouTube channel",
        "hire_type": "project-based",
        "budget_hourly": "$20/hr",
    }
    result = score_match(freelancer, job)
    assert result["budget_fit"] is False
    assert result["score"] < 35


def test_score_match_handles_missing_data_neutrally():
    result = score_match({"phone": "1"}, {"phone": "2"})
    assert result["budget_fit"] is True
    assert result["availability_fit"] is True
    assert result["skills_overlap"] == []


def test_compute_total_score_weights():
    assert compute_total_score(80, 60) == round(0.75 * 80 + 0.25 * 60)
    assert compute_total_score(80, None) == round(0.75 * 80)

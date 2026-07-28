from app.deadline import is_ack_only, parse_yes_no_locally, parse_deadline_locally, ensure_deadline_normalized


def test_ack_only():
    assert is_ack_only("ok") is True
    assert is_ack_only("sounds good") is True
    assert is_ack_only("thanks!") is True
    assert is_ack_only("ok, sounds good") is False  # not an exact match
    assert is_ack_only("") is False
    assert is_ack_only(None) is False


def test_yes_no_local():
    assert parse_yes_no_locally("Yes!") is True
    assert parse_yes_no_locally("haan") is True
    assert parse_yes_no_locally("ji") is True
    assert parse_yes_no_locally("bilkul") is True
    assert parse_yes_no_locally("No.") is False
    assert parse_yes_no_locally("nahi") is False
    assert parse_yes_no_locally("not right now") is False
    assert parse_yes_no_locally("noted") is None  # ack word, not a no
    assert parse_yes_no_locally("maybe next month") is None
    assert parse_yes_no_locally("") is None
    assert parse_yes_no_locally(None) is None


def test_deadline_recurring():
    r = parse_deadline_locally("weekly")
    assert r == {"deadline_raw": "weekly", "deadline_normalized": "every week", "is_recurring": True, "confidence": "high"}

    # Quirk inherited faithfully from the original bot: the recurring regex only
    # matches the spelled-out word "two", not the digit "2", so this falls
    # through to the relative-duration pattern instead (non-recurring).
    r2 = parse_deadline_locally("every 2 weeks")
    assert r2["is_recurring"] is False
    assert r2["confidence"] == "high"

    r3 = parse_deadline_locally("every two weeks")
    assert r3["is_recurring"] is True
    assert r3["confidence"] == "high"


def test_deadline_relative_and_date():
    r = parse_deadline_locally("2 weeks")
    assert r["confidence"] == "high" and r["is_recurring"] is False

    r2 = parse_deadline_locally("asap")
    assert r2["deadline_normalized"] == "as soon as possible"

    r3 = parse_deadline_locally("July 15")
    assert r3["confidence"] == "high"


def test_deadline_low_confidence_falls_through():
    r = parse_deadline_locally("hmm let me think about it")
    assert r["confidence"] == "low"


def test_ensure_deadline_normalized_fills_gap():
    ed = {"deadline_raw": "weekly", "deadline": "weekly"}
    ensure_deadline_normalized(ed)
    assert ed["deadline_normalized"] == "every week"
    assert ed["is_recurring"] is True


def test_ensure_deadline_normalized_noop_when_empty():
    ed = {}
    result = ensure_deadline_normalized(ed)
    assert result == {}

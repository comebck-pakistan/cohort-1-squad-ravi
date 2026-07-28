from app.contact_requests import parse_contact_request_command
from app.match_lifecycle import (
    parse_match_lifecycle_command,
    _derive_overall_status,
    _action_to_side_status,
)


def test_parse_contact_request_command():
    assert parse_contact_request_command("request contact 2") == {"rank": 2}
    assert parse_contact_request_command("can I get their whatsapp number") == {"rank": None}
    assert parse_contact_request_command("hello there") is None


def test_parse_match_lifecycle_show_commands():
    assert parse_match_lifecycle_command("show my matches") == {"action": "show", "filter": "all"}
    assert parse_match_lifecycle_command("show accepted") == {"action": "show", "filter": "accepted"}
    assert parse_match_lifecycle_command("show declined") == {"action": "show", "filter": "declined"}


def test_parse_match_lifecycle_action_commands():
    assert parse_match_lifecycle_command("interested 1") == {"action": "interested", "rank": 1}
    assert parse_match_lifecycle_command("hire 2") == {"action": "hire", "rank": 2}

    decline = parse_match_lifecycle_command("decline 3 budget too high")
    assert decline["action"] == "decline"
    assert decline["rank"] == 3
    assert decline["reason_key"] == "budget"

    feedback = parse_match_lifecycle_command("useful 1 yes")
    assert feedback["action"] == "feedback"
    assert feedback["rank"] == 1
    assert feedback["useful"] is True


def test_action_to_side_status_hire_differs_by_role():
    assert _action_to_side_status("hire", "client") == "hired"
    assert _action_to_side_status("hire", "freelancer") == "interested"


def test_derive_overall_status():
    assert _derive_overall_status({"freelancer_status": "interested", "client_status": "shortlisted"}) == "mutual_interest"
    assert _derive_overall_status({"freelancer_status": "declined", "client_status": "interested"}) == "declined"
    assert _derive_overall_status({"freelancer_status": "pending", "client_status": "shortlisted"}) == "shortlisted"
    assert _derive_overall_status({"freelancer_status": "hired", "client_status": "hired"}) == "hired"
    assert _derive_overall_status({}) == "matched"

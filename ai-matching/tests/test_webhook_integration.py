"""
Verifies main.py's actual HTTP layer: webhook payload parsing, message-ID
dedup, non-text message handling, and that BackgroundTasks really does run
handle_incoming_message before TestClient.post() returns (the mechanism the
README claims replicates Node's "ack first, process after" pattern).
"""
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

import app.main as main


def _text_message_payload(message_id: str, phone: str, body: str) -> dict:
    return {
        "entry": [{
            "changes": [{
                "value": {
                    "messages": [{
                        "id": message_id,
                        "from": phone,
                        "type": "text",
                        "text": {"body": body},
                    }],
                },
            }],
        }],
    }


@pytest.fixture
def client(monkeypatch):
    main.PROCESSED_MESSAGE_IDS.clear()
    monkeypatch.setattr(main, "mark_as_read_and_typing", AsyncMock())
    monkeypatch.setattr(main, "send_whatsapp_message", AsyncMock())
    return TestClient(main.app)


def test_webhook_verify_challenge(monkeypatch, client):
    from app.config import config
    monkeypatch.setattr(config.whatsapp, "verify_token", "expected-token")

    ok = client.get("/webhook", params={"hub.mode": "subscribe", "hub.verify_token": "expected-token", "hub.challenge": "abc123"})
    assert ok.status_code == 200
    assert ok.text == "abc123"

    bad = client.get("/webhook", params={"hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "abc123"})
    assert bad.status_code == 403


def test_post_webhook_dispatches_to_handle_incoming_message(client, monkeypatch):
    spy = AsyncMock()
    monkeypatch.setattr(main, "handle_incoming_message", spy)

    payload = _text_message_payload("wamid.1", "923001234567", "hello there")
    response = client.post("/webhook", json=payload)

    assert response.status_code == 200
    # BackgroundTasks must have already run by the time TestClient returns -
    # this is the mechanism replacing Node's "ack then process" pattern.
    spy.assert_awaited_once_with("923001234567", "hello there")


def test_post_webhook_deduplicates_repeat_message_ids(client, monkeypatch):
    spy = AsyncMock()
    monkeypatch.setattr(main, "handle_incoming_message", spy)

    payload = _text_message_payload("wamid.dup", "923001234567", "hi")
    client.post("/webhook", json=payload)
    client.post("/webhook", json=payload)  # same message ID, e.g. a Meta retry

    assert spy.await_count == 1


def test_post_webhook_non_text_message_gets_fallback_reply(client, monkeypatch):
    send_spy = AsyncMock()
    monkeypatch.setattr(main, "send_whatsapp_message", send_spy)
    handle_spy = AsyncMock()
    monkeypatch.setattr(main, "handle_incoming_message", handle_spy)

    payload = {
        "entry": [{"changes": [{"value": {"messages": [{
            "id": "wamid.img", "from": "923001234567", "type": "image", "image": {"id": "img123"},
        }]}}]}],
    }
    response = client.post("/webhook", json=payload)

    assert response.status_code == 200
    send_spy.assert_awaited_once()
    handle_spy.assert_not_awaited()


def test_post_webhook_ignores_status_only_events(client, monkeypatch):
    handle_spy = AsyncMock()
    monkeypatch.setattr(main, "handle_incoming_message", handle_spy)

    payload = {"entry": [{"changes": [{"value": {"statuses": [{"status": "delivered"}]}}]}]}
    response = client.post("/webhook", json=payload)

    assert response.status_code == 200
    handle_spy.assert_not_awaited()


def test_root_endpoint(client):
    response = client.get("/")
    assert response.status_code == 200
    assert response.text == "The bot is running."

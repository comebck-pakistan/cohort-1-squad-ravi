"""reminders.py - abandoned-registration WhatsApp nudges.

Node used setInterval for the background loop; the asyncio-native equivalent
here is a long-lived task (started at FastAPI startup) that sleeps between
runs instead of blocking anything else on the event loop.
"""
import asyncio
from datetime import datetime, timedelta, timezone

from app.config import config
from app.supabase_client import get_inactive_incomplete_conversations, mark_registration_reminder_sent
from app.replies import pick_preferences_reply, pick_reply_text
from app.whatsapp import send_whatsapp_message

REMINDER_PREFIX = "You're just a few minutes away from finishing your registration."

_reminder_task: asyncio.Task | None = None


def _minutes_ago(minutes: int) -> str:
    dt = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    return dt.isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _already_reminded(conversation: dict) -> bool:
    return bool((conversation.get("temp_data") or {}).get("registration_reminder_sent_at"))


def _reply_for_step(conversation: dict) -> str:
    if conversation.get("step") == "collect_preferences":
        return pick_preferences_reply(conversation.get("temp_data") or {})
    return pick_reply_text(conversation.get("step"))["text"]


async def send_registration_reminders() -> None:
    """Sends one-time reminders to users who abandoned onboarding mid-flow.
    The conversation step is not advanced, so their next reply continues
    exactly where they left off."""
    if not config.reminders.registration_reminder_enabled:
        return

    stale_before = _minutes_ago(config.reminders.registration_reminder_after_minutes)
    reachable_after = _minutes_ago(config.reminders.registration_reminder_max_age_minutes)

    conversations = await get_inactive_incomplete_conversations(
        stale_before, config.reminders.registration_reminder_batch_size
    )

    for conversation in conversations:
        if _already_reminded(conversation):
            continue
        updated_at = conversation.get("updated_at")
        if updated_at and updated_at < reachable_after:
            continue

        try:
            await send_whatsapp_message(
                conversation["phone"],
                f"{REMINDER_PREFIX}\n\n{_reply_for_step(conversation)}",
            )
            await mark_registration_reminder_sent(conversation)
            print(f"[reminders] Sent registration reminder to {conversation['phone']} at step {conversation.get('step')}")
        except Exception as err:
            print(f"[reminders] Failed registration reminder for {conversation['phone']}: {err}")


async def _reminder_loop() -> None:
    interval_s = config.reminders.registration_reminder_interval_minutes * 60
    try:
        await send_registration_reminders()
    except Exception as err:
        print(f"[reminders] Initial reminder run failed: {err}")
    while True:
        await asyncio.sleep(interval_s)
        try:
            await send_registration_reminders()
        except Exception as err:
            print(f"[reminders] Reminder loop failed: {err}")


def start_registration_reminder_loop() -> asyncio.Task | None:
    """Starts the lightweight in-process reminder loop for local/Railway deploys."""
    global _reminder_task
    if not config.reminders.registration_reminder_enabled:
        print("[reminders] Registration reminders disabled")
        return None

    print(f"[reminders] Registration reminder loop every {config.reminders.registration_reminder_interval_minutes} minute(s)")
    _reminder_task = asyncio.create_task(_reminder_loop())
    return _reminder_task


def stop_registration_reminder_loop() -> None:
    global _reminder_task
    if _reminder_task:
        _reminder_task.cancel()
        _reminder_task = None

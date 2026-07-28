"""main.py - the webhook (GET verify + POST receive)."""
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, Request, Response
from fastapi.responses import PlainTextResponse

from app.config import config
from app.handle_message import handle_incoming_message
from app.reminders import start_registration_reminder_loop, stop_registration_reminder_loop
from app.whatsapp import mark_as_read_and_typing, send_whatsapp_message

# A dict-as-ordered-set to deduplicate recently seen message IDs. Plain Python
# `set` does NOT preserve insertion order (unlike a JS Set), and the
# oldest-100-eviction logic below depends on insertion order - so this uses a
# dict (insertion-ordered since Python 3.7) with unused values instead.
PROCESSED_MESSAGE_IDS: dict[str, None] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_registration_reminder_loop()
    yield
    stop_registration_reminder_loop()


app = FastAPI(lifespan=lifespan)


# --- Equivalent of "Webhook Verify (GET)" + "Respond Verification Challenge" ---
@app.get("/webhook")
async def verify_webhook(request: Request):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    if mode == "subscribe" and token == config.whatsapp.verify_token:
        print("✅ Webhook verified")
        return PlainTextResponse(challenge or "", status_code=200)
    return Response(status_code=403)


async def _process_webhook_event(body: dict) -> None:
    try:
        entries = body.get("entry") or []
        entry = entries[0] if entries else {}
        changes = entry.get("changes") or []
        change = changes[0] if changes else {}
        value = change.get("value") or {}
        messages = value.get("messages") or []
        message = messages[0] if messages else None

        # Meta also sends delivery/read receipts (value.statuses) on this same URL - ignore those.
        if not message:
            return

        # Deduplication check: ignore if we have already processed this exact message ID
        message_id = message.get("id")
        if message_id in PROCESSED_MESSAGE_IDS:
            print(f"♻️ Skipping duplicate webhook for message ID: {message_id}")
            return
        PROCESSED_MESSAGE_IDS[message_id] = None

        # Keep the dict size manageable (prevent memory leak)
        if len(PROCESSED_MESSAGE_IDS) > 1000:
            # Remove the oldest 100 entries
            for old_id in list(PROCESSED_MESSAGE_IDS.keys())[:100]:
                del PROCESSED_MESSAGE_IDS[old_id]

        try:
            await mark_as_read_and_typing(message_id)
        except Exception as err:
            print(f"Error marking as read/typing: {err}")

        phone = message.get("from")

        if message.get("type") != "text":
            await send_whatsapp_message(
                phone,
                "I can only read text messages right now. Please type out your answer or send a link instead! 📝",
            )
            return

        message_text = (message.get("text") or {}).get("body", "")

        await handle_incoming_message(phone, message_text)
    except Exception as err:
        print(f"Error handling webhook event: {err}")


# --- Equivalent of "Webhook Receive Message (POST)" + "Extract Webhook Data" + "Is Real Message?" ---
@app.post("/webhook")
async def receive_webhook(request: Request, background_tasks: BackgroundTasks):
    body = await request.json()
    # Acknowledge Meta immediately (equivalent of "Acknowledge Meta (200 OK)") -
    # BackgroundTasks runs _process_webhook_event AFTER this response is sent,
    # matching Node's fire-and-forget res.sendStatus(200) pattern.
    background_tasks.add_task(_process_webhook_event, body)
    return Response(status_code=200)


@app.get("/")
async def root():
    return PlainTextResponse("The bot is running.")

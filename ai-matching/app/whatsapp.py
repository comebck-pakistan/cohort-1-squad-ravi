"""whatsapp.py - sending WhatsApp Cloud API replies."""
import json

import httpx

from app.config import config


async def send_whatsapp_message(to_phone: str, body_text: str) -> None:
    """Equivalent of the various 'WhatsApp ... Reply' nodes - one function
    covers them all since they send the same shape of request."""
    url = f"https://graph.facebook.com/v25.0/{config.whatsapp.phone_number_id}/messages"

    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {config.whatsapp.access_token}",
                "Content-Type": "application/json",
            },
            json={
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": to_phone,
                "type": "text",
                "text": {"preview_url": False, "body": body_text},
            },
        )

    if not response.is_success:
        print(f"WhatsApp send error ({response.status_code}): {response.text}")


async def mark_as_read_and_typing(message_id: str) -> None:
    url = f"https://graph.facebook.com/v25.0/{config.whatsapp.phone_number_id}/messages"

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {config.whatsapp.access_token}",
                    "Content-Type": "application/json",
                },
                json={
                    "messaging_product": "whatsapp",
                    "status": "read",
                    "message_id": message_id,
                    "typing_indicator": {"type": "text"},
                },
            )

        if not response.is_success:
            err_text = response.text
            try:
                err_data = json.loads(err_text)
                error = err_data.get("error") or {}
                # Specifically catch and ignore code 100 / "does not exist" error.
                if error.get("code") == 100 and "does not exist" in (error.get("error_data", {}).get("details") or ""):
                    print(f"⚠️ Ignored mark-as-read error: Message ID does not exist yet or was duplicated ({message_id})")
                    return
            except (json.JSONDecodeError, AttributeError):
                pass
            print(f"WhatsApp markAsReadAndTyping error ({response.status_code}): {err_text}")
    except httpx.HTTPError as err:
        print(f"WhatsApp markAsReadAndTyping fetch error: {err}")

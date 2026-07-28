import os

from dotenv import load_dotenv

load_dotenv()


def _required(name: str) -> str | None:
    value = os.environ.get(name)
    if not value:
        print(f"⚠️  Missing environment variable: {name}")
    return value


class WhatsAppConfig:
    verify_token = _required("WHATSAPP_VERIFY_TOKEN")
    phone_number_id = _required("WHATSAPP_PHONE_NUMBER_ID")
    access_token = _required("WHATSAPP_ACCESS_TOKEN")


class SupabaseConfig:
    url = _required("SUPABASE_URL")
    service_role_key = _required("SUPABASE_SERVICE_ROLE_KEY")


class GroqConfig:
    api_key = _required("GROQ_API_KEY")
    model = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")


class GithubConfig:
    token = os.environ.get("GITHUB_TOKEN") or None


class RemindersConfig:
    registration_reminder_enabled = os.environ.get("REGISTRATION_REMINDER_ENABLED", "true") != "false"
    registration_reminder_after_minutes = int(os.environ.get("REGISTRATION_REMINDER_AFTER_MINUTES", "60"))
    registration_reminder_max_age_minutes = int(os.environ.get("REGISTRATION_REMINDER_MAX_AGE_MINUTES", "1380"))
    registration_reminder_interval_minutes = int(os.environ.get("REGISTRATION_REMINDER_INTERVAL_MINUTES", "10"))
    registration_reminder_batch_size = int(os.environ.get("REGISTRATION_REMINDER_BATCH_SIZE", "25"))


class Config:
    port = int(os.environ.get("PORT", "3000"))
    whatsapp = WhatsAppConfig
    supabase = SupabaseConfig
    groq = GroqConfig
    github = GithubConfig
    reminders = RemindersConfig


config = Config()

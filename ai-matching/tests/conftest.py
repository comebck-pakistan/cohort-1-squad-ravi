"""Dummy env vars must be set BEFORE app.config (or anything importing it) is
imported anywhere, since config.py reads os.environ at class-body/import time
and warns loudly on anything missing. conftest.py is imported by pytest before
sibling test modules in the same directory, so this is the right place."""
import os

os.environ.setdefault("WHATSAPP_VERIFY_TOKEN", "test-verify-token")
os.environ.setdefault("WHATSAPP_PHONE_NUMBER_ID", "000000000")
os.environ.setdefault("WHATSAPP_ACCESS_TOKEN", "test-access-token")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("GROQ_API_KEY", "test-groq-key")

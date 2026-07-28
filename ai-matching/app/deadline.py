"""
deadline.py - local (zero-API) deadline parser + ack/yes-no word detection.

Purpose: intercept the collect_deadline step BEFORE calling Groq.
For high-confidence matches we advance immediately and save the API call.
For low-confidence or unusual phrasing we return confidence='low' so the
caller falls through to the normal Groq extraction path.

Zero external dependencies. Zero API calls.
"""
import re

# -- Acknowledgement words ----------------------------------------------------
# A message that is ONLY one of these words is a post-confirmation ack and must
# never be parsed as a new deadline answer.
ACK_EXACT = {
    "ok", "okay", "k", "sure", "yep", "yup", "yes", "yeah", "yea",
    "great", "cool", "nice", "perfect", "perf", "noted",
    "got it", "sounds good", "alright", "works for me",
    "works", "fine", "makes sense", "understood", "aye",
    "thanks", "thank you", "thx", "ty", "cheers", "awesome",
}


def is_ack_only(text: str | None) -> bool:
    """Returns True when the ENTIRE message is just an acknowledgement word/phrase."""
    if not text:
        return False
    t = re.sub(r"[!.]+$", "", text.strip().lower())
    return t in ACK_EXACT


# -- Yes/No answers (for the hiring/working/contact-sharing status steps) ----
# Note: at a yes/no question, many ack-ish words ("yes", "sure", "yep") ARE the
# answer - so the yes/no fast-path must run on these steps instead of the ack
# short-circuit. Includes common Roman-Urdu forms (haan/ji/nahi).
YES_EXACT = {
    "yes", "yeah", "yep", "yup", "yea", "y", "sure", "definitely", "absolutely",
    "of course", "ofcourse", "for sure", "i am", "yes i am", "currently hiring",
    "hiring", "am hiring", "open to work", "available", "haan", "han", "ji", "jee",
    "ji haan", "g", "bilkul",
}
NO_EXACT = {
    "no", "nope", "nah", "n", "not really", "not now", "not yet", "not currently",
    "not at the moment", "no thanks", "not hiring", "not working", "unavailable",
    "not available", "no i am not", "im not", "i'm not", "i am not", "nahi", "nai",
}


def parse_yes_no_locally(text: str | None) -> bool | None:
    """Parses a message as a yes/no answer. Returns True, False, or None when the
    message isn't a clear yes or no (caller falls through to Groq)."""
    if not text:
        return None
    t = re.sub(r"[!.…]+$", "", text.strip().lower()).strip()
    if t in YES_EXACT:
        return True
    if t in NO_EXACT:
        return False
    # Leading-word forms: "yes, right now", "no not yet", "nahi abhi nahi"
    if re.match(r"^(yes|yeah|yep|yup|haan|ji|bilkul)\b", t):
        return True
    if re.match(r"^(no|nope|nah|nahi|not)\b", t):
        return False
    return None


# -- Recurring / cadence patterns ---------------------------------------------
RECURRING_PATTERNS = [
    re.compile(r"\bevery\s+(day|week|month|fortnight|two\s+weeks?|couple\s+of\s+weeks?)", re.I),
    re.compile(r"\b(daily|weekly|bi[-\s]?weekly|fortnightly|monthly|quarterly|annually|yearly)\b", re.I),
    re.compile(r"\bonce\s+a\s+(day|week|month|year)\b", re.I),
    re.compile(r"\b\d+\s+times?\s+(a|per)\s+(day|week|month)\b", re.I),
    re.compile(r"\bper\s+(day|week|month)\b", re.I),
]

# -- Relative / duration patterns ---------------------------------------------
RELATIVE_PATTERNS = [
    re.compile(r"\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(hour|day|week|month|year)s?\b", re.I),
    re.compile(r"\ba\s+(week|month|day|year)\b", re.I),
    re.compile(r"\b(today|tonight|tomorrow|this\s+week|next\s+week|this\s+month|next\s+month|end\s+of\s+(the\s+)?(week|month|year))\b", re.I),
    re.compile(r"\b(asap|a\.s\.a\.p|immediately|right\s+away|urgently?|as\s+soon\s+as\s+possible|rush|quickly?)\b", re.I),
    re.compile(r"\b(soon|shortly)\b", re.I),
    re.compile(r"\bwithin\s+(\d+|a|an)\s+(hour|day|week|month)s?\b", re.I),
    re.compile(r"\bby\s+\w+", re.I),
    re.compile(r"\bin\s+(\d+|a|an|one|two|three)\s+(hour|day|week|month)s?\b", re.I),
]

# -- Explicit calendar date ----------------------------------------------------
DATE_PATTERNS = [
    re.compile(r"\b\d{4}-\d{2}-\d{2}\b"),
    re.compile(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b"),
    re.compile(
        r"\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|"
        r"sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(,?\s*\d{4})?\b",
        re.I,
    ),
    re.compile(
        r"\b\d{1,2}\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|"
        r"sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(,?\s*\d{4})?\b",
        re.I,
    ),
    re.compile(r"\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b", re.I),
    re.compile(r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b", re.I),
    re.compile(r"\bq[1-4](\s+\d{4})?\b", re.I),
]

_CADENCE_MAP = {
    "daily": "every day",
    "weekly": "every week",
    "biweekly": "every 2 weeks",
    "bi-weekly": "every 2 weeks",
    "bi weekly": "every 2 weeks",
    "fortnightly": "every 2 weeks",
    "monthly": "every month",
    "quarterly": "every quarter",
    "annually": "every year",
    "yearly": "every year",
}

_SHORTHAND_MAP = {
    "asap": "as soon as possible",
    "a.s.a.p": "as soon as possible",
    "eow": "end of week",
    "eom": "end of month",
    "eoy": "end of year",
    "tmrw": "tomorrow",
    "tmr": "tomorrow",
    "tonite": "tonight",
}


def _normalize_recurring(lower: str) -> str | None:
    """Maps a recurring cadence word/phrase to a canonical 'every X' form.
    Returns None if not a known recurring pattern (caller falls back to raw)."""
    every_match = re.match(r"^every\s+(.+)$", lower)
    if every_match:
        return f"every {every_match.group(1).strip()}"

    once_a_match = re.match(r"^once\s+a\s+(day|week|month|year)$", lower)
    if once_a_match:
        return f"every {once_a_match.group(1)}"

    times_match = re.match(r"^(\d+)\s+times?\s+(?:a|per)\s+(day|week|month)$", lower)
    if times_match:
        return f"{times_match.group(1)} times per {times_match.group(2)}"

    per_match = re.match(r"^per\s+(day|week|month)$", lower)
    if per_match:
        return f"every {per_match.group(1)}"

    if lower in _CADENCE_MAP:
        return _CADENCE_MAP[lower]

    return None


def _normalize_shorthand(lower: str) -> str | None:
    return _SHORTHAND_MAP.get(lower)


def _normalise_deadline(raw: str, kind: str) -> str:
    """Type-aware normalisation: produces a clean deadline_normalized string
    that is NEVER empty when raw has a value."""
    lower = raw.lower().strip()

    if kind == "recurring":
        return _normalize_recurring(lower) or raw.strip()

    shorthand = _normalize_shorthand(lower)
    if shorthand:
        return shorthand

    return raw.strip()


def parse_deadline_locally(message_text: str | None) -> dict:
    """Try to parse a user's message as a deadline/timeline locally (no API).

    Returns { deadline_raw, deadline_normalized, is_recurring, confidence }
    where confidence is 'high' or 'low'.
    """
    if not message_text:
        return {"deadline_raw": "", "deadline_normalized": "", "is_recurring": False, "confidence": "low"}

    raw = message_text.strip()
    lower = raw.lower()

    for p in RECURRING_PATTERNS:
        if p.search(lower):
            return {
                "deadline_raw": raw,
                "deadline_normalized": _normalise_deadline(raw, "recurring"),
                "is_recurring": True,
                "confidence": "high",
            }

    for p in DATE_PATTERNS:
        if p.search(lower):
            return {
                "deadline_raw": raw,
                "deadline_normalized": _normalise_deadline(raw, "date"),
                "is_recurring": False,
                "confidence": "high",
            }

    for p in RELATIVE_PATTERNS:
        if p.search(lower):
            return {
                "deadline_raw": raw,
                "deadline_normalized": _normalise_deadline(raw, "relative"),
                "is_recurring": False,
                "confidence": "high",
            }

    bare_units = ["week", "month", "day", "year", "tomorrow", "tonight", "today"]
    if lower in bare_units:
        return {
            "deadline_raw": raw,
            "deadline_normalized": _normalise_deadline(raw, "relative"),
            "is_recurring": False,
            "confidence": "high",
        }

    if re.search(r"\d", lower):
        return {
            "deadline_raw": raw,
            "deadline_normalized": _normalise_deadline(raw, "relative"),
            "is_recurring": False,
            "confidence": "high",
        }

    return {"deadline_raw": raw, "deadline_normalized": raw, "is_recurring": False, "confidence": "low"}


def ensure_deadline_normalized(extracted_data: dict | None) -> dict | None:
    """Ensures deadline_normalized is never None/empty when deadline_raw has a value.
    Call this after the Groq path to patch up any fields Groq left as null.
    Mutates and returns extracted_data in place (mirrors the JS helper)."""
    if extracted_data is None:
        return extracted_data

    raw = extracted_data.get("deadline_raw") or extracted_data.get("deadline") or ""
    if not raw:
        return extracted_data

    if extracted_data.get("deadline_normalized"):
        return extracted_data

    local_result = parse_deadline_locally(raw)
    extracted_data["deadline_normalized"] = local_result["deadline_normalized"]

    if extracted_data.get("is_recurring") is None:
        extracted_data["is_recurring"] = local_result["is_recurring"]

    if not extracted_data.get("deadline_raw"):
        extracted_data["deadline_raw"] = raw

    return extracted_data

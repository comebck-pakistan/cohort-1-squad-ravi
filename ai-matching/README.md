# AI Matching Bot — WhatsApp Freelancer/Client Matchmaker

A WhatsApp bot that onboards freelancers and clients through a conversational flow, verifies freelancer claims against real evidence (GitHub, LinkedIn, CV, portfolio), scores freelancer↔job compatibility, and runs the whole match lifecycle (interested → shortlisted → hired → completed) — all over plain WhatsApp messages, backed by FastAPI, Supabase (Postgres), and Groq (LLM).

There is no app to install and no dashboard required for the core loop: a user texts the bot, answers a handful of questions, and gets matched.

---

## 1. What it does, end to end

1. **Onboarding.** A new WhatsApp number messages the bot. It's asked whether it's a *Freelancer* or a *Client*, then walked through a short questionnaire (name, links, skills/project, rate/budget, availability/deadline, preferences, a couple of yes/no gates, a free-text description).
2. **Verification (freelancers only).** The moment a freelancer's profile is saved, the bot fetches their LinkedIn/GitHub/CV/portfolio/support-doc links, checks they're alive and actually belong to that person, and cross-checks claimed skills against real evidence (GitHub repo languages/topics, CV text, portfolio content). This produces a **Trust Score (0–100)**, sent straight back to the freelancer as a transparent breakdown.
3. **Matching.** As soon as a client or freelancer completes onboarding, the bot scores them against every counterpart already in the system (skills 55% / budget 25% / availability 20%), blends in the freelancer's Trust Score (compatibility 75% / trust 25%), and writes the top 5 matches. Both sides get a WhatsApp message with a ranked list, and an LLM-written one-line explanation of *why* each match makes sense.
4. **Lifecycle.** From a match message, either side can reply `interested 1`, `shortlist 1`, `decline 1`, `hire 1`, `completed 1`, or ask `show my matches`. When both sides express interest the bot detects "mutual interest" and nudges both toward hiring. Declines can capture a reason; completed matches can capture a `useful 1 yes/no` feedback signal.
5. **Contact privacy.** Users choose during onboarding whether their WhatsApp number is shown directly on a match or kept private. If private, the other side can `request contact 1`, which pings the owner for a YES/NO before anything is shared.
6. **Nudges.** A background loop watches for conversations that stalled mid-onboarding and sends a one-time reminder that resumes exactly where they left off.

Everything above runs from **one webhook endpoint** (`POST /webhook`) that Meta's WhatsApp Cloud API calls whenever a message arrives.

---

## 2. Architecture

```
                         ┌───────────────────────┐
   WhatsApp user  ────▶  │  Meta WhatsApp Cloud   │
                         │        API             │
                         └───────────┬────────────┘
                                     │ webhook POST
                                     ▼
                         ┌───────────────────────┐
                         │   FastAPI (app/main.py)│
                         │  - verify handshake     │
                         │  - dedup message IDs    │
                         │  - BackgroundTasks      │
                         └───────────┬────────────┘
                                     ▼
                    ┌────────────────────────────────┐
                    │  handle_message.py              │
                    │  the conversation state machine  │
                    │  (ordered fast-path pipeline)     │
                    └───┬───────┬───────┬───────┬─────┘
                        │       │       │       │
             local      │       │       │       │  one Groq call only
             regex      │       │       │       │  when local parsing
             parsers ───┘       │       │       └─ can't decide
          (deadline.py)         │       │
                                │       │
                     matching.py│       │vetting.py
                  (scoring, no  │       │(link checks +
                   API calls)   │       │ trust score)
                                │       │
                                ▼       ▼
                         ┌───────────────────────┐
                         │  Supabase (Postgres)   │
                         │  supabase_client.py     │
                         └───────────────────────┘
                                     │
                                     ▼
                         ┌───────────────────────┐
                         │  Groq LLM API           │
                         │  groq_client.py         │
                         │  (data extraction,       │
                         │   match analysis,        │
                         │   vetting analysis)      │
                         └───────────────────────┘
```

**Key design decision: Groq (the LLM) is the *last resort*, not the first.** Deadlines, yes/no answers, link/skip detection, and acknowledgement words are all parsed locally with regex first (`app/deadline.py`, and inline helpers in `handle_message.py`). Groq is only called when local parsing is ambiguous. Matching scores and Trust Scores are computed **entirely locally** — Groq is only used afterward to generate a human-readable sentence or two on top of an already-final numeric score, and if that call fails, deterministic fallback text is used instead. This keeps the bot fast, cheap, and functional even if the LLM API is down.

---

## 3. Tech stack

| Layer | Choice |
|---|---|
| Web framework | FastAPI + Uvicorn |
| Messaging | Meta WhatsApp Cloud API (`graph.facebook.com`) |
| Database | Supabase (Postgres), via the async `supabase-py` client |
| LLM | Groq (`llama-3.3-70b-versatile` by default), OpenAI-compatible chat completions API |
| HTTP client | `httpx` (async) |
| PDF parsing | `pypdf` (for CV links that are PDFs) |
| Tests | `pytest` + `pytest-asyncio`, fully offline (Supabase/Groq/WhatsApp are swapped for in-memory fakes) |
| Deployment | Railway (`Procfile` included), or any host that can run `uvicorn app.main:app` |

---

## 4. The conversation engine (`app/handle_message.py`)

Every incoming message runs through `handle_incoming_message(phone, message_text)`, an **ordered pipeline** where each stage either fully handles the message and returns, or falls through to the next stage. Order matters:

1. **Reset** — `"reset ai"` / `"reset bot"` wipes all of that phone number's data (conversation, freelancer/client row, matches, notifications, insights, vetting checks) and starts fresh.
2. **Contact-approval / contact-request / match-lifecycle commands** — handled locally, no LLM call (see §7 and §8).
3. **Broken-link fast fix** — once a freelancer is `completed`, sending a bare URL is interpreted as "here's the fixed version of my broken link," classified locally by domain (GitHub/LinkedIn/Drive/Docs/Dropbox/`.pdf`), and only that one artifact is re-vetted.
4. **Active edit state** — if the user is mid-way through changing a field (see §6), the reply is treated as the new value for that field.
5. **Ack-only short-circuit** — a bare "ok"/"thanks"/"👍" at certain steps just re-sends the current question instead of spending an LLM call.
6. **Deadline fast-path** — regex-recognizes dates, durations, and recurring cadences (`app/deadline.py::parse_deadline_locally`) with **zero API calls** when confident.
7. **Yes/No fast-path** — the three boolean gates (`hiring_currently`, `working_currently`, `contact_sharing_allowed`) are parsed locally, including common Roman-Urdu forms (`haan`, `ji`, `nahi`, `bilkul`).
8. **Link/skip fast-path** — LinkedIn/GitHub/CV/support-docs/portfolio steps: a URL or a "skip" is handled with zero API calls.
9. **Groq extraction** — everything else (free text: names, skills, project descriptions, rates, availability, preferences, brief descriptions) goes to Groq with the full conversation context and returns structured JSON: the next step, extracted fields, and whether the message was actually an edit request for a previous field.
10. **Completion** — when the step machine reaches `completed`, the freelancer profile or client job request is written permanently, and:
    - **freelancers** are immediately vetted (`run_vetting_for_freelancer`) and then matched (`run_matching_for_freelancer`)
    - **clients** are matched against every registered freelancer (`run_matching_for_client`)
    - both happen *after* the "All done! 🎉" reply is sent, and a matching/vetting failure never surfaces to the end user (their profile is already saved).

### Onboarding steps

**Shared start:** `welcome → collect_role → collect_name`

**Freelancer branch:**
```
collect_name → collect_linkedin → collect_github → collect_cv → collect_support_docs
             → collect_portfolio → collect_skills → collect_rate → collect_availability
             → collect_preferences → collect_working_status → collect_contact_sharing
             → collect_freelancer_brief_desc → completed
```

**Client branch:**
```
collect_name → collect_project → collect_hire_type
             → collect_budget_fulltime (full-time) | collect_budget_project (project-based)
             → collect_deadline → collect_hiring_status → collect_contact_sharing
             → collect_client_brief_desc → completed
```

Every step's question text is picked at random from a small bank of phrasings (`app/replies.py`) so the bot doesn't sound robotic on retries. The `collect_preferences` step is niche-aware: it detects keywords in what's been collected so far (video editing, web dev, design, writing, social media, VA, UGC/ads, mobile, data/analytics) and asks a tailored preferences question for that niche instead of a generic one.

### Editing answers (`app/handle_message.py` §2/§7, `app/replies.py`)

At any point — including after `completed` — a user can say things like *"actually change my rate to $30"* or just *"I want to edit something."* Groq flags this as `edit_request.is_edit = true` with an optional `target_field` and `provided_value`:
- If a field **and** value are both known, the field is updated immediately (in Supabase and, for link/status fields, side effects run — see below) and a confirmation is sent.
- If only the field is known, the bot asks for the new value and remembers which field it's waiting on (`temp_data.editing_field`).
- If the edit is vague ("I want to change something"), the bot lists everything on file and asks which field.

Editing `hiring_currently`/`working_currently` re-runs matching (or clears matches if flipped to "no"). Editing a link field for a freelancer triggers a single-artifact re-vet (§7) with zero extra Groq cost for the vetting claims.

---

## 5. The Groq layer (`app/groq_client.py`)

Three distinct prompts, each constrained to return **JSON only**:

1. **Data extraction** (`extract_conversation_data`) — given the current step, role, everything collected so far, and today's date, returns `{ role, next_step, extracted_data, edit_request }`. A large `KEY_ALIASES` map normalizes synonyms Groq sometimes returns (`"linkedin"` → `linkedin_url`, `"hourly_rate"` → `rate`, etc.) so a slightly different phrasing from the model never breaks a Supabase write. Boolean fields (`hiring_currently`, `working_currently`, `contact_sharing_allowed`) are coerced from yes/no strings through the same local parser used for the fast-paths, so Groq saying `"yes"` and the fast-path saying `"yes"` produce the identical boolean.
2. **Match analysis** (`generate_match_analyses`) — one batched call per matching run: given the job and up to 5 already-scored candidates, returns a 1–2 sentence explanation, a risk callout, and a recommended next action **per candidate**. If this call fails for any reason, a deterministic template (`_fallback_analysis` in `matching.py`) is used instead — so a Groq outage never blocks a match from being written or delays a WhatsApp message.
3. **Vetting analysis** (`generate_vetting_analysis`) — one call per *full* vet: given claimed skills and evidence snippets pulled from the freelancer's links, returns a consistency score and which claimed skills are supported/unsupported. **Re-vets of a single artifact reuse the stored result of this call** rather than re-running it, so fixing one broken link costs zero extra Groq tokens.

---

## 6. The matching engine (`app/matching.py`)

Runs the instant either side finishes onboarding — fully local, zero API calls for the scoring itself.

**Skill extraction.** Free text (skills, tools, project/brief descriptions) is matched against a curated dictionary of ~25 skill categories (Video Editing, Web Development, React, UI/UX Design, SEO, Virtual Assistance, Data & Analytics, etc.), each backed by a handful of regex patterns. This avoids naive word-overlap scoring, which would be noisy on free-form text.

**Scoring formula** (`score_match`), weighted:
| Component | Weight | Logic |
|---|---|---|
| Skills | 55% | fraction of the job's detected skills the freelancer also has; stays neutral (0.4) if the job text has no recognizable skills at all |
| Budget | 25% | only compared when the client gave an hourly figure; full score if the budget covers the rate, partial credit within 75%, low otherwise; a project-based budget can't be compared to an hourly rate, so it stays neutral |
| Availability | 20% | full-time roles need ≥30 hrs/week, project work needs ≥10; unparseable availability stays neutral |

`score = round(100 × (0.55×skills + 0.25×budget + 0.20×availability))`, and only pairs scoring **≥35%** are kept.

**Trust-weighted total:** `total_score = round(0.75 × compatibility_score + 0.25 × trust_score)` — this is what actually ranks matches (ties broken by raw compatibility). Only the **top 5** matches per run are written.

**Gating:** freelancers only enter matching if they answered "yes" to `working_currently`; clients only get matched if `hiring_currently` is true. Answering "no" removes any existing matches for that phone number until they flip back to "yes."

**Outputs, per run:**
- Upserts into `matches` (keyed on `freelancer_phone, client_phone` so re-scoring after a profile edit updates rather than duplicates)
- In-app rows in `notifications` for both sides
- A WhatsApp message to the client with a ranked list (name, overall %, skill %, trust score, contact line) and to each matched freelancer individually
- For a freelancer completing onboarding, a refreshed `insights` snapshot (profile completeness %, open projects matching their skills, detected skills, trust summary) — used by whatever dashboard reads the `insights` table

---

## 7. The Trust Score / vetting engine (`app/vetting.py`)

Runs once, automatically, right after a freelancer's profile is saved — no user action needed.

**Per-artifact checks** (LinkedIn, GitHub, CV, portfolio, support docs), each producing `liveness` / `identity` / `content` rows:

| Artifact | Liveness check | Identity check | Content/skill check |
|---|---|---|---|
| **GitHub** | `api.github.com/users/{login}` returns 2xx | fuzzy-matches GitHub display name/login against the freelancer's stated name | scans non-fork repo names/descriptions/languages/topics for known skills; notes if any repo was pushed in the last 180 days |
| **LinkedIn** | not fetched (LinkedIn blocks scraping) — always `unverifiable`, honestly labeled as such | fuzzy-matches the profile slug against the stated name | — |
| **CV** | fetches the link (Google Docs export / Drive download / direct); PDFs are parsed with `pypdf` | fuzzy name match against the first ~1500 chars of extracted text | skills found in the extracted text; detects login walls |
| **Portfolio** | YouTube/Vimeo links use their oEmbed API; anything else is fetched and stripped of HTML | matches oEmbed author name, or page text, against the stated name | skills found in page content |
| **Support docs** | liveness only | — | — |

Every HTTP check has a 6-second timeout and treats network/DNS failures as `fail`, timeouts/rate-limits/5xx as `unverifiable` (not necessarily the freelancer's fault), and 404/410 as a genuine `fail`.

**Trust score formula** (0–100), computed from stored rows + the live profile:
| Bucket | Max points | What it measures |
|---|---|---|
| Identity & Links | 45 | coverage (≥2 of LinkedIn/GitHub/CV present = full 10 pts), average liveness across all links (×20), average identity-match confidence (×15) |
| Skill Proof | 35 | overlap between claimed skills and skills actually found in evidence, blended with Groq's own supported/unsupported skill judgement when that call succeeded |
| Claims Consistency | 20 | Groq's consistency_score (0 when Groq wasn't called, e.g. no evidence text was available at all) |

Tiers: **≥75 highly trusted**, **≥55 trusted**, **≥35 basic**, else **unverified**.

The freelancer gets a WhatsApp message with the full breakdown, a tip pointing at whichever bucket is weakest, and — if any link came back broken — the exact link and reason, with an invitation to just resend that one link.

**Single-artifact re-vet** (`revet_artifact`): when a freelancer fixes one broken link (via the edit flow or the bare-URL fast path), only that artifact is re-checked; the stored Groq consistency-claims row is reused (not re-generated); the trust score is recomputed; and `refresh_match_totals_for_freelancer` updates the `total_score` on every existing match row for that freelancer (compatibility scores are untouched — only the trust component moves).

---

## 8. Match lifecycle (`app/match_lifecycle.py`)

Once matches exist, either side can drive them forward with plain WhatsApp replies (rank numbers refer to their own personally ranked match list):

| Command | Effect |
|---|---|
| `show my matches` / `show accepted` / `show declined` / `show shortlisted` / `show pending` | Lists current matches (or a filtered subset) with status, contact line, and the next commands available |
| `interested 1` | Marks that match interested on your side |
| `shortlist 1` (client only in practice) | Marks shortlisted |
| `hire 1` | Client: marks hired. Freelancer: treated as "interested" (only the client can actually hire) |
| `decline 1` | Marks declined; asks for a reason (budget/skills/timing/trust/contact/other) if none was given inline |
| `completed 1` | Marks the engagement completed |
| `useful 1 yes` / `useful 1 no` | Records match-quality feedback, optionally with a reason |
| `request contact 1` | See §9 |

If a rank number is omitted and there's exactly one actionable (non-terminal) match, the bot infers which one you mean; otherwise it asks you to specify.

**Status derivation:** each match tracks `freelancer_status` and `client_status` independently; the overall `status` is derived — `completed` > `hired` > `declined` > `mutual_interest` (both sides positive) > `shortlisted` > `matched`. The moment both sides are independently positive (`interested`/`shortlisted`/`hired`/`completed`), the bot proactively messages **both** sides announcing mutual interest and nudges the client to reply `hire`.

Every lifecycle action also writes an in-app `notifications` row for the other party and sends them a WhatsApp heads-up.

---

## 9. Contact privacy (`app/contact_requests.py`)

Set once during onboarding (`contact_sharing_allowed`, yes/no) and editable later:
- **Yes** → the other side always sees a `wa.me/<number>` link directly in match/lifecycle messages.
- **No** → the other side sees "contact hidden," and can reply `request contact 1`. The target gets a YES/NO approval prompt with match context; approving sends the requester the number immediately, declining tells the requester "no" without revealing why. Duplicate requests for the same match/pair are deduplicated ("I've already asked them").

---

## 10. Abandoned-registration reminders (`app/reminders.py`)

A background `asyncio` task (started at FastAPI startup via the `lifespan` context manager) periodically scans for conversations that are:
- not yet `completed`,
- untouched for at least `REGISTRATION_REMINDER_AFTER_MINUTES` (default 60),
- but not so old they're past `REGISTRATION_REMINDER_MAX_AGE_MINUTES` (default 1380 = 23 hrs — WhatsApp's 24h free-messaging window),
- and haven't already gotten a reminder (`temp_data.registration_reminder_sent_at`).

It sends one nudge repeating the exact question they left off on, without resetting their progress, and never re-nudges the same conversation twice. Fully disableable via `REGISTRATION_REMINDER_ENABLED=false`.

---

## 11. Data model (Supabase / Postgres tables)

The app never creates tables itself — they're expected to already exist in the connected Supabase project. Tables referenced by the code:

| Table | Written by | Purpose |
|---|---|---|
| `conversations` | `save_conversation` | In-progress onboarding state: `phone`, `role`, `step`, `temp_data` (JSON — everything collected so far, plus transient flags like `editing_field`, `pending_match_feedback`), `updated_at` |
| `freelancers` | `save_freelancer_profile`, `update_freelancer_field`, `update_freelancer_trust` | Completed freelancer profiles: links, skills, tools, rate, availability, preferences, `working_currently`, `contact_sharing_allowed`, `trust_score`, `trust_tier`, `trust_breakdown` (JSON) |
| `job_requests` | `save_job_request`, `update_job_request_field` | Completed client job requests: project description, hire type, budget fields, deadline, `hiring_currently`, `contact_sharing_allowed` |
| `matches` | `upsert_matches`, `update_match_lifecycle` | One row per (freelancer, client) pairing: scores, skills overlap, budget/availability fit, AI explanation/risks/action, lifecycle status fields |
| `notifications` | `insert_notifications` | In-app notification feed per phone number (for a dashboard, not sent over WhatsApp) |
| `insights` | `replace_insights` | Freelancer dashboard insight cards (profile strength, market demand, detected skills, trust summary) — replaced wholesale each time they're recomputed |
| `vetting_checks` | `replace_vetting_checks` | One row per (artifact, check_type) from the vetting engine, plus a synthetic `claims`/`groq_consistency` row |
| `contact_requests` | `create_contact_request`, `update_contact_request_status` | Pending/approved/declined contact-sharing requests between a requester and a target |
| `match_feedback` | `upsert_match_feedback` | "Was this match useful?" signal per (match, phone) |

---

## 12. File map

| File | Purpose |
|---|---|
| `app/main.py` | FastAPI app: webhook GET verify + POST receive, message dedup, startup/shutdown |
| `app/handle_message.py` | The whole conversation flow / step machine (§4) |
| `app/groq_client.py` | The Groq calls + system prompts (§5) |
| `app/matching.py` | The matching engine (§6) |
| `app/match_lifecycle.py` | WhatsApp match lifecycle commands, mutual-interest detection, feedback (§8) |
| `app/contact_requests.py` | Contact privacy requests (§9) |
| `app/vetting.py` | Trust Score / link verification engine (§7) |
| `app/deadline.py` | Local (zero-API) parsers: deadlines, ack words, yes/no answers |
| `app/replies.py` | Randomized question bank + niche-aware preferences picker |
| `app/supabase_client.py` | All Supabase reads/writes |
| `app/whatsapp.py` | Sending WhatsApp replies via the Cloud API |
| `app/reminders.py` | Abandoned-registration nudge loop (§10) |
| `app/config.py` | Loads everything from `.env` |

---

## 13. Setup

### Requirements
- Python 3.11+
- A Supabase project with the tables listed in §11 already created
- A Meta WhatsApp Cloud API app + phone number
- A Groq API key

### Install

```bash
cd ai-matching
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install -r requirements-dev.txt
```

### Configure

```bash
cp .env.example .env
```

Fill in `.env` with your real values — see the comments in `.env.example` for what each one is. Never commit `.env` (it's already in `.gitignore`).

| Variable | Required | Notes |
|---|---|---|
| `PORT` | no (default 3000) | local port |
| `WHATSAPP_VERIFY_TOKEN` | yes | any string you choose; must match Meta's webhook config |
| `WHATSAPP_PHONE_NUMBER_ID` | yes | from Meta's WhatsApp app dashboard |
| `WHATSAPP_ACCESS_TOKEN` | yes | from Meta's WhatsApp app dashboard; rotate if ever exposed |
| `SUPABASE_URL` | yes | your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **service role**, not anon — this bypasses RLS, keep it server-side only |
| `GROQ_API_KEY` | yes | from console.groq.com |
| `GROQ_MODEL` | no (default `llama-3.3-70b-versatile`) | any Groq-hosted chat model |
| `GITHUB_TOKEN` | no | raises the GitHub API rate limit used during vetting |
| `REGISTRATION_REMINDER_*` | no | see §10 for defaults |

### Run locally

```bash
uvicorn app.main:app --reload --port 3000
```

### Expose it for WhatsApp testing

```bash
ngrok http 3000
```

Point Meta's webhook config at `https://<ngrok-url>/webhook` with your `WHATSAPP_VERIFY_TOKEN`.

### Deploy (Railway or similar)

Railway auto-detects Python via `requirements.txt`; the included `Procfile` starts it:

```
web: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

Add the same environment variables in the host's dashboard.

---

## 14. Testing

```bash
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest -q
```

47 tests, fully offline (no real network/Supabase/Groq/WhatsApp calls), running in well under a second:

- **`test_parsers.py`** — deadline extraction, ack-word detection, yes/no parsing (including Roman-Urdu forms)
- **`test_matching_scoring.py`** — skill extraction, money/hours parsing, `score_match`, `compute_total_score`
- **`test_vetting_scoring.py`** — URL classification, the coverage rule, tier thresholds, broken-link scoring
- **`test_command_parsers.py`** — contact-request and match-lifecycle command parsers, status derivation
- **`test_matching_pipeline.py`, `test_vetting_flow.py`** — every I/O boundary replaced with in-memory fakes, driving the real matching/vetting functions end-to-end
- **`test_conversation_flow.py`** — drives the real `handle_incoming_message` state machine through full multi-turn onboarding conversations for both a freelancer and a client, using the fake backend in `tests/fakes.py`
- **`test_webhook_integration.py`** — exercises `main.py` via `TestClient`: verify handshake, message-ID dedup, non-text fallback, background-task execution

---

## 15. Notes worth knowing if you touch this code

- **Async Supabase client**: `supabase-py`'s `.execute()` **raises** `postgrest.exceptions.APIError` on failure — every DB helper wraps calls in try/except so a DB hiccup logs and returns a safe default instead of crashing the conversation pipeline.
- **Message-ID dedup uses a `dict`, not a `set`**: insertion order matters for the oldest-100-eviction logic, and Python's `set` doesn't guarantee it.
- **The webhook acks Meta immediately** (`return Response(200)`) and processes the message afterward via FastAPI `BackgroundTasks` — Meta expects a fast 200, and slow LLM/DB calls shouldn't hold up the response.
- **A matching or vetting failure never reaches the user** — by the time either runs, the profile is already saved; failures are logged, not surfaced.
- **Timestamps** use a `_now_iso()` helper producing millisecond-precision `...Z`-suffixed UTC strings to match JS's `toISOString()` shape, in case anything downstream (e.g. a dashboard) expects that exact format.

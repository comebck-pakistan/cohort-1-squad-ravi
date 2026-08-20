# AI Matching Bot — Code-First Rewrite

A plain Node.js/Express rewrite of the original n8n workflow. Same logic, same Supabase tables, same Groq prompt, same randomized replies — just as code instead of visual nodes.

---

## Changelog by Qaim

### Comprehensive Security Hardening & Defenses 🛡️
- **Meta Webhook HMAC SHA-256 Verification:** Cryptographically validates incoming Meta requests via the `X-Hub-Signature-256` header and `WHATSAPP_APP_SECRET` using `crypto.timingSafeEqual` in [`src/security.js`](file:///d:/Cohort%20Projects/WHATSAPP%20MATCHING%20AI/ai%20matching-bot/src/security.js). Blocks webhook spoofing, forged message injections, and unauthorized match tampering.
- **Protected Internal Automation Endpoints:** Secured `/api/check-feedback` and `/api/check-pulse` with `requireCronAuth` middleware. Schedulers must pass `Authorization: Bearer <CRON_SECRET>` or `X-API-Key`. Sanitized error handlers prevent leaking internal database schemas in 500 responses.
- **Multi-Layer Anti-DoS & Anti-Abuse Rate Limiting:**
  - **HTTP IP Rate Limiter:** Added `express-rate-limit` (120 req/min) to defend against volumetric web floods.
  - **WhatsApp Phone Rate Limiter:** Added an in-memory sliding window limiter (`UserRateLimiter`, 10 msgs/min per phone) to prevent rapid message bursts and LLM quota/wallet exhaustion.
- **Server Hardening & Secure Headers:** Integrated `helmet()` to set standard security headers (`HSTS`, `X-Frame-Options`, `X-Content-Type-Options`, and removal of `X-Powered-By`) and bounded JSON request bodies to `64kb`.
- **LLM Prompt Injection Defenses:**
  - Enforced message length capping (`MAX_MESSAGE_LENGTH=1000`) and control character stripping in [`src/groq.js`](file:///d:/Cohort%20Projects/WHATSAPP%20MATCHING%20AI/ai%20matching-bot/src/groq.js).
  - Isolated untrusted user messages inside structured `<user_input>` XML tags with strict system prompt anti-injection rules.
- **URL Sanitization & Safe Portfolio Links:** Strict validator (`isValidUrl` and `sanitizeUrl`) rejects `javascript:`, `file:`, `data:`, or malformed URLs before storing profile/portfolio links.
- **PII Privacy Masking:** Added `maskPhone` to mask sensitive phone numbers in console and server logs (`+1234****89`).
- **Database Row Level Security (RLS):** Added [`migrations/04_enable_rls.sql`](file:///d:/Cohort%20Projects/WHATSAPP%20MATCHING%20AI/ai%20matching-bot/migrations/04_enable_rls.sql) to lock down all tables (`conversations`, `freelancers`, `job_requests`, `matches`, `reviews`, `declined_pairs`), denying public `anon` access.
- **Automated Security Test Suite:** Added [`test/security.test.js`](file:///d:/Cohort%20Projects/WHATSAPP%20MATCHING%20AI/ai%20matching-bot/test/security.test.js) and configured `npm test` across all 5 test suites.

### Weekly "Availability Pulse" Check-In 🟢🟡🔴
- **Automated Weekly Availability Pulse:** Pings active freelancers once a week with a 1-tap WhatsApp capacity check to keep match pools fresh and eliminate ghosting (`src/pulse.js`).
- **Interactive 1-Tap Capacity Buttons:**
  - `[🟢 Available Now]`: Marks profile active, prioritizing them for new client opportunities.
  - `[🟡 Limited Hours]`: Keeps them open for flexible or part-time work with fine-tuned match weighting.
  - `[🔴 Booked / Pause]`: Safely pauses new match notifications so freelancers can focus on current client work without spam.
- **Fast-Path Zero-Token Updates:** Webhook and local message handlers parse pulse button IDs and natural text ("i am available", "pause matches") in 0ms with 0 Groq AI token cost.
- **Matching Engine Boost:** Matching algorithm gives active capacity preference (`available_now`) to ensure clients get fast replies.
- **Automated Background Scanner:** Added [`migrations/03_availability_pulse.sql`](file:///d:/Cohort%20Projects/WHATSAPP%20MATCHING%20AI/ai%20matching-bot/migrations/03_availability_pulse.sql), a 12-hour background scan interval, and an on-demand trigger endpoint (`/api/check-pulse`).

### Project Feedback & Verified Reputation Score ⭐
- **Automated Post-Project Feedback Loop:** When a project's deadline passes, the bot scans connected matches and automatically triggers an interactive WhatsApp review prompt to both Client and Freelancer (`src/feedback.js`).
- **Interactive 1–5 ⭐ Rating Buttons:** Users can submit verified ratings using 1-tap buttons (`[⭐⭐⭐⭐⭐ 5/5]`, `[⭐⭐⭐⭐ 4/5]`, `[⭐ 3 or below]`) or plain text (`1` to `5`).
- **Two-Step Review with Notes:** After rating, users can leave an optional review note with a `[Skip Note]` quick reply.
- **Verified Reputation Math:** Ratings are stored in Supabase (`reviews` table), updating real-time average ratings (`rating_avg`) and completed review counts (`review_count`) on profiles.
- **Dynamic Matching Algorithm Boost:** Freelancers with verified 5-star ratings receive a rule-based boost (up to +15%), and their verified track record is dynamically factored into Groq AI's fit evaluation and match pitch.
- **SQL Migration & Background Scanner:** Added [`migrations/02_feedback_and_reputation.sql`](file:///d:/Cohort%20Projects/WHATSAPP%20MATCHING%20AI/ai%20matching-bot/migrations/02_feedback_and_reputation.sql), a 6-hour automated background scanner, and an on-demand endpoint (`/api/check-feedback`).

### Vector Semantic Search with pgvector in Supabase ⚡
- Integrated **pgvector semantic search** in Supabase to eliminate the limitations of exact keyword matching (e.g. matching "Frontend Engineer" with "React Dev" or "Copywriter" with "Content Creator").
- **100% Free Dense Vector Embeddings:** Generates 384-dimensional vector embeddings using Hugging Face's free serverless inference API with `sentence-transformers/all-MiniLM-L6-v2` (`src/embeddings.js`). Zero paid OpenAI API key required.
- **Sub-10ms Cosine Search:** Queries Supabase using HNSW-indexed cosine distance RPC functions (`match_freelancers` and `match_jobs`) to find the top semantic candidates in milliseconds with 75% less storage overhead.
- **Hybrid AI Reranking:** Vector search retrieves the highest-similarity candidate pool, which is then fed into Groq LLM for fine-grained budget fit, skill evaluation, and one-sentence fit reasoning.
- **Graceful Fallback:** If `HUGGINGFACE_API_KEY` is not set or pgvector RPCs are not yet created in the database, the matching engine automatically and silently falls back to standard rule-based matching without crashing.
- **SQL Migration Provided:** Added [`migrations/01_pgvector_setup.sql`](file:///d:/Cohort%20Projects/WHATSAPP%20MATCHING%20AI/ai%20matching-bot/migrations/01_pgvector_setup.sql) with ready-to-run DDL for the vector extension, 384-dim embedding columns, HNSW cosine indexes, and matching RPC functions.

### WhatsApp Interactive Buttons & Quick-Reply Menus 🔘
- Added full **WhatsApp Cloud API Interactive Quick-Reply Button** support across onboarding, match notifications, and availability prompts.
- **Onboarding Buttons:** 1-tap quick replies for Role selection (`[🛠️ Freelancer]` / `[💼 Client]`), Hire type (`[📦 Project-based]` / `[⏱️ Full-time]`), Availability (`[⚡ 40h/wk Full-time]`, `[⏳ 20h/wk Part-time]`, `[🌱 Flexible (10h/wk)]`), Deadlines (`[⚡ ASAP / Urgent]`, `[📅 In 1-2 Weeks]`, `[🔄 Recurring]`), Skips (`[Skip for now]`, `[⏭️ Skip / None]`), and Preferences (`[🌍 Open to anything]`).
- **Match Notification CTAs:** Sent interactive `[✅ Interested]` and `[❌ Not Interested]` buttons for fast 1-tap match acceptance or passing.
- **Availability Management:** Interactive `[🟢 Keep Active]` and `[⏸️ Pause Matches]` buttons for return-to-pool prompts.
- **Webhook & Local Fast-Path:** Webhook processes `button_reply` payloads directly, resolving selections with 0ms latency and 0 API token cost.

### ~80% Reduction in AI Token Usage ⚡
- Added a dedicated local state handler (`src/localHandler.js`) to parse onboarding steps (names, skills, rates, portfolio links, standard roles, and button IDs) locally using deterministic regex and token parsing.
- Groq AI is now used strictly as a fallback for ambiguous inputs and complex open-ended questions, keeping costs minimal while maintaining high intelligence.

### Improved Data & Range Handling 📊
- **Budget & Rate Ranges:** Correctly extracts full ranges like `$300 - $500` or `$20 - $40/hr` instead of truncating to the first number.
- **Vague Answers Saved:** Preserves open-ended responses like "I don't know", "not sure", or "open to negotiation" directly in Supabase without throwing errors.

### Smart Deadline Date Estimation 📅
- Added relative date calculation (`src/deadline.js`). Expressions like "by the end of this week", "next week", "tomorrow", or "end of month" now automatically estimate and record exact target dates (e.g., `by end of week (2026-08-16)`).
- Rebuilt deadline extraction to understand any phrasing style, not just hardcoded keywords — covers specific dates (e.g. "July 15"), relative durations (e.g. "2 weeks", "3 days"), and recurring patterns (e.g. "weekly", "every week").
- Fixed `deadline_normalized` always returning `null` for recurring/keyword-based answers (e.g. "weekly") — now correctly populates a clean normalized value for every valid deadline type.
- Added acknowledgment-word detection ("okay", "ok", "sounds good", etc.) so acknowledgments no longer get misinterpreted as new answers.

### Edit Flow ✏️
- Users can update their name, rate, budget, deadline, portfolio, or any other saved field at any point — mid-onboarding or after profile completion — by typing things like "edit my info," "change my rate," or "change my deadline." Works for both Freelancers and Clients, across every collected field.
- Fixed a bug where editing any field after reaching the confirmation/completed step caused the bot to fall through into the normal question sequence and re-ask unrelated questions instead of returning to the completed state.
- Ensured acknowledgments sent after a successful edit are treated as pure confirmation and don't get re-parsed as new field answers.

### Data Persistence (Supabase) 🗄️
- Fixed conversations reaching `step = "completed"` not being copied into the permanent `freelancers` / `job_requests` tables.
- Added upsert-by-phone logic for both `freelancers` and `job_requests` so repeat conversations update existing rows instead of failing or duplicating.
- Corrected the `job_requests` table schema to match what the application actually writes (`phone`, `name`, `project_description`, `hire_type`, `budget_project`, `budget_hourly`, `project_count`, `deadline`, `deadline_normalized`, `is_recurring`, `brief_description`).
- Removed the `NOT NULL` constraint on legacy `client_phone` column and fixed missing `updated_at` column errors.

### Conversation Flow & UX Polish 💬
- **Conversational Tone:** Reworded `collect_hire_type` prompts to sound like a natural buddy ("Is your work full-time, or is that project-based work?") instead of a rigid bot.
- **Conversation State Persistence:** User roles and state machine memory are preserved across all turns and never dropped mid-onboarding.
- **Typing effect:** Simulates a natural typing delay before sending replies.
- **Interactive Icebreakers & Inactivity Gate:** Returning users inactive for 14+ days receive interactive welcome menus.
- **Randomized question phrasing:** Each onboarding step pulls from multiple pre-written variants at random.
- **Niche-Specific Preferences:** Tailored closing questions for video editing, web development, graphic design, writing, social media, VA, UGC, and mobile dev.

### Matching Layer (Hybrid Rule + AI) 🎯
- Automatic scoring of freelancers against job requests using a hybrid rule-based (40%) + AI Groq scoring (60%) pipeline.
- Match persistence in `matches` table with status tracking (`awaiting_response`, `awaiting_other`, `connected`, `declined`).
- Bidirectional matching: finds matches when clients post jobs AND when freelancers complete registration.
- On-demand match checks via "show my matches".

---

## What Each File Does

| File | Purpose |
|---|---|
| `src/server.js` | Webhook server (GET verify + POST receive) with Helmet headers, rate limiting, and HMAC signature verification |
| `src/security.js` | Webhook HMAC verification, cron bearer auth, per-phone rate limiter, PII log masker, and URL sanitizers |
| `src/handlers/handleMessage.js` | Core conversation flow, step machine, match replies, and availability management |
| `src/handlers/icebreakerHandler.js` | Handler for interactive list menus, icebreakers, and returning-user welcome options |
| `src/localHandler.js` | Fast-path local parsing for ~80% of messages (roles, hire types, skills, rates, buttons) without AI calls |
| `src/deadline.js` | Local deadline/timeline parser and relative date estimator |
| `src/embeddings.js` | Dense vector embedding generator and semantic text formatters for profiles and jobs |
| `src/feedback.js` | Automated post-deadline feedback trigger scanner and interactive rating prompts |
| `src/pulse.js` | Automated weekly availability pulse scanner and 1-tap capacity management |
| `src/groq.js` | Groq LLM fallback with prompt injection defenses and data extraction schema enforcement |
| `src/matching.js` | Hybrid vector semantic search + verified reputation boost + rule-based + AI scoring engine |
| `src/replies.js` | Randomized question banks, niche variants, and interactive button configurations |
| `src/supabase.js` | Supabase database operations (profiles, job requests, reviews, reputation, matches, conversations) |
| `src/whatsapp.js` | WhatsApp Cloud API integration (text messages, interactive buttons, list menus, typing status) |
| `src/config.js` | Environment configuration, fail-fast startup validator, and matching weights |
| `migrations/01_pgvector_setup.sql` | PostgreSQL DDL for pgvector extension, 384-dim embedding columns, and RPC search functions |
| `migrations/02_feedback_and_reputation.sql` | PostgreSQL DDL for reviews table, reputation metrics, and match feedback tracking |
| `migrations/03_availability_pulse.sql` | PostgreSQL DDL for freelancer availability status and last pulse check tracking |
| `migrations/04_enable_rls.sql` | PostgreSQL DDL for Row Level Security (RLS) locking down public anon access on all tables |
| `test/security.test.js` | Automated unit tests for webhook HMAC verification, cron auth, rate limiting, URL validation, and PII masking |

---

## Setup Guide

### 1. Install Node.js

Download the **LTS version** from [nodejs.org](https://nodejs.org). Verify it worked:
```bash
node -v
npm -v
```

### 2. Get the code

Clone the repo:
```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
```
Or download it as a ZIP from GitHub's green **Code** button and extract it.

### 3. Install dependencies

Inside the project folder:
```bash
npm install
```
This installs `express`, `@supabase/supabase-js`, `dotenv`, `helmet`, and `express-rate-limit`.

### 4. Set up environment variables

```bash
cp .env.example .env
```
Then fill in `.env` with your real values:

| Variable | Required? | Where to get it |
|---|:---:|---|
| `WHATSAPP_VERIFY_TOKEN` | Yes | Make this up yourself — any secret string for webhook challenge |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes | developers.facebook.com → your app → WhatsApp → API Setup |
| `WHATSAPP_ACCESS_TOKEN` | Yes | Same page as above (use System User permanent token in production) |
| `WHATSAPP_APP_SECRET` | Recommended | developers.facebook.com → App Settings → Basic → App Secret (for HMAC SHA-256 verification) |
| `CRON_SECRET` | Recommended | Any random secure secret string (protects `/api/check-feedback` and `/api/check-pulse`) |
| `SUPABASE_URL` | Yes | supabase.com → your project → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Same page (the **service_role** key, not "anon") |
| `GROQ_KEY` / `GROQ_API_KEY` | Yes | console.groq.com → API Keys |
| `GROQ_MODEL` | No | Default: `qwen/qwen3.6-27b` (100% Free on Groq, high rate-limit) |
| `MATCH_SEARCH_COOLDOWN_MS` | No | Default: `600000` (10 minutes on-demand match cooldown) |
| `HUGGINGFACE_API_KEY` | Optional | huggingface.co → Settings → Access Tokens (for pgvector embeddings) |

`.env` is in `.gitignore` — it never gets pushed to GitHub.

---

### 5. Set up Supabase (Database & RLS)

Go to Supabase → **SQL Editor** → New Query, and execute the migration files:

1. **Base Tables:** Run the baseline tables setup.
2. **Vector Embeddings (01):** Run [`migrations/01_pgvector_setup.sql`](file:///d:/Cohort%20Projects/WHATSAPP%20MATCHING%20AI/ai%20matching-bot/migrations/01_pgvector_setup.sql).
3. **Feedback & Reputation (02):** Run [`migrations/02_feedback_and_reputation.sql`](file:///d:/Cohort%20Projects/WHATSAPP%20MATCHING%20AI/ai%20matching-bot/migrations/02_feedback_and_reputation.sql).
4. **Availability Pulse (03):** Run [`migrations/03_availability_pulse.sql`](file:///d:/Cohort%20Projects/WHATSAPP%20MATCHING%20AI/ai%20matching-bot/migrations/03_availability_pulse.sql).
5. **Row Level Security (04):** Run [`migrations/04_enable_rls.sql`](file:///d:/Cohort%20Projects/WHATSAPP%20MATCHING%20AI/ai%20matching-bot/migrations/04_enable_rls.sql) to restrict public table access.

---

### 6. Run Unit & Security Tests

Run the complete test suite locally:
```bash
npm test
```
Runs 5 comprehensive test suites:
- Security (HMAC, Cron auth, Rate limits, URL validation, PII masking)
- Interactive buttons & quick replies
- Feedback & reputation scoring
- Availability pulse parsing
- Vector semantic search embeddings & cosine similarity

---

### 7. Run it locally

```bash
npm run dev
```
You should see `🚀 The bot listening on port 3000`.

### 8. Expose it to the internet for testing (ngrok)

WhatsApp needs a public HTTPS URL:

1. In a second terminal: `ngrok http 3000`
2. Copy the generated URL (e.g. `https://abcd1234.ngrok-free.app`)
3. In Meta → WhatsApp → Configuration → Webhook, enter `https://abcd1234.ngrok-free.app/webhook` + your `WHATSAPP_VERIFY_TOKEN` → **Verify and Save**

---

### 9. Deploy live (Railway)

1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
2. Variables tab → add all environment variables from `.env`
3. Railway gives you a public URL like `https://your-bot-production.up.railway.app`
4. Use `https://your-bot-production.up.railway.app/webhook` in Meta Dashboard

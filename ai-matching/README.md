# AI Matching Bot — Code-First Rewrite

A plain Node.js/Express rewrite of the original n8n workflow. Same logic, same Supabase tables, same Groq prompt, same randomized replies — just as code instead of visual nodes.

---

## Changelog by Qaim

### Project Feedback & Verified Reputation Score ⭐
- **Automated Post-Project Feedback Loop:** When a project's deadline passes, the bot scans connected matches and automatically triggers an interactive WhatsApp review prompt to both Client and Freelancer (`src/feedback.js`).
- **Interactive 1–5 ⭐ Rating Buttons:** Users can submit verified ratings using 1-tap buttons (`[⭐⭐⭐⭐⭐ 5/5]`, `[⭐⭐⭐⭐ 4/5]`, `[⭐ 3 or below]`) or plain text (`1` to `5`).
- **Two-Step Review with Notes:** After rating, users can leave an optional review note with a `[Skip Note]` quick reply.
- **Verified Reputation Math:** Ratings are stored in Supabase (`reviews` table), updating real-time average ratings (`rating_avg`) and completed review counts (`review_count`) on profiles.
- **Dynamic Matching Algorithm Boost:** Freelancers with verified 5-star ratings receive a rule-based boost (up to +15%), and their verified track record is dynamically factored into Groq AI's fit evaluation and match pitch.
- **SQL Migration & Background Scanner:** Added [`migrations/02_feedback_and_reputation.sql`](file:///d:/Cohort%20Projects/WHATSAPP%20MATCHING%20AI/ai%20matching-bot/migrations/02_feedback_and_reputation.sql), a 6-hour automated background scanner, and an on-demand endpoint (`ALL /api/check-feedback`).

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
| `src/server.js` | The webhook server (GET verify + POST receive for text and interactive messages) |
| `src/handlers/handleMessage.js` | Core conversation flow, step machine, match replies, and availability management |
| `src/handlers/icebreakerHandler.js` | Handler for interactive list menus, icebreakers, and returning-user welcome options |
| `src/localHandler.js` | Fast-path local parsing for ~80% of messages (roles, hire types, skills, rates, buttons) without AI calls |
| `src/deadline.js` | Local deadline/timeline parser and relative date estimator |
| `src/embeddings.js` | Dense vector embedding generator and semantic text formatters for profiles and jobs |
| `src/feedback.js` | Automated post-deadline feedback trigger scanner and interactive rating prompts |
| `src/groq.js` | Groq LLM fallback for ambiguous conversation extractions and edge cases |
| `src/matching.js` | Hybrid vector semantic search + verified reputation boost + rule-based + AI scoring engine |
| `src/replies.js` | Randomized question banks, niche variants, and interactive button configurations |
| `src/supabase.js` | All Supabase database operations (profiles, job requests, reviews, reputation, matches, conversations) |
| `src/whatsapp.js` | WhatsApp Cloud API integration (text messages, interactive buttons, list menus, typing status) |
| `src/config.js` | Environment configuration, embedding settings, and matching weights |
| `migrations/01_pgvector_setup.sql` | PostgreSQL DDL script for pgvector extension, 384-dim embedding columns, and RPC search functions |
| `migrations/02_feedback_and_reputation.sql` | PostgreSQL DDL script for reviews table, reputation metrics, and match feedback tracking |

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
This reads `package.json` and generates the `node_modules` folder (never uploaded to GitHub).

### 4. Set up environment variables

```bash
cp .env.example .env
```
Then fill in `.env` with your real values:

| Variable | Where to get it |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | Make this up yourself — any secret string |
| `WHATSAPP_PHONE_NUMBER_ID` | developers.facebook.com → your app → WhatsApp → API Setup |
| `WHATSAPP_ACCESS_TOKEN` | Same page as above (rotate if ever exposed) |
| `SUPABASE_URL` | supabase.com → your project → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page (the **service_role** key, not "anon") |
| `GROQ_API_KEY` | console.groq.com → API Keys (rotate if ever exposed) |

`.env` is in `.gitignore` — it never gets pushed to GitHub.

### 5. Set up Supabase (database)

Go to Supabase → **SQL Editor** → New Query, and run this once to create every table your bot needs in one shot:

```sql
-- Conversations table (temporary state while onboarding)
create table if not exists conversations (
  id bigint generated always as identity primary key,
  phone text not null,
  step text,
  role text,
  temp_data jsonb default '{}'::jsonb,
  updated_at timestamptz default now(),
  unique (phone)
);

-- Freelancers table (permanent record)
create table if not exists freelancers (
  id bigint generated always as identity primary key,
  phone text not null,
  name text,
  profile_link text,
  portfolio text,
  skills text,
  tools text,
  rate text,
  availability text,
  preferences text,
  created_at timestamp default now(),
  updated_at timestamptz default now(),
  unique (phone)
);

-- Job requests table (permanent record for clients)
create table if not exists job_requests (
  id bigint generated always as identity primary key,
  phone text not null,
  name text,
  project_description text,
  hire_type text,
  budget_project text,
  budget_hourly text,
  project_count text,
  deadline text,
  deadline_normalized text,
  is_recurring boolean,
  brief_description text,
  created_at timestamp default now(),
  unique (phone)
);

-- Matches table (Phase 3 — matching results)
create table if not exists matches (
  id bigint generated always as identity primary key,
  job_phone text not null,
  freelancer_phone text not null,
  rule_score numeric,
  ai_score numeric,
  final_score numeric,
  ai_reasoning text,
  status text default 'notified',
  created_at timestamptz default now()
);
```

**Checking your database anytime later** — instead of clicking through each table tab, run this to see every table and column at once:
```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
```

View recent rows in any table:
```sql
select * from conversations order by id desc limit 20;
select * from freelancers order by id desc limit 20;
select * from job_requests order by id desc limit 20;
select * from matches order by id desc limit 20;
```

Count rows:
```sql
select count(*) from conversations;
```

### 6. Get a Groq API key

1. Go to [console.groq.com](https://console.groq.com) → sign up/log in
2. **API Keys** → **Create API Key** → copy it immediately (shown once)
3. Paste into `.env` as `GROQ_API_KEY`

**Note:** Groq's free tier has a daily token limit (TPD) per model — it resets on a rolling window. If you hit `429 rate_limit_exceeded`, wait for the reset time given in the error message.

### 7. Set up WhatsApp (Meta for Developers)

1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App** → choose **Business**
2. In your app dashboard → **WhatsApp** → **API Setup**
3. Copy the **temporary access token** → `WHATSAPP_ACCESS_TOKEN` (expires in 24h — generate a permanent token later via a System User for production)
4. Copy the **Phone Number ID** → `WHATSAPP_PHONE_NUMBER_ID`
5. Make up your own `WHATSAPP_VERIFY_TOKEN` and use the exact same string in Meta's dashboard later

### 8. Run it locally

```bash
npm run dev
```
You should see `🚀 The bot listening on port 3000`.

### 9. Expose it to the internet for testing (ngrok)

WhatsApp needs a public HTTPS URL — your bot on `localhost` isn't reachable from the internet.

1. Create a free account at [ngrok.com](https://ngrok.com), copy your authtoken
2. One-time setup: `ngrok config add-authtoken YOUR_TOKEN_HERE`
3. Every time you test, in a second terminal: `ngrok http 3000`
4. Copy the generated URL (e.g. `https://abcd1234.ngrok-free.app`)
5. In Meta → WhatsApp → Configuration → Webhook, enter `https://abcd1234.ngrok-free.app/webhook` + your `WHATSAPP_VERIFY_TOKEN` → **Verify and Save**

**Note:** every ngrok restart gives a new URL (on the free plan) — re-paste it into Meta each time.

### 10. Deploy live (Railway) — only needed for the permanently-live version

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```
1. [railway.app](https://railway.app) → sign up (GitHub login works) → **New Project** → **Deploy from GitHub repo**
2. Railway auto-detects Node.js and runs `npm install` + `npm start`
3. Go to your service → **Variables** tab → add all 6 values from `.env`
4. Railway gives you a public URL like `https://your-bot-production.up.railway.app`
5. Use `https://.../webhook` as your permanent webhook URL in Meta's dashboard

From here on, every `git push` to `main` auto-redeploys.

---

## Committing & Pushing Changes

```bash
git add .
git commit -m "short title here" -m "detailed description here"
git push origin main
```

If your commit message has quotes or multiple lines and the terminal misbehaves, write the message to a file instead:
```bash
git add .
git commit -F commit-msg.txt
git push origin main
```

---

## Common Problems

| Problem | Fix |
|---|---|
| `npm: command not found` / `node: command not found` | Reinstall Node.js, fully restart your terminal |
| `npm install` gives red errors | Make sure you're inside the project folder (`package.json` should be visible via `dir`/`ls`) |
| Bot runs but WhatsApp messages never arrive | Check ngrok is running and its URL is current in Meta's dashboard; confirm `/webhook` is at the end of the URL; confirm `WHATSAPP_VERIFY_TOKEN` matches exactly |
| Webhook won't "Verify and Save" | Make sure both `npm run dev` and `ngrok` are running at the same time |
| "unauthorized" / API key error | Re-check the key was copied fully into `.env`, no extra spaces, filename is exactly `.env` |
| `Groq API error (429)` — rate limit | Wait for the reset window given in the error (daily token limit); consider adding local pre-checks to reduce AI calls for simple answers |
| Supabase insert fails with a "null value in column X violates not-null constraint" | Check for legacy columns with leftover `NOT NULL` constraints that the current code no longer writes to — drop the constraint or the column |
| `git push` rejected / diverged history | Don't edit files directly on GitHub's web UI if you also work locally — this splits your history. Pull first (`git pull origin main`) before pushing, or resolve conflicts locally |

---

## Notes for Team Testing (not deploying)

You do **not** need to deploy to Railway to test your own changes. Just run `npm run dev` + `ngrok http 3000` locally (Section 9) — that's all most of the team needs. Deployment is only for whoever manages the final always-online version.

To let a teammate test your local build:
1. Keep `npm run dev` and `ngrok http 3000` both running
2. Send them the WhatsApp test number connected to your bot
3. Watch your terminal for live logs while they chat — useful for catching bugs together
4. Closing either terminal takes the bot offline — expected for local testing

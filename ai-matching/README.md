# AI Matching Bot — Code-First Rewrite
 
A plain Node.js/Express rewrite of the original n8n workflow. Same logic, same Supabase tables, same Groq prompt, same randomized replies — just as code instead of visual nodes.
 
---
 
## Changelog by Qaim
 
### Deadline & Timeline Parsing
- Rebuilt deadline extraction to understand any phrasing style, not just hardcoded keywords — covers specific dates (e.g. "July 15"), relative durations (e.g. "2 weeks", "3 days"), and recurring patterns (e.g. "weekly", "every week")
- Added a local, non-AI keyword pre-check that runs before the Groq call — catches common/obvious deadline phrasing instantly and for free, only falling through to AI extraction for genuinely ambiguous answers
- Fixed `deadline_normalized` always returning `null` for recurring/keyword-based answers (e.g. "weekly") — now correctly populates a clean normalized value for every valid deadline type (date, duration, or recurring)
- Fixed the deadline step asking two different but overlapping questions for the same field — now maps to a single question with no duplication
- Added acknowledgment-word detection ("okay", "ok", "sounds good", etc.) so these no longer get misinterpreted as new answers or re-trigger already-answered questions
- Bot now understands phrases like "this week," "in 2 days," "next month," "asap," etc. and calculates the actual target date (`deadline_date` / `availability_date`) instead of only storing raw text
### Edit Flow
- Users can update their name, rate, budget, deadline, portfolio, or any other saved field at any point — mid-onboarding or after profile completion — by typing things like "edit my info," "change my rate," or "change my deadline." Works for both Freelancers and Clients, across every collected field
- Fixed a bug where editing any field after reaching the confirmation/completed step caused the bot to fall through into the normal question sequence and re-ask unrelated questions instead of returning to the completed state
- Ensured acknowledgments sent after a successful edit are treated as pure confirmation and don't get re-parsed as new field answers
### Data Persistence (Supabase)
- Fixed conversations reaching `step = "completed"` not being copied into the permanent `freelancers` / `job_requests` tables — data was previously stuck only in the temporary `conversations.temp_data` column
- Added upsert-by-phone logic for both `freelancers` and `job_requests` so repeat conversations update existing rows instead of failing or duplicating
- Corrected the `job_requests` table schema to match what the application actually writes — added `phone`, `name`, `project_description`, `hire_type`, `budget_project`, `budget_hourly`, `project_count`, `deadline`, `deadline_normalized`, `is_recurring`, and `brief_description` columns
- Removed the `NOT NULL` constraint on the legacy `client_phone` column, which was silently failing every `job_requests` insert since the app writes to the `phone` column instead
- Fixed `name`, `hire_type`, and `brief_description` fields not being saved to `temp_data` at all in certain cases — specifically short answers (e.g. a two-letter name) and answers given after a clarification re-ask
- Fixed a Supabase error where the `freelancers` table was missing the `updated_at` column, which was blocking field updates
### Conversation Flow & UX
- **Typing effect** — bot now simulates a natural typing delay before sending replies instead of responding instantly
- **Skip option for LinkedIn/CV step** — users can skip this step during onboarding instead of being forced through it
- **Reset flow fixed** — `reset ai` now correctly clears prior conversation/freelancer rows and restarts onboarding cleanly
- **Conversation-state memory fixed** — bot previously failed to remember earlier onboarding steps and looped back to "Freelancer or Client?"; now correctly progresses through each step using saved conversation state
- **Randomized question phrasing** — each onboarding step pulls from multiple pre-written variants at random, so the conversation feels more natural and less scripted
- **Natural post-completion replies** — after a profile is complete, follow-ups like "perfect" or "thanks" get a natural, varied response instead of repeating the setup-complete message
- **Unsupported file type handling** — image/audio/video/non-text messages get a reply asking for text or a link instead
- **`markAsReadAndTyping` error fix** — WhatsApp's API occasionally returns a "message does not exist" error (code 100) on duplicate/late webhook events; now caught and logged quietly instead of throwing
### Closing Question / Personalization
- Replaced the vague, example-free closing question ("any project types or regions you prefer working with?") with a bank of randomized, niche-specific variants covering video editing, web development, graphic design, content writing, social media management, virtual assistant work, UGC/ad creation, and a generic catch-all
- Added local keyword matching against the user's already-collected project description to select the most relevant variant for their specific niche — implemented in plain JS, no additional AI/API calls
- Added random fallback variant selection for cases where no keyword match is found, so the question is never blank or broken
### AI Provider
- Currently running on **Groq only** (`llama-3.3-70b-versatile`)
- OpenRouter integration was evaluated as a potential backup provider for when Groq's daily token limit (TPD) is hit — **not yet wired in as an active fallback**, planned for a future update
---
 
## What Each File Does
 
| File | Purpose |
|---|---|
| `src/server.js` | The webhook (GET verify + POST receive) |
| `src/handlers/handleMessage.js` | The whole conversation flow / step machine |
| `src/groq.js` | The Groq calls + system prompts (data extraction, match analysis, vetting analysis) |
| `src/matching.js` | The matching engine: skill scoring, trust-weighted match rows, notifications, insights |
| `src/vetting.js` | Automated freelancer link checks, skill-proof Trust Score, broken-link re-vets |
| `src/deadline.js` | Local (zero-API) parsers: deadlines, ack words, yes/no answers |
| `src/replies.js` | The randomized question bank |
| `src/supabase.js` | All Supabase reads/writes (search, upsert, create, delete) |
| `src/whatsapp.js` | Sending WhatsApp replies |
| `src/config.js` | Loads everything from `.env` (no secrets hardcoded) |

---

## How the Matching Engine Works

When a conversation reaches `completed`, the bot sends the usual "All done! 🎉" reply and then runs matching:

- **Client completes** → every registered freelancer is scored against the new job request. The top 5 (score ≥ 35%) are written to `matches`, both sides get a `notifications` row, the client gets a WhatsApp summary listing the matched freelancers (with contact links), and each matched freelancer gets a WhatsApp heads-up about the project.
- **Freelancer completes** → every open job request is scored against the new profile. Top matches are written to `matches`, the freelancer gets a WhatsApp summary of matching projects, clients get in-app notifications (no WhatsApp blast), and the freelancer's dashboard `insights` are regenerated.

**Hiring / Working status gate:** onboarding asks clients "are you actively hiring right now?" (`hiring_currently`) and freelancers "are you currently open to work?" (`working_currently`). Only users who answered **yes** take part in matching — inactive clients aren't shown to freelancers and vice versa. Users can flip the flag anytime via the edit flow ("change my hiring status" / "change my working status"): flipping to *no* deletes their match rows (so they stop being displayed on the dashboard), flipping to *yes* re-runs matching immediately. Clear yes/no answers are parsed locally (including haan/ji/nahi) with no API call; only ambiguous answers go to Groq.

**Skill scoring is 100% local (no API calls):** skills overlap (55%) via a curated keyword dictionary matched against skills/tools/descriptions, budget fit (25%) comparing the client's hourly budget to the freelancer's rate, and availability fit (20%) comparing parsed hours/week to what the hire type needs. One batched Groq call per run then generates the `ai_explanation` / `potential_risks` / `recommended_action` text shown in the dashboard — if Groq is down or rate-limited, deterministic fallback text is used so matches are still written.

**Trust-weighted ranking:** freelancers are still filtered by skill compatibility score ≥ 35 — Trust Score never gates or excludes anyone. Stored match rows also include `trust_score` and `total_score = round(0.75 × compatibility_score + 0.25 × (trust_score ?? 0))`. Candidate ranking uses `total_score`, while client-facing WhatsApp/dashboard views show all three numbers: Overall / Skill / Trust.

**Note on WhatsApp delivery:** Meta only allows free-form messages within 24h of a user's last message. The person who just finished onboarding always gets their message; the *other* side of a match might be outside that window, in which case the send fails quietly (logged) but their in-app notification and match row still appear on the dashboard. Template messages would fix this — future work.

## Abandoned Registration Reminders

The server runs a lightweight reminder loop for users who started onboarding but have not reached `step = 'completed'`. By default, after 60 minutes of inactivity it sends one WhatsApp nudge:

`You're just a few minutes away from finishing your registration.`

The message then includes the current question for their saved `conversation.step`, so their next reply continues from exactly where they left off. The reminder does not advance the step or overwrite collected data. A `registration_reminder_sent_at` marker is stored inside `conversations.temp_data` to avoid repeated nudges. The loop skips conversations older than `REGISTRATION_REMINDER_MAX_AGE_MINUTES` (default 23h) because free-form WhatsApp sends may fail outside Meta's 24h window.

## Trust Score & Vetting

Freelancer onboarding now asks four optional proof questions between name and portfolio: LinkedIn, GitHub, CV/resume, and support docs. Each can be skipped. `collect_profile_link` remains as a legacy alias for old in-flight conversations and maps to `linkedin_url`.

Vetting runs only for freelancers, after the completion reply and before matching. It uses local/free checks first: GitHub public API, LinkedIn URL format + slug/name match only, CV text/PDF extraction, portfolio fetch or oEmbed, and support-doc liveness/content-type sanity. There is no manual vetting, no account-age signal, no scraping/headless browser, and no trust gating.

Trust Score is 0-100:

- **Identity, Consistency & Link Integrity (45):** coverage of the core trio LinkedIn/GitHub/CV gives 10 pts for ≥2 provided, 4 pts for exactly 1, 0 for none. This is the only missing-link penalty. Link integrity averages provided liveness rows (pass=1, unverifiable=0.6, fail=0) for 20 pts. Identity consistency averages identity rows for 15 pts.
- **Skill Proof (35):** claimed skills from `skills + tools + brief_description` are compared with skills evidenced in GitHub/CV/portfolio content. If the optional Groq vetting call runs, the local ratio is blended 50/50 with Groq-supported-vs-unsupported skill claims.
- **Claims Consistency (20):** Groq consistency score, or 0 if no evidence existed and the call was skipped.

Token rules: full vetting makes at most one Groq call and skips it entirely when no artifact yields content. Broken links cost zero Groq tokens. Single-artifact re-vets reuse the stored claims row and fetch only that artifact, then update `trust_score`, `trust_tier`, `trust_breakdown`, and existing match `total_score` snapshots.

Broken-link protocol: the score is calculated first with broken links marked `fail`, then the freelancer gets a breakdown plus a prompt to resend just the broken link. The resend path updates only that one field and re-checks only that host.
 
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
| `GITHUB_TOKEN` | Optional — GitHub personal token for higher public API limits during vetting |
| `REGISTRATION_REMINDER_ENABLED` | Optional — set `false` to disable abandoned-registration reminders |
| `REGISTRATION_REMINDER_AFTER_MINUTES` | Optional — inactivity age before sending the nudge, default `60` |
| `REGISTRATION_REMINDER_INTERVAL_MINUTES` | Optional — reminder loop interval, default `10` |
| `REGISTRATION_REMINDER_MAX_AGE_MINUTES` | Optional — max conversation age for free-form reminders, default `1380` |
| `REGISTRATION_REMINDER_BATCH_SIZE` | Optional — max conversations checked per loop, default `25` |
 
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
  linkedin_url text,
  github_url text,
  cv_url text,
  support_docs text,
  portfolio text,
  skills text,
  tools text,
  rate text,
  availability text,
  preferences text,
  working_currently boolean,
  brief_description text,
  trust_score int,
  trust_tier text,
  trust_breakdown jsonb,
  vetted_at timestamptz,
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
  hiring_currently boolean,
  brief_description text,
  created_at timestamp default now(),
  unique (phone)
);

-- Matches table (written by the matching engine when onboarding completes).
-- The foreign keys are REQUIRED — the frontend's `freelancer:freelancers(*)`
-- embedded select only works when Supabase can see the relationship.
create table if not exists matches (
  id bigint generated always as identity primary key,
  freelancer_phone text not null references freelancers(phone) on delete cascade,
  client_phone text not null references job_requests(phone) on delete cascade,
  compatibility_score int,
  trust_score int,
  total_score int,
  skills_overlap text[] default '{}',
  budget_fit boolean,
  availability_fit boolean,
  ai_explanation text,
  potential_risks text,
  recommended_action text,
  created_at timestamptz default now(),
  unique (freelancer_phone, client_phone)
);

-- In-app notifications (read by the dashboard's notifications page)
create table if not exists notifications (
  id bigint generated always as identity primary key,
  phone text not null,
  type text,
  title text,
  body text,
  read boolean default false,
  created_at timestamptz default now()
);

-- Dashboard insights (regenerated per freelancer when their profile completes)
create table if not exists insights (
  id bigint generated always as identity primary key,
  phone text not null,
  insight_type text,
  content text,
  metric_value numeric,
  metric_label text,
  icon text,
  color text,
  generated_at timestamptz default now()
);

-- Stored vetting checks (replaced per full vet or per single-artifact re-vet)
create table if not exists vetting_checks (
  id bigint generated always as identity primary key,
  phone text not null,
  artifact text not null,
  check_type text not null,
  status text not null,
  evidence jsonb,
  checked_at timestamptz default now()
);
```

**Already have the old tables?** Run this migration instead of dropping anything — it adds the missing column and the three new tables (the `create table if not exists` statements above are safe to re-run too):

```sql
alter table freelancers add column if not exists brief_description text;
alter table freelancers add column if not exists updated_at timestamptz default now();
alter table freelancers add column if not exists working_currently boolean;
alter table freelancers add column if not exists linkedin_url text;
alter table freelancers add column if not exists github_url text;
alter table freelancers add column if not exists cv_url text;
alter table freelancers add column if not exists support_docs text;
alter table freelancers add column if not exists trust_score int;
alter table freelancers add column if not exists trust_tier text;
alter table freelancers add column if not exists trust_breakdown jsonb;
alter table freelancers add column if not exists vetted_at timestamptz;
alter table job_requests add column if not exists hiring_currently boolean;
alter table matches add column if not exists trust_score int;
alter table matches add column if not exists total_score int;

create table if not exists vetting_checks (
  id bigint generated always as identity primary key,
  phone text not null,
  artifact text not null,
  check_type text not null,
  status text not null,
  evidence jsonb,
  checked_at timestamptz default now()
);
-- then run the `matches`, `notifications`, and `insights` create statements above

-- OPTIONAL: users registered before the hiring/working status feature have
-- NULL flags and are excluded from matching until they answer. Run these to
-- grandfather them in as active instead:
-- update freelancers set working_currently = true where working_currently is null;
-- update job_requests set hiring_currently = true where hiring_currently is null;
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
 

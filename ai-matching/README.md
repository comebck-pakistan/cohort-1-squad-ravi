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
| `src/groq.js` | The Groq call + system prompt for data extraction |
| `src/replies.js` | The randomized question bank |
| `src/supabase.js` | All Supabase reads/writes (search, upsert, create, delete) |
| `src/whatsapp.js` | Sending WhatsApp replies |
| `src/config.js` | Loads everything from `.env` (no secrets hardcoded) |
 
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
 

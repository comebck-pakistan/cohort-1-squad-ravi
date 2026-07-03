# AI Matching Bot — Code-First Rewrite

This is a plain Node.js/Express rewrite of the original n8n workflow. Same logic, same Supabase tables, same Groq prompt, same randomized replies — just as code instead of visual nodes.

## Changelog

- **Typing effect** — bot now simulates a natural typing delay before sending replies, instead of responding instantly
- **Skip option for LinkedIn/CV step** — users can now skip the LinkedIn/CV step during onboarding instead of being forced through it
- **Reset flow fixed** — reset command ("reset ai") now correctly clears prior conversation/freelancer rows and restarts onboarding cleanly
- **Conversation-state memory fixed** — bot previously failed to remember earlier onboarding steps and looped back to "Freelancer or Client?"; this is now fixed, so the bot correctly progresses through each step using saved conversation state
- **Randomized question phrasing** — each onboarding step now pulls from multiple pre-written variants of the same question at random, so the conversation feels more natural and less scripted/repetitive
- **Natural post-completion replies** — after a profile is marked complete, follow-up messages like "perfect," "thanks," or similar acknowledgements now get a natural, varied response instead of repeating the setup-complete message again
- **Unsupported file type handling** — if a user sends an image, audio, video, or any non-text message, the bot replies letting them know that format isn't supported and asks them to send a text message or link instead
- **Edit-info flow** — users can now update their name, rate, budget, deadline, portfolio, or any other saved field at any point — mid-onboarding or after profile completion — by typing things like "edit my info," "change my rate," or "change my deadline." Works for both Freelancers and Clients, across every field currently collected. The bot asks a natural follow-up to confirm the new value, updates only that field, and resumes wherever the user left off.
- **Natural-language deadline parsing** — the bot now understands phrases like "this week," "in 2 days," "next month," "asap," etc. and automatically calculates the actual target date (`deadline_date` / `availability_date`), instead of only storing the raw text
- **`updated_at` column fix** — fixed a Supabase error where the `freelancers` table was missing the `updated_at` column, which was blocking field updates
- **markAsReadAndTyping error fix** — WhatsApp's API occasionally returns a "message does not exist" error (code 100) on duplicate/late webhook events; this is now caught and logged quietly instead of throwing an error
- Additional bug fixes, UX improvements, and conversation flow refinements

## What each file does

- `src/server.js` — the webhook (GET verify + POST receive), same job as your two Webhook nodes
- `src/handlers/handleMessage.js` — the whole conversation flow, same job as the rest of your canvas
- `src/groq.js` — the Groq call + system prompt (identical to your Groq AI Completion node)
- `src/replies.js` — the randomized question bank (identical to your Pick Reply Text node)
- `src/supabase.js` — all your Supabase reads/writes (Search/Upsert/Create/Delete nodes)
- `src/whatsapp.js` — sending WhatsApp replies
- `src/config.js` — loads everything from your `.env` file (no secrets hardcoded anywhere, unlike the n8n file)

## Step 1 — Install Node.js

Download and install from https://nodejs.org (LTS version). This gives you `node` and `npm`.

Verify it worked by opening a terminal and running:
```
node -v
npm -v
```

## Step 2 — Open the project in your IDE

Open the project folder as your project root. That's it — it's a normal Node.js project, no special config needed for any IDE.

## Step 3 — Install dependencies

In the terminal, inside the project folder:
```
npm install
```

## Step 4 — Set up your environment variables

Copy the example file:
```
cp .env.example .env
```
Then open `.env` and fill in your real values:
- `WHATSAPP_VERIFY_TOKEN` — make up any secret string yourself, you'll enter this same string in Meta's webhook config
- `WHATSAPP_PHONE_NUMBER_ID` — from Meta for Developers (same one your n8n workflow used: `1259223173931392`)
- `WHATSAPP_ACCESS_TOKEN` — your **rotated** token (don't reuse the old exposed one)
- `SUPABASE_URL` — same as your n8n Supabase credential (`https://ehjvfpltmhyjnqpstqbk.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard → Project Settings → API → service_role key
- `GROQ_API_KEY` — your **rotated** Groq key

`.env` is already in `.gitignore` — it will never get pushed to GitHub. That's the whole point of doing it this way instead of hardcoding keys in the file itself.

## Step 5 — Run it locally

```
npm run dev
```
You should see `🚀 The bot listening on port 3000`.

## Step 6 — Expose it to the internet for testing (before deploying)

Meta needs a public HTTPS URL to send webhooks to. While developing locally, use a tunnel tool:
```
npx ngrok http 3000
```
This gives you a temporary public URL like `https://abcd1234.ngrok-free.app`. Use `https://abcd1234.ngrok-free.app/webhook` as your webhook URL in Meta's app dashboard (WhatsApp → Configuration → Webhook), along with your `WHATSAPP_VERIFY_TOKEN`.

## Step 7 — GitHub (why and how)

GitHub isn't required to run this, but it's how you'll:
- back up your code
- deploy to Railway (Railway can auto-deploy straight from a GitHub repo on every push)
- track changes over time instead of only having "the current state"

Basic steps:
1. Create a free account at https://github.com if you don't have one
2. Create a new empty repository (no README/gitignore, you already have those)
3. In your project folder:
```
git init
git add .
git commit -m "Initial code-first bot"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```
Since `.env` is gitignored, your secrets never get pushed — only `.env.example` (the template) does.

## Step 8 — Deploy (Railway, same account you already use)

You can absolutely reuse your existing Railway account — just create a **new service** in a new (or the same) project, don't touch your n8n service.

1. Railway dashboard → New Project → Deploy from GitHub repo → pick your repo
2. Railway auto-detects Node.js and runs `npm install` + `npm start`
3. Go to the new service → Variables tab → add all the same variables from your `.env` file (Railway injects these at runtime, same idea as n8n's Service Variables you already saw)
4. Once deployed, Railway gives you a public URL like `https://your-bot-production.up.railway.app` — use `https://.../webhook` as your permanent webhook URL in Meta's dashboard (replacing the ngrok one)

From here on, every `git push` to your GitHub repo auto-redeploys — no manual steps.

## Step 9 — Supabase — no changes needed

Same tables (`conversations`, `freelancers`), same columns, same `jsonb` `temp_data` column you already migrated to. Nothing to change on the Supabase side.

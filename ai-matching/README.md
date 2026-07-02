# Bot — Code-First Rewrite

This is a plain Node.js/Express rewrite of your n8n workflow. Same logic, same Supabase tables, same Groq prompt, same randomized replies — just as code instead of visual nodes.

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

## Step 2 — Open the project in Antigravity

Open the `mahir-bot` folder as your project root. That's it — it's a normal Node.js project, no special config needed for any IDE.

## Step 3 — Install dependencies

In the terminal, inside the `mahir-bot` folder:
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
You should see `🚀 Mahir bot listening on port 3000`.

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
git commit -m "Initial code-first Mahir bot"
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
4. Once deployed, Railway gives you a public URL like `https://mahir-bot-production.up.railway.app` — use `https://.../webhook` as your permanent webhook URL in Meta's dashboard (replacing the ngrok one)

From here on, every `git push` to your GitHub repo auto-redeploys — no manual steps.

## Step 9 — Supabase — no changes needed

Same tables (`conversations`, `freelancers`), same columns, same `jsonb` `temp_data` column you already migrated to. Nothing to change on the Supabase side.

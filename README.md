# Build & Prep — BDA Copilot

Live app: **https://build-prep.vercel.app**

## What I built

An agent that covers the two drop-off moments in Scaler's sales funnel. Before the call, it reads the lead's profile and last conversation and WhatsApps the BDA a prep note that reads like a teammate's text: who this person is, the opening line to use, expected objections with handles, and a "don't say" line, with facts, guesses and unknowns marked (✓ / ~ / ?). After the call, it extracts the lead's unanswered questions from the transcript (or a call recording, transcribed with speaker labels), classifies what's actually driving their decision (ROI skeptic / peer evaluator / trust seeker), and writes a personalised PDF that answers those exact questions, grounded in a fact file scraped from scaler.com where every claim carries a source URL. Anything not in the fact file is rendered as "your advisor will confirm", never invented — including where Scaler's own pages disagree with each other, which the PDF states openly with per-page attribution. The three personas produce three visibly different documents: different structure, voice, typography and colour, because the persuasion job is different for each. Every lead-facing send passes through a human Approve / Edit / Skip gate; the BDA nudge is ungated by design.

## One failure I found

My writer put ₹15 LPA in Rohan's ROI table. He said 14 on the call. One invented digit, in the exact number a skeptical lead checks first. Fix: the writer now reads the raw transcript, and derived figures must show their arithmetic or they don't ship.

## Scale plan (1/day → 100k/month)

The approval gate breaks first. At ~3,300 lead PDFs a day, "a BDA reviews every send" stops scaling. So approval goes tiered: auto-send documents that pass grounding checks (every claim traceable to the fact file), queue only flagged ones for human review, sample-audit the rest. Second constraint is LLM rate limits — I hit free-tier caps during a single day of development. At volume you buy dedicated throughput and queue generation; the PDF needs to arrive within minutes of the call, not seconds. WhatsApp sandbox becomes approved business templates — paperwork, not engineering.

---

## Stack and model choices

- **Strategist / extraction** — gpt-oss-20B (Groq): reads profile + transcript, outputs a typed JSON brief (verbatim open questions, archetype, don't-say list)
- **Lead-facing writer** — gpt-oss-120B (Groq): writes the PDF content under hard grounding rules; a JSON-salvage layer repairs near-valid output instead of discarding it
- **BDA nudge** — Qwen 3.6-27B (Groq), reasoning off: short-form WhatsApp voice
- **Fallbacks** — every stage falls back across four separate rate-limit buckets (Llama 4 Scout as last resort); transcription falls back from AssemblyAI (diarized) to Groq Whisper; Twilio media send falls back to text+link, then to a wa.me link in the UI; if the PDF renderer dies, the same document ships as a hosted web page
- **Rendering** — HTML/CSS per archetype → headless Chromium → PDF → Vercel Blob
- **Delivery** — Twilio WhatsApp Sandbox
- App: Next.js 16 on Vercel. Grounding: `data/facts.json`, curated from scaler.com with a source URL per claim and an explicit list of 21 things the agent must refuse to claim.

## Run locally

```bash
npm install
# fill .env.local: GROQ_API_KEY, ASSEMBLYAI_API_KEY, TWILIO_ACCOUNT_SID,
# TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM, NEXT_PUBLIC_TWILIO_SANDBOX_CODE,
# BLOB_READ_WRITE_TOKEN
npm run dev
```

All prompts are in [`PROMPTS.md`](./PROMPTS.md) (source of truth: `lib/prompts.ts`).

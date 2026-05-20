# Evergreen Design/Build — AI Bid Estimator (Prototype)

A working prototype of a ChatGPT-style chat widget that interviews homeowners about
landscape projects and returns a live budget range based on configurable pricing.

Built for a landscape design/build company evaluation. Stack:

- **React + Vite + Tailwind + shadcn/ui** (frontend)
- **Express + TypeScript** (backend)
- **OpenAI Responses API + function calling** (chat brain)
- Single `server/pricing.ts` file for all pricing rules

## What's in the prototype

- Conversational chat with **Sage**, the AI design consultant
  - Asks one question at a time, branches based on answers
  - Understands plain English (no fixed forms)
  - Acknowledges photo uploads of the site
- **Live budget panel** that updates as the conversation progresses
  - Itemized line items, material tier, site/timeline modifiers
  - Low / likely / high range with contingency on the high end
- **Lead capture** — name, email, phone, address, project summary, photos
  - Posts to an in-memory store (view at `GET /api/leads`)
  - Easy to swap for Slack webhook, email, or CRM
- **Photo upload** — up to 6 images, 8 MB each
- **One-click reset** to start a fresh conversation

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:5000. Set `OPENAI_API_KEY` in a `.env` file.

## Editing pricing

All rates, multipliers, modifiers, and company settings live in `server/pricing.ts`.
Change a number, restart — no other code changes needed.

## Architecture

1. Frontend POSTs chat history + new message to `POST /api/chat`
2. Backend calls OpenAI with system prompt + two function tools:
   - `generate_estimate` — computes budget from structured line items
   - `submit_lead` — captures contact info + estimate
3. Pricing engine runs deterministically (no AI hallucinated prices)
4. Side panel renders the structured estimate in real time

## What’s needed for production

- Lead delivery (Slack/email/CRM integration)
- Persistent database for leads
- Cloud photo storage (S3/R2)
- Shopify embed packaging
- Admin dashboard for pricing updates
- Rate limiting and abuse protection

## File map

```
├── server/
│   ├── pricing.ts      ← edit pricing here
│   ├── routes.ts       ← chat endpoint + tool definitions
│   └── index.ts        ← Express bootstrap
├── client/src/
│   └── pages/
│       └── Estimator.tsx   ← the chat UI
└── README.md
```

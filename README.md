# Evergreen Design/Build — AI Bid Estimator (Demo)

A working demo of a ChatGPT-style chat widget that interviews homeowners about
landscape projects and returns a live budget range based on configurable pricing.

Built for a landscape design/build company evaluation. Stack:

- **React + Vite + Tailwind + shadcn/ui** (frontend)
- **Express + TypeScript** (backend)
- **OpenAI Responses API + function calling** (chat brain)
- Single `server/pricing.ts` file for all pricing rules

## What's in the demo

- Conversational chat with **Sage**, the AI design consultant
  - Asks one question at a time, branches based on answers
  - Understands plain English (no fixed forms)
  - Acknowledges photo uploads of the site
- **Live budget panel** that updates as the conversation progresses
  - Itemized line items, material tier, site/timeline modifiers
  - Low / likely / high range with contingency on the high end
- **Lead capture** — name, email, phone, address, project summary, photos
  - Posts to an in-memory store (view at `GET /api/leads`)
  - Easy to swap for Slack webhook, email, or CRM (see "Lead routing" below)
- **Photo upload** — up to 6 images, 8 MB each, base64 in payload
- **One-click reset** to start a fresh demo

## Run it locally

```bash
cd estimator
npm install
npm run dev
```

Open http://localhost:5000.

The OpenAI key in this sandbox comes from the platform credentials. To run it
on your own infrastructure, set:

```
OPENAI_API_KEY=sk-...
```

The code already imports `dotenv/config` in `server/index.ts`, so you can drop
a `.env` file in the project root.

## Editing pricing

**Everything pricing-related lives in `server/pricing.ts`.** That file is the
single source of truth — restart the server (or hot-reload picks it up) after
edits.

What you can change without touching any other code:

- **Per-category rates** (`pricing.categories`) — base + likely rate, unit,
  category minimum, and notes
- **Material multipliers** — standard / premium / luxury
- **Site modifiers** — slope, access, demo, HOA, permits (% or flat)
- **Timeline modifiers** — rush surcharge, off-season discount
- **Company-wide values** — design fee, minimum project size, contingency %

The same file also exports `computeEstimate()` — the pure-function pricing
engine used by both the AI tool call and the side-panel renderer.

To **add a new category**, do these three things in `pricing.ts`:

1. Add the key to the `ProjectCategoryKey` union type
2. Add the rate entry to `pricing.categories`
3. Restart the server — the OpenAI tool schema is auto-generated from the
   category keys

## How the AI chat works

1. Frontend POSTs full chat history + new message to `POST /api/chat`
2. Backend calls OpenAI Responses API with:
   - `instructions`: Sage's system prompt (includes a one-line summary of every
     pricing category, pulled live from `pricing.ts`)
   - `tools`: two function tools, `generate_estimate` and `submit_lead`
3. When Sage decides she has enough info, she calls `generate_estimate` with a
   structured payload (line items, site, timeline). The backend runs that
   through `computeEstimate()` and feeds the result back to the model.
4. Sage then writes a short conversational reply, while the structured estimate
   is returned to the frontend and rendered in the side panel.
5. After contact info is captured, Sage calls `submit_lead` — the backend
   stores the lead and logs it.

The model is constrained by the system prompt: it never invents dollar amounts;
all pricing comes through the tool. Adjust the prompt in `server/routes.ts`
(`SYSTEM_PROMPT` constant) to change tone, conversation length, or required
fields.

## Lead routing

Right now, captured leads are stored in memory and printed to the server log
(`console.log("[LEAD CAPTURED]", ...)`). Swap that in `server/routes.ts` for any
of:

```ts
// Slack
await fetch(process.env.SLACK_WEBHOOK_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    text: `New lead: ${args.name} (${args.email}) — ${args.projectSummary}`,
  }),
});

// Email (Resend / SendGrid)
await resend.emails.send({
  from: "leads@evergreen.example",
  to: "team@evergreen.example",
  subject: `New lead: ${args.name}`,
  text: JSON.stringify(lead, null, 2),
});

// CRM (HubSpot, Salesforce, etc.) — POST to their REST endpoint
```

The full lead object includes the transcript, the estimate, and the photo
count.

## Photos in production

For the demo, photos are sent as base64 data URLs and counted in the
backend (not stored). For production, swap the upload path for direct-to-S3
or Supabase Storage and pass just the URLs into the lead payload. Sage doesn't
need to "see" the photos for estimation; she just acknowledges them.

If you want photo-aware estimates, switch the chat to a vision-capable model
and pass image inputs in the user message — the Responses API supports
image inputs.

## Deploy

The included template builds to a static frontend + Node backend:

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

For Vercel / Netlify deployment:

- **Netlify** (you said you started here): wire the Express server as a
  Netlify Function or move to a long-running host (Render, Railway, Fly).
  Netlify Functions can run the chat endpoint but the streaming UX is smoother
  on a persistent Node host.
- **Vercel**: use a serverless function for `/api/chat`. Same code, just
  re-export the handler.
- **Standalone**: any Node 18+ host works.

Always set `OPENAI_API_KEY` in the host's env vars.

## File map

```
estimator/
├── server/
│   ├── pricing.ts      ← edit pricing here
│   ├── routes.ts       ← chat endpoint, tool definitions, lead storage
│   └── index.ts        ← Express bootstrap
├── client/src/
│   ├── App.tsx
│   └── pages/
│       └── Estimator.tsx   ← the chat UI
└── README.md
```

## What's stubbed vs production-ready

| Feature                    | Demo state                | Production swap                  |
| -------------------------- | ------------------------- | -------------------------------- |
| OpenAI key                 | Platform credential       | `OPENAI_API_KEY` env var         |
| Pricing rules              | `server/pricing.ts`       | Same file, or move to a DB / CMS |
| Lead storage               | In-memory + console log   | Slack / email / CRM webhook      |
| Photo storage              | Base64 in request payload | Direct-to-S3 or Supabase         |
| Conversation logs          | Returned to frontend only | Log to DB for QA / training      |
| Embed on landscaper's site | Single-page React app     | Iframe widget or floating bubble |

## Next steps for going live

1. Replace the lead storage block with your real channel (Slack/email/CRM)
2. Move pricing values out of `pricing.ts` into your preferred CMS if
   non-developers need to edit through a UI
3. Add a "Talk to a human" escape hatch button that bypasses the chat
4. Add basic rate-limiting and abuse protection on `/api/chat`
5. Decide on the embed format (full page vs floating bubble vs iframe widget)

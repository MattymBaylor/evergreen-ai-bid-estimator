import type { Express, Request, Response } from "express";
import { createServer } from "node:http";
import type { Server } from "node:http";
import OpenAI from "openai";
import {
  computeEstimate,
  pricing,
  type EstimateInput,
} from "./pricing";

const client = new OpenAI();

// Build a compact pricing summary for the model's system prompt.
function pricingSummary() {
  const lines = Object.entries(pricing.categories).map(([key, c]) => {
    const tag = c.unit === "lump_sum" ? "lump sum" : `per ${c.unit}`;
    return `- ${key} (${c.label}): $${c.basePerUnit}–$${c.likelyPerUnit} ${tag}; min $${c.minProject}`;
  });
  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are Sage, the AI design consultant for ${pricing.company.name}, a landscape design/build firm serving ${pricing.company.serviceArea}.

Your job: have a warm, professional conversation with a homeowner to scope their project and produce a budget RANGE — not a fixed quote.

CONVERSATION STYLE
- Greet warmly on the first turn; introduce yourself as Sage.
- Ask ONE focused question per turn. Never stack multiple questions.
- Use plain English, no jargon, no bullet lists in chat (the UI shows the quote separately).
- React naturally to what they say (\"Got it — a paver patio is a great choice for that area...\").
- If they upload photos, acknowledge them briefly.
- Keep replies under 60 words.

WHAT YOU NEED TO LEARN (in roughly this order, branching as needed)
1. Project type — patio, planting, lighting, irrigation, retaining wall, full backyard, etc. Multiple is fine.
2. Size — square footage, linear feet, or count. Help them estimate (\"about the size of a parking space is ~180 sqft\").
3. Material/finish tier — standard, premium, or luxury.
4. Site conditions — slope, access, demo of existing hardscape, drainage issues.
5. Permits / HOA — required?
6. Timeline — rush (<30 days), standard, flexible/off-season.
7. Once you have enough to estimate, call generate_estimate.
8. After the estimate is shown, ask for name, email, phone, and project address so the team can follow up.
9. When you have contact info AND an estimate, call submit_lead.

PRICING REFERENCE (do not quote these numbers verbatim — call generate_estimate instead)
${pricingSummary()}

Material tiers: standard = builder-grade, premium = +25%, luxury = +60%.
Site adders: steep slope +15%, poor access +12%, demo +10%, HOA +5%, permitting flat $850.
Timeline: rush +12%, flexible -6%.
Company minimum project: $${pricing.company.minTotalProject}. Design fee $${pricing.company.designFee} included.

RULES
- Never invent prices. ONLY surface dollar amounts that came from generate_estimate.
- If they ask \"how much?\" before you have enough info, ask one more clarifying question.
- If a project sounds under the minimum, gently note it.
- If they go off-topic, redirect kindly.
- When you call generate_estimate, your text reply should be a one-sentence intro like \"Here's a preliminary range based on what you've shared:\" — the UI renders the breakdown.`;

// ─────────────────────────────────────────────────────────────────
// Tool definitions for the Responses API
// ─────────────────────────────────────────────────────────────────
const tools = [
  {
    type: "function" as const,
    name: "generate_estimate",
    description:
      "Compute a budget range from structured line items. Call this once you have enough info: project category, size, material tier, and any site/timeline modifiers.",
    parameters: {
      type: "object",
      properties: {
        lineItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: {
                type: "string",
                enum: Object.keys(pricing.categories),
              },
              quantity: {
                type: "number",
                description:
                  "Square feet, linear feet, count of items, or 1 for lump-sum categories.",
              },
              materialTier: {
                type: "string",
                enum: ["standard", "premium", "luxury"],
              },
              notes: { type: "string" },
            },
            required: ["category", "quantity"],
            additionalProperties: false,
          },
        },
        site: {
          type: "object",
          properties: {
            steep_slope: { type: "boolean" },
            poor_access: { type: "boolean" },
            demolition_required: { type: "boolean" },
            permit_required: { type: "boolean" },
            hoa_requirements: { type: "boolean" },
          },
          additionalProperties: false,
        },
        timeline: {
          type: "string",
          enum: ["rush", "standard", "flexible"],
        },
      },
      required: ["lineItems"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "submit_lead",
    description:
      "Send the qualified lead to the Evergreen team. Call this only after you have name, email, phone, address, AND an estimate has been generated.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        address: { type: "string" },
        projectSummary: {
          type: "string",
          description: "2-3 sentence plain-English summary of the project.",
        },
      },
      required: ["name", "email", "phone", "address", "projectSummary"],
      additionalProperties: false,
    },
  },
];

// ─────────────────────────────────────────────────────────────────
// Lead storage (in-memory for demo; swap with Slack/email/CRM)
// ─────────────────────────────────────────────────────────────────
interface StoredLead {
  id: string;
  receivedAt: string;
  contact: {
    name: string;
    email: string;
    phone: string;
    address: string;
  };
  projectSummary: string;
  estimate: any;
  transcript: Array<{ role: string; content: string }>;
  photoCount: number;
}
const leads: StoredLead[] = [];

// ─────────────────────────────────────────────────────────────────
// /api/chat
// ─────────────────────────────────────────────────────────────────
interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequestBody {
  history: ChatTurn[];
  userMessage: string;
  photos?: string[];
  lastEstimate?: any;
}

interface ChatResponseBody {
  reply: string;
  estimate?: any;
  leadSubmitted?: boolean;
  leadId?: string;
}

// The proxy only accepts `input` as a string (not an array of message objects),
// so we serialize the full conversation as plain text with role labels.
function serializeConversation(history: ChatTurn[], newUserMessage: string): string {
  const lines: string[] = [];
  lines.push("=== CONVERSATION SO FAR ===");
  if (history.length === 0) {
    lines.push("(this is the very first user message)");
  } else {
    for (const turn of history) {
      const label = turn.role === "user" ? "Customer" : "Sage";
      lines.push(`${label}: ${turn.content}`);
    }
  }
  lines.push("");
  lines.push("=== NEW CUSTOMER MESSAGE ===");
  lines.push(newUserMessage);
  lines.push("");
  lines.push(
    "Reply as Sage. Use a tool when appropriate. Keep your reply under 60 words."
  );
  return lines.join("\n");
}

async function handleChat(req: Request, res: Response) {
  try {
    const body = req.body as ChatRequestBody;
    const photoCount = body.photos?.length ?? 0;

    let userText = body.userMessage;
    if (photoCount > 0) {
      userText += `\n\n[The customer attached ${photoCount} photo${photoCount > 1 ? "s" : ""} of the site.]`;
    }

    let conversationText = serializeConversation(body.history, userText);

    let estimateResult: any = undefined;
    let leadSubmitted = false;
    let leadId: string | undefined;
    let assistantReply = "";

    // Tool-call loop — up to 3 hops. After a tool call, we append the tool
    // result to the conversation text and re-prompt.
    for (let hop = 0; hop < 4; hop++) {
      const reqBody: any = {
        model: "gpt_5_1",
        instructions: SYSTEM_PROMPT,
        input: conversationText,
        tools,
      };
      const response: any = await client.responses.create(reqBody);

      const output = response.output || [];
      const functionCalls = output.filter((o: any) => o.type === "function_call");
      const messages = output.filter((o: any) => o.type === "message");

      // Collect text reply
      let textThisHop = "";
      for (const msg of messages) {
        for (const c of msg.content || []) {
          if (c.type === "output_text" && c.text) {
            textThisHop += (textThisHop ? " " : "") + c.text;
          }
        }
      }
      if (textThisHop) assistantReply = textThisHop;

      if (functionCalls.length === 0) break;

      // Process tool calls and append their results back into the prompt
      const toolResults: string[] = [];
      for (const call of functionCalls) {
        const args = JSON.parse(call.arguments || "{}");
        let toolOutput: any = {};

        if (call.name === "generate_estimate") {
          const result = computeEstimate(args as EstimateInput);
          estimateResult = result;
          toolOutput = result;
        } else if (call.name === "submit_lead") {
          if (!estimateResult && !body.lastEstimate) {
            toolOutput = {
              ok: false,
              error: "No estimate yet. Call generate_estimate first.",
            };
          } else {
            const lead: StoredLead = {
              id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              receivedAt: new Date().toISOString(),
              contact: {
                name: args.name,
                email: args.email,
                phone: args.phone,
                address: args.address,
              },
              projectSummary: args.projectSummary,
              estimate: estimateResult ?? body.lastEstimate,
              transcript: [
                ...body.history,
                { role: "user", content: body.userMessage },
              ],
              photoCount,
            };
            leads.push(lead);
            leadSubmitted = true;
            leadId = lead.id;
            // In production: POST to Slack / send email / push to CRM
            console.log("[LEAD CAPTURED]", lead.id, lead.contact);
            toolOutput = { ok: true, leadId: lead.id };
          }
        }

        toolResults.push(
          `[Tool ${call.name} returned]\n${JSON.stringify(toolOutput, null, 2)}`
        );
      }

      conversationText += `\n\n=== YOUR TOOL CALLS RETURNED ===\n${toolResults.join("\n\n")}\n\nNow write your conversational reply to the customer. If you generated an estimate, write a brief one-sentence intro (the UI shows the breakdown). If submit_lead succeeded, confirm warmly.`;
    }

    const payload: ChatResponseBody = {
      reply: assistantReply || "Got it — what else can you tell me?",
      estimate: estimateResult,
      leadSubmitted,
      leadId,
    };
    res.json(payload);
  } catch (err: any) {
    console.error("[/api/chat] error:", err?.message, err?.stack);
    res.status(500).json({
      reply:
        "Sorry — I hit a snag on my end. Could you try that again? (If this keeps happening, please call the office directly.)",
      error: err?.message,
    });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post("/api/chat", handleChat);

  app.get("/api/leads", (_req, res) => {
    res.json({ count: leads.length, leads });
  });

  app.get("/api/pricing", (_req, res) => {
    res.json(pricing);
  });

  return httpServer;
}

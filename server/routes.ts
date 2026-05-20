import type { Express, Request, Response } from "express";
import type { Server } from "node:http";
import OpenAI from "openai";
import { computeEstimate, pricing, type EstimateInput } from "./pricing";

const client = new OpenAI();

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
- Use plain English, no jargon, no bullet lists in chat.
- React naturally to what they say.
- If they upload photos, acknowledge them briefly.
- Keep replies under 60 words.

WHAT YOU NEED TO LEARN (in roughly this order, branching as needed)
1. Project type
2. Size (sqft, linear ft, or count)
3. Material/finish tier (standard, premium, luxury)
4. Site conditions (slope, access, demo, drainage)
5. Permits / HOA
6. Timeline (rush, standard, flexible)
7. Once enough info, call generate_estimate
8. After estimate shown, ask for name, email, phone, address
9. When you have contact info AND estimate, call submit_lead

PRICING REFERENCE
${pricingSummary()}

Material tiers: standard = builder-grade, premium = +25%, luxury = +60%.
Site adders: steep slope +15%, poor access +12%, demo +10%, HOA +5%, permitting flat $850.
Timeline: rush +12%, flexible -6%.
Company minimum: $${pricing.company.minTotalProject}. Design fee $${pricing.company.designFee} included.

RULES
- Never invent prices. ONLY surface dollar amounts from generate_estimate.
- If they ask "how much?" before enough info, ask one more question.
- If project sounds under minimum, gently note it.
- If off-topic, redirect kindly.`;

const tools = [
  {
    type: "function" as const,
    name: "generate_estimate",
    description: "Compute a budget range from structured line items.",
    parameters: {
      type: "object",
      properties: {
        lineItems: {
          type: "array",
          items: {
            type: "object",
            properties: {
              category: { type: "string", enum: Object.keys(pricing.categories) },
              quantity: { type: "number" },
              materialTier: { type: "string", enum: ["standard", "premium", "luxury"] },
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
        timeline: { type: "string", enum: ["rush", "standard", "flexible"] },
      },
      required: ["lineItems"],
      additionalProperties: false,
    },
  },
  {
    type: "function" as const,
    name: "submit_lead",
    description: "Send the qualified lead to the Evergreen team.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        address: { type: "string" },
        projectSummary: { type: "string" },
      },
      required: ["name", "email", "phone", "address", "projectSummary"],
      additionalProperties: false,
    },
  },
];

interface StoredLead {
  id: string;
  receivedAt: string;
  contact: { name: string; email: string; phone: string; address: string };
  projectSummary: string;
  estimate: any;
  transcript: Array<{ role: string; content: string }>;
  photoCount: number;
}
const leads: StoredLead[] = [];

interface ChatTurn { role: "user" | "assistant"; content: string; }
interface ChatRequestBody { history: ChatTurn[]; userMessage: string; photos?: string[]; lastEstimate?: any; }
interface ChatResponseBody { reply: string; estimate?: any; leadSubmitted?: boolean; leadId?: string; }

function serializeConversation(history: ChatTurn[], newUserMessage: string): string {
  const lines: string[] = ["=== CONVERSATION SO FAR ==="];
  if (history.length === 0) { lines.push("(first user message)"); }
  else { for (const turn of history) { lines.push(`${turn.role === "user" ? "Customer" : "Sage"}: ${turn.content}`); } }
  lines.push("", "=== NEW CUSTOMER MESSAGE ===", newUserMessage, "", "Reply as Sage. Use a tool when appropriate. Keep reply under 60 words.");
  return lines.join("\n");
}

async function handleChat(req: Request, res: Response) {
  try {
    const body = req.body as ChatRequestBody;
    const photoCount = body.photos?.length ?? 0;
    let userText = body.userMessage;
    if (photoCount > 0) userText += `\n\n[Customer attached ${photoCount} photo${photoCount > 1 ? "s" : ""} of the site.]`;

    let conversationText = serializeConversation(body.history, userText);
    let estimateResult: any = undefined;
    let leadSubmitted = false;
    let leadId: string | undefined;
    let assistantReply = "";

    for (let hop = 0; hop < 4; hop++) {
      const response: any = await client.responses.create({
        model: "gpt_5_1",
        instructions: SYSTEM_PROMPT,
        input: conversationText,
        tools,
      });

      const output = response.output || [];
      const functionCalls = output.filter((o: any) => o.type === "function_call");
      const messages = output.filter((o: any) => o.type === "message");

      let textThisHop = "";
      for (const msg of messages) {
        for (const c of msg.content || []) {
          if (c.type === "output_text" && c.text) textThisHop += (textThisHop ? " " : "") + c.text;
        }
      }
      if (textThisHop) assistantReply = textThisHop;
      if (functionCalls.length === 0) break;

      const toolResults: string[] = [];
      for (const call of functionCalls) {
        const args = JSON.parse(call.arguments || "{}");
        let toolOutput: any = {};
        if (call.name === "generate_estimate") {
          estimateResult = computeEstimate(args as EstimateInput);
          toolOutput = estimateResult;
        } else if (call.name === "submit_lead") {
          if (!estimateResult && !body.lastEstimate) {
            toolOutput = { ok: false, error: "No estimate yet." };
          } else {
            const lead: StoredLead = {
              id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
              receivedAt: new Date().toISOString(),
              contact: { name: args.name, email: args.email, phone: args.phone, address: args.address },
              projectSummary: args.projectSummary,
              estimate: estimateResult ?? body.lastEstimate,
              transcript: [...body.history, { role: "user", content: body.userMessage }],
              photoCount,
            };
            leads.push(lead);
            leadSubmitted = true;
            leadId = lead.id;
            console.log("[LEAD CAPTURED]", lead.id, lead.contact);
            toolOutput = { ok: true, leadId: lead.id };
          }
        }
        toolResults.push(`[Tool ${call.name} returned]\n${JSON.stringify(toolOutput, null, 2)}`);
      }
      conversationText += `\n\n=== TOOL RESULTS ===\n${toolResults.join("\n\n")}\n\nNow write your conversational reply.`;
    }

    res.json({ reply: assistantReply || "Got it — what else can you tell me?", estimate: estimateResult, leadSubmitted, leadId } as ChatResponseBody);
  } catch (err: any) {
    console.error("[/api/chat] error:", err?.message);
    res.status(500).json({ reply: "Sorry — I hit a snag. Could you try again?", error: err?.message });
  }
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  app.post("/api/chat", handleChat);
  app.get("/api/leads", (_req, res) => res.json({ count: leads.length, leads }));
  app.get("/api/pricing", (_req, res) => res.json(pricing));
  return httpServer;
}

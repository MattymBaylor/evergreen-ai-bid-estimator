import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Send,
  Paperclip,
  Sparkles,
  Check,
  X,
  Leaf,
  RefreshCw,
} from "lucide-react";

type Role = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: Role;
  content: string;
}

interface LineItemResult {
  category: string;
  label: string;
  quantity: number;
  unit: string;
  materialTier: string;
  low: number;
  likely: number;
  high: number;
}

interface EstimateResult {
  lineItems: LineItemResult[];
  subtotal: { low: number; likely: number; high: number };
  designFee: number;
  siteAdjustments: { label: string; amount: number }[];
  timelineAdjustment: { label: string; amount: number } | null;
  total: { low: number; likely: number; high: number };
  notes: string[];
  companyName: string;
}

interface PhotoAttachment {
  id: string;
  dataUrl: string;
  name: string;
}

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const GREETING: ChatMessage = {
  id: uid(),
  role: "assistant",
  content:
    "Hi! I'm Sage, the design consultant at Evergreen Design/Build. I'll help you scope your project and put together a budget range in just a few minutes. To start — what are you hoping to do in your yard?",
};

export default function Estimator() {
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [photos, setPhotos] = useState<PhotoAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [estimate, setEstimate] = useState<EstimateResult | null>(null);
  const [leadSubmitted, setLeadSubmitted] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    // auto-scroll to bottom on new messages
    const el = scrollRef.current;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }, [messages, busy, estimate]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const userMsg: ChatMessage = { id: uid(), role: "user", content: text };
    const photoPayload = photos.map((p) => p.dataUrl);
    const photoCount = photos.length;
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput("");
    setPhotos([]);
    setBusy(true);

    try {
      const res = await apiRequest("POST", "/api/chat", {
        history: messages.map((m) => ({ role: m.role, content: m.content })),
        userMessage: text + (photoCount > 0 ? `\n\n(Attached ${photoCount} photo${photoCount > 1 ? "s" : ""})` : ""),
        photos: photoPayload,
        lastEstimate: estimate,
      });
      const data = await res.json();
      const reply: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: data.reply || "…",
      };
      setMessages((prev) => [...prev, reply]);
      if (data.estimate) setEstimate(data.estimate);
      if (data.leadSubmitted && data.leadId) {
        setLeadSubmitted(data.leadId);
        toast({
          title: "Lead sent to Evergreen",
          description: `Reference: ${data.leadId}`,
        });
      }
    } catch (err: any) {
      toast({
        title: "Connection problem",
        description: err?.message || "Could not reach Sage. Try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    const remaining = 6 - photos.length;
    const arr = Array.from(files).slice(0, remaining);
    arr.forEach((file) => {
      if (file.size > 8 * 1024 * 1024) {
        toast({
          title: "Photo too large",
          description: `${file.name} is over 8MB — please resize.`,
          variant: "destructive",
        });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setPhotos((p) => [
          ...p,
          { id: uid(), dataUrl, name: file.name },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }

  function reset() {
    setMessages([GREETING]);
    setEstimate(null);
    setLeadSubmitted(null);
    setPhotos([]);
    setInput("");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="border-b border-border bg-card">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            <div>
              <div
                className="text-lg leading-tight font-semibold text-primary"
                style={{ fontFamily: "Fraunces, serif", letterSpacing: "-0.01em" }}
                data-testid="text-brand"
              >
                Evergreen Design/Build
              </div>
              <div className="text-xs text-muted-foreground">
                AI bid estimator · Naples & SW Florida
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            data-testid="button-reset"
          >
            <RefreshCw className="w-4 h-4 mr-1.5" />
            Start over
          </Button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 grid lg:grid-cols-[1fr_380px] gap-6">
        {/* Chat panel */}
        <Card className="flex flex-col overflow-hidden" style={{ minHeight: "70vh" }}>
          <div className="px-5 py-3 border-b border-border flex items-center gap-2 bg-secondary/40">
            <Sparkles className="w-4 h-4 text-primary" />
            <div className="text-sm font-medium">Chat with Sage</div>
            <Badge variant="outline" className="ml-auto text-xs font-normal">
              AI assistant
            </Badge>
          </div>

          <ScrollArea className="flex-1">
            <div ref={scrollRef} className="px-5 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} />
              ))}
              {busy && <TypingIndicator />}
            </div>
          </ScrollArea>

          {/* Photo preview strip */}
          {photos.length > 0 && (
            <div className="px-5 pt-3 pb-1 border-t border-border flex gap-2 flex-wrap" data-testid="strip-photos">
              {photos.map((p) => (
                <div key={p.id} className="relative">
                  <img
                    src={p.dataUrl}
                    alt={p.name}
                    className="w-16 h-16 object-cover rounded-md border border-border"
                  />
                  <button
                    onClick={() => setPhotos((arr) => arr.filter((x) => x.id !== p.id))}
                    className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center hover-elevate"
                    data-testid={`button-remove-photo-${p.id}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Composer */}
          <div className="px-5 py-4 border-t border-border bg-card">
            <div className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
                data-testid="input-photo"
              />
              <Button
                size="icon"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={busy || photos.length >= 6}
                title="Attach photos of the site"
                data-testid="button-attach"
              >
                <Paperclip className="w-4 h-4" />
              </Button>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder="Message Sage…"
                rows={1}
                className="resize-none min-h-[42px] max-h-32"
                disabled={busy}
                data-testid="input-message"
              />
              <Button
                onClick={send}
                disabled={busy || !input.trim()}
                size="icon"
                data-testid="button-send"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
              <Leaf className="w-3 h-3" />
              Enter to send · Shift+Enter for new line · Attach photos for a better estimate
            </div>
          </div>
        </Card>

        {/* Quote side panel */}
        <div className="space-y-4">
          <QuoteCard estimate={estimate} leadSubmitted={leadSubmitted} />
          <InfoCard />
        </div>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Evergreen Design/Build logo"
    >
      <circle cx="18" cy="18" r="17" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
      <path
        d="M18 7 C13 13, 13 19, 18 25 C23 19, 23 13, 18 7 Z"
        fill="currentColor"
        className="text-primary"
      />
      <path
        d="M18 14 L18 30"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-primary"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      data-testid={`message-${message.role}-${message.id}`}
    >
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-secondary text-secondary-foreground rounded-bl-sm"
        }`}
      >
        {!isUser && (
          <div className="text-[10px] uppercase tracking-wider opacity-70 mb-1 font-medium">
            Sage
          </div>
        )}
        {message.content}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start" data-testid="indicator-typing">
      <div className="bg-secondary text-secondary-foreground rounded-2xl rounded-bl-sm px-4 py-3">
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    </div>
  );
}

function QuoteCard({
  estimate,
  leadSubmitted,
}: {
  estimate: EstimateResult | null;
  leadSubmitted: string | null;
}) {
  if (!estimate) {
    return (
      <Card className="p-5" data-testid="card-quote-empty">
        <div className="text-sm font-medium mb-1">Your budget range</div>
        <div className="text-xs text-muted-foreground mb-4">
          Chat with Sage about your project. As soon as there's enough info, an
          itemized range will appear here.
        </div>
        <div className="border border-dashed border-border rounded-md p-6 text-center text-xs text-muted-foreground">
          No estimate yet
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5" data-testid="card-quote">
      <div className="flex items-center gap-2 mb-1">
        <div className="text-sm font-medium">Preliminary budget range</div>
        <Badge variant="outline" className="text-[10px] font-normal ml-auto">
          Estimate
        </Badge>
      </div>
      <div className="text-xs text-muted-foreground mb-4">
        {estimate.companyName} · subject to site visit
      </div>

      <div className="rounded-lg bg-secondary/60 border border-border p-4 mb-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
          Total project
        </div>
        <div
          className="text-2xl font-semibold text-primary"
          style={{ fontFamily: "Fraunces, serif" }}
          data-testid="text-total-range"
        >
          {fmt(estimate.total.low)} – {fmt(estimate.total.high)}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Most likely <span className="text-foreground font-medium">{fmt(estimate.total.likely)}</span>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Line items
        </div>
        {estimate.lineItems.map((li, i) => (
          <div
            key={i}
            className="flex justify-between gap-3 text-sm py-1.5 border-b border-border last:border-0"
            data-testid={`row-line-${i}`}
          >
            <div className="min-w-0">
              <div className="font-medium truncate">{li.label}</div>
              <div className="text-[11px] text-muted-foreground">
                {li.unit === "lump_sum"
                  ? `${li.materialTier}`
                  : `${li.quantity.toLocaleString()} ${li.unit.replace("_", " ")} · ${li.materialTier}`}
              </div>
            </div>
            <div className="text-right shrink-0 text-xs">
              <div className="font-medium text-foreground">
                {fmt(li.low)}–{fmt(li.high)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {(estimate.siteAdjustments.length > 0 || estimate.timelineAdjustment) && (
        <div className="space-y-1 mb-4 text-xs">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Adjustments
          </div>
          {estimate.siteAdjustments.map((s, i) => (
            <div key={i} className="flex justify-between text-muted-foreground">
              <span>{s.label}</span>
              <span>{s.amount ? fmt(s.amount) : "applied"}</span>
            </div>
          ))}
          {estimate.timelineAdjustment && (
            <div className="flex justify-between text-muted-foreground">
              <span>{estimate.timelineAdjustment.label}</span>
              <span>
                {estimate.timelineAdjustment.amount >= 0 ? "+" : ""}
                {fmt(estimate.timelineAdjustment.amount)}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between text-xs text-muted-foreground mb-3 pt-3 border-t border-border">
        <span>Design / permit fee</span>
        <span>{fmt(estimate.designFee)}</span>
      </div>

      <div className="text-[11px] text-muted-foreground leading-relaxed border-t border-border pt-3">
        {estimate.notes.map((n, i) => (
          <div key={i}>· {n}</div>
        ))}
      </div>

      {leadSubmitted && (
        <div
          className="mt-4 rounded-md bg-primary/10 border border-primary/20 px-3 py-2.5 flex items-start gap-2"
          data-testid="status-lead-submitted"
        >
          <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs">
            <div className="font-medium text-primary">Sent to Evergreen</div>
            <div className="text-muted-foreground">
              Reference: <span className="font-mono">{leadSubmitted}</span>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function InfoCard() {
  return (
    <Card className="p-5 bg-secondary/40" data-testid="card-info">
      <div className="text-xs font-medium mb-2">How this works</div>
      <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal pl-4">
        <li>Sage asks about your project, materials, and site.</li>
        <li>A live budget range appears as details come together.</li>
        <li>Share contact info and Sage sends your project to the team.</li>
        <li>A designer will follow up within one business day.</li>
      </ol>
    </Card>
  );
}

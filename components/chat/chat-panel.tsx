// components/chat/chat-panel.tsx
// The chat UI (client component): message list, empty-state with example prompts,
// loading indicator, and the input box (Enter to send, Shift+Enter for newline).
// Sends the full running history to /api/chat each turn (the route is stateless).
// History is session-only — not persisted, cleared on refresh. On error the user's
// message is kept and a retry-friendly notice is shown.

"use client";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Bot, User, Send } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

const [loadStatus, setLoadStatus] = useState<"ok" | "partial" | "error">("ok");
const [failedSections, setFailedSections] = useState<string[]>([]);
const EXAMPLES = [
  "What deadlines am I waiting on the Engineer for?",
  "Summarise my open claims and their status.",
  "What does the contract say about the payment period?",
  "Which events don't have a claim raised yet?",
];

function Bubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && <Bot className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />}
      <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
        isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
        {msg.content}
      </div>
      {isUser && <User className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />}
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="space-y-4 pt-8 text-center">
      <Bot className="mx-auto h-10 w-10 text-muted-foreground" />
      <div>
        <h2 className="text-lg font-medium">Ask ClaimGuard</h2>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          I answer from your contract and everything tracked on this project — events,
          evidence, claims, RFIs, follow-ups, and the deadlines the system is watching.
        </p>
      </div>
      <div className="mx-auto grid max-w-md gap-2 text-left">
        {EXAMPLES.map((q) => (
          <button key={q} onClick={() => onPick(q)}
            className="rounded-md border px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? `Chat failed (HTTP ${res.status}).`);
      setMessages((m) => [...m, { role: "assistant", content: json.reply }]);
      setLoadStatus(json.loadStatus ?? "ok");
      setFailedSections(Array.isArray(json.failedSections) ? json.failedSections : []);
    } catch (e: any) {
      console.error("[ChatPanel] send failed:", e);
      setError(e?.message ?? "Something went wrong. Your message is kept — try again.");
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto max-w-2xl space-y-4 p-6">
            {loadStatus === "error" && (
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              ⚠ Your project data couldn't be loaded (a network or connection issue). The
              assistant can only answer general questions until this is resolved — please try
              again shortly.
            </div>
          )}
          {loadStatus === "partial" && (
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              ⚠ Some project data couldn't be loaded this session
              {failedSections.length ? ` (${failedSections.join(", ")})` : ""}. Answers may be
              incomplete — this is a loading issue, not that those records are empty.
            </div>
          )}
          {messages.length === 0
            ? <EmptyState onPick={send} />
            : messages.map((m, i) => <Bubble key={i} msg={m} />)}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Bot className="h-4 w-4 animate-pulse" /> Thinking…
            </div>
          )}
          {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        </div>
      </div>

      <div className="border-t bg-background">
        <div className="mx-auto max-w-2xl p-4">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Ask about your contract, events, claims, deadlines…"
              className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button onClick={() => send(input)} disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Answers come only from your uploaded contract and this project's data. It assists —
            it doesn't send notices or replace your own judgement.
          </p>
        </div>
      </div>
    </div>
  );
}
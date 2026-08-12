"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RfiSuggestionCard } from "@/components/assistant/rfi-suggestion-card";
import type { RfiSeed } from "@/lib/rfi/types";

/**
 * Context-scoped assistant. Mount it in the dashboard layout (or per page) and
 * pass the current surface's context; the server route assembles the event +
 * evidence text from these ids. It never has global project knowledge.
 *
 * Example (events page): <AssistantPanel context={{ surface: "event", eventId }} />
 * Example (inbox item):  <AssistantPanel context={{ surface: "inbox", evidenceId }} />
 * Example (claim):       <AssistantPanel context={{ surface: "claim", claimId }} />
 * Example (rfi):         <AssistantPanel context={{ surface: "rfi", rfiId }} />
 */
export interface AssistantContext {
  surface: "event" | "inbox" | "claim" | "rfi";
  eventId?: string;
  evidenceId?: string;
  claimId?: string;
  rfiId?: string;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  suggestion?: RfiSeed | null;
}

export function AssistantPanel({ context }: { context: AssistantContext }) {
  const [open, setOpen] = React.useState(false);
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [input, setInput] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, pending]);

  async function send() {
    const text = input.trim();
    if (!text || pending) return;

    const nextTurns: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(nextTurns);
    setInput("");
    setPending(true);

    try {
      const res = await fetch("/api/ai/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            surface: context.surface,
            event_id: context.eventId,
            evidence_id: context.evidenceId,
            claim_id: context.claimId,
            rfi_id: context.rfiId,
          },
          messages: nextTurns.map((t) => ({
            role: t.role,
            content: t.content,
          })),
        }),
      });
      const data = await res.json();
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data?.reply ?? "Sorry — I couldn't answer that.",
          suggestion: data?.suggestion ?? null,
        },
      ]);
    } catch {
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button
        className="fixed bottom-4 right-4 z-40 shadow-lg"
        onClick={() => setOpen(true)}
      >
        Ask the assistant
      </Button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 z-40 flex h-[70vh] w-full max-w-sm flex-col border-l border-t bg-background shadow-xl md:bottom-4 md:right-4 md:h-[600px] md:rounded-lg md:border">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-sm font-medium">Assistant</span>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {turns.length === 0 ? (
          <p className="px-1 text-sm text-muted-foreground">
            Ask about this {context.surface === "inbox" ? "inbox item" : context.surface}
            {" "}— what it means, what's unclear, or whether an RFI is worth raising.
          </p>
        ) : null}

        {turns.map((t, i) => (
          <div key={i} className="space-y-2">
            <div
              className={
                t.role === "user"
                  ? "ml-auto max-w-[85%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                  : "mr-auto max-w-[90%] whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm"
              }
            >
              {t.content}
            </div>
            {t.suggestion ? <RfiSuggestionCard seed={t.suggestion} /> : null}
          </div>
        ))}

        {pending ? (
          <div className="mr-auto rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            Thinking…
          </div>
        ) : null}
      </div>

      <div className="border-t p-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Ask a question…"
          rows={2}
          className="resize-none text-sm"
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm" onClick={send} disabled={pending || !input.trim()}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
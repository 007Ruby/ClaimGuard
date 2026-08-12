"use client";

import * as React from "react";
import { CreateRfiButton } from "@/components/rfi/create-rfi-button";
import type { RfiSeed } from "@/lib/rfi/types";

/**
 * Renders an assistant-proposed RFI inline in the chat. The Create RFI button
 * reuses the shared funnel, so this behaves identically to the inbox flag.
 */
export function RfiSuggestionCard({ seed }: { seed: RfiSeed }) {
  const queries = seed.queries ?? [];
  return (
    <div className="rounded-lg border bg-muted/40 p-3 text-sm">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Suggested RFI
      </div>
      {seed.subject ? (
        <div className="font-medium">{seed.subject}</div>
      ) : null}
      {seed.background ? (
        <p className="mt-1 text-muted-foreground">{seed.background}</p>
      ) : null}
      {queries.length ? (
        <ul className="mt-2 list-decimal space-y-1 pl-4">
          {queries.map((q, i) => (
            <li key={i}>
              {q.question}
              {q.contractRef ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  (Sub-Clause {q.contractRef})
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="mt-3">
        <CreateRfiButton seed={seed} label="Create RFI from this" />
      </div>
    </div>
  );
}
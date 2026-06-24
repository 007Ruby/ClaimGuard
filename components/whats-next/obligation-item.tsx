// components/whats-next/obligation-item.tsx
"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { CLAUSES } from "@/lib/fidic/clauses";
import { STATUS_LABEL, type EventStatus } from "@/lib/fidic/engine";

export interface WhatsNextItem {
  eventId: string;
  eventTitle: string;
  status: Exclude<EventStatus, "no_action" | "closed">;
  actionLabel: string;
  actionDescription: string;
  actionDueDate: string | null;
  clauseRef: string | null;
  basisClauses: string[];
  timeBarred: boolean;
}

const ACCENT: Record<WhatsNextItem["status"], string> = {
  overdue: "border-l-red-500",
  action_needed: "border-l-amber-500",
  awaiting: "border-l-blue-400",
};

function daysRemaining(iso: string | null): number | null {
  if (!iso) return null;
  const due = new Date(iso + "T00:00:00.000Z").getTime();
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((due - today) / 86_400_000);
}

function fmt(iso: string | null) {
  if (!iso) return "no fixed date";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", timeZone: "UTC",
  }).format(new Date(iso + "T00:00:00.000Z"));
}

/**
 * Renders one What's Next row. The list is sorted by `actionDueDate` ascending
 * with `overdue` pinned to the top — see the events_status_due_idx query.
 */
export function ObligationItem({ item }: { item: WhatsNextItem }) {
  const rem = daysRemaining(item.actionDueDate);
  const clause = item.clauseRef ? CLAUSES[item.clauseRef] : undefined;
  const isOurs = item.status !== "awaiting";

  return (
    <Card className={`border-l-4 p-4 ${ACCENT[item.status]}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {STATUS_LABEL[item.status]}
            </span>
            {item.timeBarred && (
              <span className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-700">
                <AlertTriangle className="h-3 w-3" /> Time-barred
              </span>
            )}
          </div>

          {/* What */}
          <h3 className="mt-1 font-semibold leading-tight">{item.actionLabel}</h3>
          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
            {item.actionDescription}
          </p>

          {/* Clause + by when */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              <strong className="text-foreground">SC {item.clauseRef}</strong>
              {clause ? ` ${clause.title}` : ""}
            </span>
            {item.basisClauses.length > 0 && (
              <span>basis: {item.basisClauses.map((c) => `SC ${c}`).join(", ")}</span>
            )}
            <span>
              By <strong className="text-foreground">{fmt(item.actionDueDate)}</strong>
              {rem !== null && (
                <span className={rem < 0 ? "ml-1 font-semibold text-red-600" : "ml-1"}>
                  {rem < 0 ? `· ${Math.abs(rem)}d overdue` : `· ${rem}d left`}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Deep-link to the event's home page with the dialog open (?open=id). */}
        <div className="flex shrink-0 flex-col gap-2">
          <Button asChild size="sm" variant={item.status === "overdue" ? "default" : "outline"}>
            <Link href={`/events?open=${item.eventId}`}>
              {isOurs ? "Action" : "View"}
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
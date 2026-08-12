// components/whats-next/obligation-item.tsx
"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { CLAUSES } from "@/lib/fidic/clauses";
import { STATUS_LABEL, type EventStatus, type Remedy, type Urgency } from "@/lib/fidic/engine";
export interface WhatsNextItem {
  eventId: string;
  eventTitle: string;
  status: Exclude<EventStatus, "no_action" | "closed">;
  stepId: string | null;
  actionLabel: string;
  actionDescription: string;
  actionDueDate: string | null;
  clauseRef: string | null;
  basisClauses: string[];
  timeBarred: boolean;
  urgency: "critical" | "soon" | "ok" | "none";
  nominal: boolean;
  remedies: { clauseRef: string; label: string; premature?: boolean }[];
  outstandingAmount: number | null;
}

const ACCENT: Record<WhatsNextItem["urgency"], string> = {
  critical: "border-l-red-500",
  soon: "border-l-amber-500",
  ok: "border-l-blue-400",
  none: "border-l-muted",
};


// Claim-creation steps deep-link into the Claims builder (mode pre-selected).
const CLAIM_STEP_INTENT: Record<string, "notice" | "detailed"> = {
  "20.1-notice": "notice",
  "20.1-particulars": "detailed",
};

// Steps we're waiting on the other party for deep-link into the Follow-ups
// builder to draft a chaser email.
const FOLLOWUP_STEPS = new Set([
  "20.1-response",
  "3.5-determination",
  "14.6-ipc",
  "14.7-payment",
]);


function daysRemaining(iso: string | null): number | null {
  if (!iso) return null;
  const due = new Date(iso + "T00:00:00.000Z").getTime();
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((due - today) / 86_400_000);
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function fmt(date: Date | string | number | null | undefined): string {
  if (date == null) return "—";        // or "" / "No date" — your call
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}
/**
 * Renders one What's Next row. The list is sorted by `actionDueDate` ascending
 * with `overdue` pinned to the top — see the events_status_due_idx query.
 */
export function ObligationItem({ item }: { item: WhatsNextItem }) {
  const rem = daysRemaining(item.actionDueDate);
  const clause = item.clauseRef ? CLAUSES[item.clauseRef] : undefined;

  const intent = item.stepId ? CLAIM_STEP_INTENT[item.stepId] : undefined;
  const isFollowup = item.stepId ? FOLLOWUP_STEPS.has(item.stepId) : false;

  const href = intent
    ? `/claims?event=${item.eventId}&intent=${intent}`
    : isFollowup
      ? `/follow-ups?event=${item.eventId}`
      : `/events?open=${item.eventId}`;
  <Button asChild size="sm" variant={item.urgency === "critical" ? "default" : "outline"}></Button>
  const chasingPayment = item.remedies.some((r) => r.clauseRef === "14.8");
  const label = intent
    ? "Action"
    : chasingPayment
      ? "Chase payment"
      : isFollowup
        ? "Follow up"
        : item.status === "awaiting" ? "View" : "Action";
  return (
    <Card className={`border-l-4 p-4 ${ACCENT[item.urgency]}`}>
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
  <span className={rem < 0 && !item.nominal ? "ml-1 font-semibold text-red-600" : "ml-1"}>
    {rem < 0
      ? item.nominal
        ? `· ${Math.abs(rem)}d elapsed`
        : `· ${Math.abs(rem)}d overdue`
      : `· ${rem}d left`}
  </span>
)}
            </span>
            {item.outstandingAmount != null && item.outstandingAmount > 0 && (
  <span className="font-semibold text-foreground">
    {item.outstandingAmount.toLocaleString()} outstanding
  </span>
)}
          </div>
        </div>

        {/* Claim steps -> Claims; awaited steps -> Follow-ups; else event dialog. */}
        <div className="flex shrink-0 flex-col gap-2">
          <Button asChild size="sm" variant={item.status === "overdue" ? "default" : "outline"}>
            <Link href={href}>{label}</Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
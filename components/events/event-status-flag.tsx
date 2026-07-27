"use client";

import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AlertTriangle, Clock, CheckCircle2, CircleDashed, Pause } from "lucide-react";
import { CLAUSES, STEP_DONE_LABEL } from "@/lib/fidic/clauses";
import { STATUS_LABEL, type EventStatus, type Remedy, type Urgency } from "@/lib/fidic/engine";
import { StepCompleteControl } from "@/components/events/step-complete-control";

const STYLES: Record<
  EventStatus,
  { className: string; icon: React.ElementType }
> = {
  overdue: { className: "bg-red-100 text-red-800 border-red-200", icon: AlertTriangle },
  action_needed: { className: "bg-amber-100 text-amber-900 border-amber-200", icon: Clock },
  awaiting: { className: "bg-blue-100 text-blue-800 border-blue-200", icon: CircleDashed },
  closed: { className: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: CheckCircle2 },
  no_action: { className: "bg-muted text-muted-foreground border-transparent", icon: CircleDashed },
};

export interface EventFlag {
  status: EventStatus;
  eventId?: string;
  stepId?: string;
  actionLabel?: string | null;
  actionDescription?: string | null;
  actionDueDate?: string | null;
  actionParty?: string | null;
  clauseRef?: string | null;
  basisClauses?: string[] | null;
  timeBarred?: boolean | null;
  remedies?: Remedy[];
  urgency?: Urgency;
  nominal?: boolean;
  daysRemaining?: number | null;
  outstandingAmount?: number | null;
}

function fmt(iso?: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(iso + "T00:00:00.000Z"));
}

function daysRemaining(iso?: string | null): number | null {
  if (!iso) return null;
  const due = new Date(iso + "T00:00:00.000Z").getTime();
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((due - today) / 86_400_000);
}

export function EventStatusFlag({ flag }: { flag: EventFlag }) {
  const { className, icon: Icon } = STYLES[flag.status];
  const rem = daysRemaining(flag.actionDueDate);
  const clause = flag.clauseRef ? CLAUSES[flag.clauseRef] : undefined;
  const doneLabel = flag.stepId ? STEP_DONE_LABEL[flag.stepId] : undefined;

  if (flag.status === "no_action") {
    return (
      <Badge variant="outline" className={className}>
        <Icon className="mr-1 h-3 w-3" />
        {STATUS_LABEL.no_action}
      </Badge>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="outline-none">
          <Badge variant="outline" className={`cursor-pointer ${className}`}>
            <Icon className="mr-1 h-3 w-3" />
            {STATUS_LABEL[flag.status]}
            {rem !== null && flag.status !== "closed" && (
              <span className="ml-1 font-semibold">
                {rem < 0 ? `${Math.abs(rem)}d late` : `${rem}d`}
              </span>
            )}
          </Badge>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80 text-sm">
        <div className="font-semibold">{flag.actionLabel ?? STATUS_LABEL[flag.status]}</div>
        <p className="mt-1 text-muted-foreground">{flag.actionDescription}</p>

        <div className="mt-3 grid grid-cols-[88px_1fr] gap-y-1">
          <span className="text-muted-foreground">By</span>
          <span className={rem !== null && rem < 0 ? "font-semibold text-red-700" : "font-medium"}>
            {fmt(flag.actionDueDate)}
            {rem !== null && (
              <span className="ml-1 text-xs">
                ({rem < 0 ? `${Math.abs(rem)} days overdue` : `${rem} days left`})
              </span>
            )}
          </span>

          <span className="text-muted-foreground">Clause</span>
          <span className="font-medium">
            SC {flag.clauseRef}
            {clause ? ` — ${clause.title}` : ""}
            {flag.basisClauses && flag.basisClauses.length > 0 && (
              <span className="text-muted-foreground">
                {" "}(basis: {flag.basisClauses.map((c) => `SC ${c}`).join(", ")})
              </span>
            )}
          </span>

          <span className="text-muted-foreground">Responsible</span>
          <span className="font-medium capitalize">{flag.actionParty}</span>
        </div>

        {flag.timeBarred && (
          <div className="mt-3 flex items-start gap-2 rounded-md bg-red-50 p-2 text-xs text-red-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Time-barred under SC 20.1 — missing this deadline forfeits the time
              and money claim entirely. The Employer is discharged from liability.
            </span>
          </div>
        )}

        {/* SC 16.1 suspension remedy, when a payment cycle is overdue. */}
        {(flag.remedies ?? []).map((r) => (
  <div key={r.clauseRef} className="mt-3 rounded-md border border-dashed p-2 text-xs">
    <div className="flex items-center gap-1.5 font-medium">
      {r.premature
        ? <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
        : <Pause className="h-3.5 w-3.5" />}
      {r.label}
    </div>
    <p className="mt-1 text-muted-foreground">{r.description}</p>
    {r.clauseRef === "16.1" && !r.noticeGiven && flag.eventId && (
      <div className="mt-2">
        <StepCompleteControl eventId={flag.eventId} stepId="16.1-notice" label="Mark 16.1 notice given" />
      </div>
    )}
  </div>
))}

        {/* Advance the chain: record that this step was done. */}
        {flag.eventId && flag.stepId && doneLabel && flag.status !== "closed" && (
          <div className="mt-3">
            <StepCompleteControl eventId={flag.eventId} stepId={flag.stepId} label={doneLabel} />
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
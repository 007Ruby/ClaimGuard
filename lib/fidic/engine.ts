/**
 * lib/fidic/engine.ts
 * ---------------------------------------------------------------------------
 * Deterministic status + deadline engine.
 *
 * Given an event (its category and the dates we know about it), this resolves
 * the CURRENT obligation, its deadline, its contract clause and the event's
 * status flag. No AI here — only the contract's fixed time bars. The AI layer
 * supplies the precise `clauseRef`/wording and writes them onto the event;
 * this engine then schedules and ages the deadlines.
 * ---------------------------------------------------------------------------
 */

import {
  CATEGORY_ROUTES,
  CLAUSES,
  getStep,
  type ClauseStep,
  type DeadlineAnchor,
} from "./clauses";

export type EventStatus =
  | "no_action"
  | "action_needed"
  | "awaiting"
  | "overdue"
  | "closed";

/** The dates the engine reasons over. All optional except awareness/event date. */
export interface EventTimeline {
  type: string; // variation | delay | payment | instruction | site_issue | other
  awarenessDate: string; // ISO — when aware of the event (defaults to event date)
  noticeDate?: string | null; // when our 20.1 notice was served
  submissionDate?: string | null; // when particulars / Statement submitted
  engineerReceiptDate?: string | null; // when Engineer received the claim / statement
  /** id of the step we have already completed (e.g. "20.1-notice"). */
  lastCompletedStepId?: string | null;
  /** when our 16.1 suspension notice was given. */
  suspensionNoticeDate?: string | null;
  /** explicitly closed by the user (claim determined / no further action). */
  closed?: boolean;
}

/** A secondary remedy (e.g. SC 16.1 suspension) surfaced alongside the flag. */
export interface Remedy {
  clauseRef: string;
  label: string;
  description: string;
  noticeGiven: boolean;
  availableFrom?: string; // ISO, once the 16.1 notice starts the 21-day clock
}

/** Loaded from the project contract data; only what the engine needs. */
export interface ContractContext {
  commencementDate: string; // ISO
  /** Per-clause day overrides if the Particular Conditions change a default. */
  dayOverrides?: Record<string, number>; // e.g. { "14.7-payment": 56 }
}

export interface Obligation {
  stepId: string;
  label: string;
  clauseRef: string; // the procedural clause that owns the step
  basisClauses: string[]; // entitlement clauses to cite in the action / claim
  party: ClauseStep["party"];
  description: string;
  dueDate: string; // ISO
  daysRemaining: number; // negative once overdue
  timeBarred: boolean;
  status: EventStatus;
  remedy?: Remedy; // e.g. SC 16.1 suspension, when a payment cycle is overdue
}

const DAY_MS = 86_400_000;

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetweenTodayAnd(iso: string, today: Date): number {
  const due = new Date(iso + "T00:00:00.000Z").getTime();
  const now = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  return Math.round((due - now) / DAY_MS);
}

/** Resolve the anchor date for a step from the timeline + contract. */
function anchorDate(
  anchor: DeadlineAnchor,
  tl: EventTimeline,
  contract: ContractContext,
): string | null {
  switch (anchor) {
    case "awareness_date":
      return tl.awarenessDate;
    case "notice_date":
      return tl.noticeDate ?? null;
    case "submission_date":
      return tl.submissionDate ?? null;
    case "engineer_receipt_date":
      return tl.engineerReceiptDate ?? tl.submissionDate ?? null;
    case "suspension_notice_date":
      return tl.suspensionNoticeDate ?? null;
    case "commencement_date":
      return contract.commencementDate;
  }
}

/** Walk the clause chain to find the first step that is not yet completed. */
function nextOpenStep(
  entryStepId: string,
  lastCompletedStepId: string | null | undefined,
): ClauseStep | undefined {
  let step = getStep(entryStepId);
  // advance past everything already completed
  if (lastCompletedStepId) {
    while (step && step.id !== lastCompletedStepId && step.nextStepId) {
      step = getStep(step.nextStepId);
    }
    // if we landed on the completed step, move to the one after it
    if (step && step.id === lastCompletedStepId) {
      step = step.nextStepId ? getStep(step.nextStepId) : undefined;
    }
  }
  return step;
}

/**
 * The core call. Returns the single current obligation for an event, or null
 * when the category creates no automatic obligation (status -> no_action).
 */
export function resolveObligation(
  tl: EventTimeline,
  contract: ContractContext,
  today: Date = new Date(),
): Obligation | null {
  if (tl.closed) {
    return closedObligation(tl);
  }

  const route = CATEGORY_ROUTES[tl.type];
  if (!route) return null; // "other" / unmapped -> no_action

  const step = nextOpenStep(route.entryStepId, tl.lastCompletedStepId);
  if (!step) return closedObligation(tl); // chain exhausted

  const anchorIso = anchorDate(step.from, tl, contract);
  // If we cannot anchor a date yet (e.g. notice not served), surface the step
  // as action_needed with no firm deadline rather than guessing one.
  const days = contract.dayOverrides?.[step.id] ?? step.days;
  const dueDate = anchorIso ? addDays(anchorIso, days) : "";
  const daysRemaining = dueDate ? daysBetweenTodayAnd(dueDate, today) : days;

  const isOurStep = step.party === "contractor";
  let status: EventStatus;
  if (!isOurStep) {
    status = "awaiting"; // waiting on Engineer/Employer to respond / certify / pay
  } else if (dueDate && daysRemaining < 0) {
    status = "overdue";
  } else {
    status = "action_needed";
  }

  const obligation: Obligation = {
    stepId: step.id,
    label: step.label,
    clauseRef: route.procedureClause,
    basisClauses: route.basisClauses,
    party: step.party,
    description: step.description,
    dueDate,
    daysRemaining,
    timeBarred: step.timeBarred,
    status,
  };

  // Payment-overdue consequences: when the Engineer is late certifying (14.6)
  // or the Employer is late paying (14.7), surface the Contractor's remedies.
  if (
    tl.type === "payment" &&
    dueDate &&
    daysRemaining < 0 &&
    (step.id === "14.6-ipc" || step.id === "14.7-payment")
  ) {
    const remedy = suspensionRemedy(tl); // SC 16.1
    if (step.id === "14.7-payment") {
      // Employer late paying -> financing charges become a live action (14.8).
      const fin = getStep("14.8-financing");
      return {
        stepId: "14.8-financing",
        label: fin?.label ?? "Claim financing charges",
        clauseRef: "14.8",
        basisClauses: ["14.7"],
        party: "contractor",
        description: fin?.description ?? "Claim financing charges under SC 14.8.",
        dueDate: "",
        daysRemaining, // how many days payment is overdue
        timeBarred: false,
        status: "action_needed",
        remedy,
      };
    }
    // 14.6 late certification -> keep awaiting, attach the remedy.
    return { ...obligation, remedy };
  }

  return obligation;
}

/** SC 16.1: the suspension remedy available once a payment cycle is overdue. */
function suspensionRemedy(tl: EventTimeline): Remedy {
  const noticeGiven = !!tl.suspensionNoticeDate;
  const availableFrom = noticeGiven
    ? addDays(tl.suspensionNoticeDate as string, 21)
    : undefined;
  return {
    clauseRef: "16.1",
    label: noticeGiven ? "Suspension right maturing (SC 16.1)" : "Suspension available (SC 16.1)",
    description: noticeGiven
      ? `You gave 21-day notice on ${tl.suspensionNoticeDate}. You may suspend or reduce the rate of work from ${availableFrom} until payment/certification is remedied.`
      : "You may give the Employer not less than 21 days' notice under Sub-Clause 16.1, then suspend or reduce the rate of work until payment/certification is remedied.",
    noticeGiven,
    availableFrom,
  };
}

function closedObligation(tl: EventTimeline): Obligation {
  return {
    stepId: tl.lastCompletedStepId ?? "closed",
    label: "Closed",
    clauseRef: "",
    basisClauses: [],
    party: "contractor",
    description: "No further contractual action outstanding.",
    dueDate: "",
    daysRemaining: 0,
    timeBarred: false,
    status: "closed",
  };
}

/** Urgency bucket for sorting / colouring What's Next and the flag. */
export function urgency(o: Obligation): "critical" | "soon" | "ok" | "none" {
  if (o.status === "overdue") return "critical";
  if (o.status === "no_action" || o.status === "closed") return "none";
  if (o.status === "awaiting") {
    // The other party (Engineer/Employer) is past their response deadline:
    // surface it so the Contractor can chase and preserve rights (14.8 / 16.1).
    return o.daysRemaining < 0 ? "soon" : "ok";
  }
  if (o.timeBarred && o.daysRemaining <= 7) return "critical";
  if (o.daysRemaining <= 7) return "soon";
  return "ok";
}

/** Human label for the flag + What's Next badge. */
export const STATUS_LABEL: Record<EventStatus, string> = {
  no_action: "No action",
  action_needed: "Action needed",
  awaiting: "Awaiting",
  overdue: "Overdue",
  closed: "Closed",
};
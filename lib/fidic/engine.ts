/**
 * lib/fidic/engine.ts
 * ---------------------------------------------------------------------------
 * Deterministic status + deadline engine.
 *
 * Given an event's dates and amounts, this resolves the CURRENT obligation,
 * its deadline, its clause and the event's status flag. No AI here.
 *
 * Step position is DERIVED: the engine walks the clause chain and returns the
 * first step whose `satisfiedBy` rule is not met. There is no stored pointer,
 * so a stale or cross-chain step id can no longer silently close an event.
 * ---------------------------------------------------------------------------
 */

import {
  CATEGORY_ROUTES,
  getStep,
  type ClauseStep,
  type DeadlineAnchor,
  type TimelineDateField,
} from "./clauses";

export type EventStatus =
  | "no_action"
  | "action_needed"
  | "awaiting"
  | "overdue"
  | "closed";

export type Urgency = "critical" | "soon" | "ok" | "none";

/** The facts the engine reasons over. One field per real-world event. */
export interface EventTimeline {
  type: string;
  /** ISO — when aware of the event. Defaults to the event date. */
  awarenessDate: string;

  /* Claim chain */
  noticeDate?: string | null; // our 20.1 notice served
  submissionDate?: string | null; // our particulars / Statement sent
  engineerReceiptDate?: string | null; // Engineer RECEIVED it (anchor only)
  engineerResponseDate?: string | null; // Engineer's 20.1 response received
  determinationDate?: string | null; // 3.5 determination received

  /* Payment chain */
  ipcIssuedDate?: string | null; // IPC issued (satisfies 14.6)
  certifiedAmount?: number | null; // sum certified in the IPC
  paymentReceivedDate?: string | null; // money landed
  amountReceived?: number | null; // what actually landed

  /* Remedies */
  suspensionNoticeDate?: string | null; // our 16.1 notice

  /** Explicitly closed by the user (withdrawn / superseded / settled). */
  closed?: boolean;
}

export interface Remedy {
  clauseRef: string;
  label: string;
  description: string;
  /** Has the prerequisite notice been given? (16.1 only.) */
  noticeGiven: boolean;
  /** ISO — when the right becomes exercisable. */
  availableFrom?: string;
  /**
   * True where a 16.1 notice was given BEFORE any 14.6/14.7 default existed.
   * A premature notice is invalid; suspending on it puts you in breach.
   */
  premature?: boolean;
  /** Amount the remedy bites on (14.8 accrues on the outstanding balance). */
  amount?: number;
  /** ISO — when the underlying default arose. */
  accruesFrom?: string;
}

export interface ContractContext {
  commencementDate: string;
  /** Per-step day overrides from the Particular Conditions. */
  dayOverrides?: Record<string, number>;
}

export interface Obligation {
  stepId: string;
  label: string;
  clauseRef: string;
  basisClauses: string[];
  party: ClauseStep["party"];
  description: string;
  /** ISO, or "" where no anchor exists yet. */
  dueDate: string;
  /** Negative once past the due date. Null where there is no anchor. */
  daysRemaining: number | null;
  timeBarred: boolean;
  /** Indicative period only — never presented as a breach. */
  nominal: boolean;
  status: EventStatus;
  urgency: Urgency;
  /** Outstanding balance on a payment event, where amounts are known. */
  outstandingAmount?: number;
  /** Consequences that attach while this step is in default. */
  remedies: Remedy[];
}

const DAY_MS = 86_400_000;

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function toUtcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function daysBetweenTodayAnd(iso: string, today: Date): number {
  const due = new Date(iso + "T00:00:00.000Z").getTime();
  return Math.round((due - toUtcMidnight(today)) / DAY_MS);
}

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
    // Receipt is the true anchor; fall back to despatch where receipt is not
    // evidenced, since the other side will not concede a later date for free.
    case "engineer_receipt_date":
      return tl.engineerReceiptDate ?? tl.submissionDate ?? null;
    case "engineer_response_date":
      return tl.engineerResponseDate ?? null;
    case "suspension_notice_date":
      return tl.suspensionNoticeDate ?? null;
    case "commencement_date":
      return contract.commencementDate;
  }
}

function dateField(
  tl: EventTimeline,
  field: TimelineDateField,
): string | null | undefined {
  return tl[field];
}

/** Outstanding balance, or null where amounts are unknown. */
export function outstanding(tl: EventTimeline): number | null {
  if (tl.certifiedAmount == null) return null;
  return Math.max(0, tl.certifiedAmount - (tl.amountReceived ?? 0));
}

/** Is this step proved complete by the facts on the event? */
export function isSatisfied(step: ClauseStep, tl: EventTimeline): boolean {
  const rule = step.satisfiedBy;
  if (rule.kind === "date") {
    return !!dateField(tl, rule.field);
  }
  // Payment: money must have landed AND cover the certified sum. Where no
  // certified amount is recorded we cannot test the shortfall, so a payment
  // date alone discharges it.
  if (!tl.paymentReceivedDate) return false;
  const bal = outstanding(tl);
  return bal === null || bal === 0;
}

/**
 * Walk the chain from the route entry and return the first unsatisfied step.
 * Returns null when every step is satisfied — the only route to `closed`.
 */
function nextOpenStep(
  entryStepId: string,
  tl: EventTimeline,
): ClauseStep | null {
  const seen = new Set<string>();
  let step = getStep(entryStepId);
  while (step && !seen.has(step.id)) {
    seen.add(step.id);
    if (!isSatisfied(step, tl)) return step;
    if (!step.nextStepId) return null; // terminal step satisfied -> closed
    step = getStep(step.nextStepId);
  }
  return null;
}

function stepDue(
  step: ClauseStep,
  tl: EventTimeline,
  contract: ContractContext,
): string {
  const days = contract.dayOverrides?.[step.id] ?? step.days;
  // A null period means the clause fixes no deadline — surface the step as an
  // action with no clock rather than inventing one.
  if (days === null) return "";
  const anchorIso = anchorDate(step.from, tl, contract);
  if (!anchorIso) return "";
  return addDays(anchorIso, days);
}

/* ------------------------------------------------------------------ */
/* Remedies: 14.8 financing charges and 16.1 suspension.               */
/*                                                                     */
/* These are NOT chain steps. They are consequences that attach while  */
/* 14.6 or 14.7 is in default, and they fall away when it is remedied. */
/* ------------------------------------------------------------------ */

function paymentRemedies(
  tl: EventTimeline,
  contract: ContractContext,
  today: Date,
): Remedy[] {
  if (tl.type !== "payment") return [];

  const ipcStep = getStep("14.6-ipc");
  const payStep = getStep("14.7-payment");
  if (!ipcStep || !payStep) return [];

  const ipcDue = stepDue(ipcStep, tl, contract);
  const payDue = stepDue(payStep, tl, contract);

  // 14.6 default: the certifying deadline passed with no IPC issued.
  const ipcDefault =
    !!ipcDue && !tl.ipcIssuedDate && daysBetweenTodayAnd(ipcDue, today) < 0;
  // 14.7 default: the payment deadline passed without the certified sum.
  const payDefault =
    !!payDue &&
    !isSatisfied(payStep, tl) &&
    daysBetweenTodayAnd(payDue, today) < 0;

  if (!ipcDefault && !payDefault) return [];

  // The earliest default is what a 16.1 notice may be founded on.
  const defaultDates = [
    ipcDefault ? ipcDue : null,
    payDefault ? payDue : null,
  ].filter((d): d is string => !!d);
  const defaultArose = defaultDates.sort()[0];

  const remedies: Remedy[] = [];
  const bal = outstanding(tl);

  if (payDefault) {
    remedies.push({
      clauseRef: "14.8",
      label: "Financing charges accruing (SC 14.8)",
      description:
        bal != null
          ? `Payment fell due on ${payDue}. Financing charges accrue, compounded monthly, on the outstanding ${bal.toLocaleString()} under Sub-Clause 14.8. No notice is required for the entitlement to arise. Rate = [INSERT, e.g. EIBOR + 3%].`
          : `Payment fell due on ${payDue}. Financing charges accrue, compounded monthly, on the overdue amount under Sub-Clause 14.8. No notice is required for the entitlement to arise. Rate = [INSERT]. Outstanding balance = [INSERT].`,
      noticeGiven: true, // 14.8 needs none
      amount: bal ?? undefined,
      accruesFrom: payDue,
    });
  }

  // 16.1: only meaningful once a default exists, and only valid if the notice
  // was given ON OR AFTER the default arose.
  if (tl.suspensionNoticeDate) {
    const premature = tl.suspensionNoticeDate < defaultArose;
    remedies.push({
      clauseRef: "16.1",
      label: premature
        ? "Suspension notice premature (SC 16.1)"
        : "Suspension right maturing (SC 16.1)",
      description: premature
        ? `Your 16.1 notice is dated ${tl.suspensionNoticeDate}, but no failure to certify or pay had arisen until ${defaultArose}. A notice given before the default is invalid — suspending on it would put you in breach. Re-serve it dated on or after ${defaultArose}.`
        : `You gave 21 days' notice on ${tl.suspensionNoticeDate}, founded on the failure arising ${defaultArose}. You may suspend or reduce the rate of work from ${addDays(tl.suspensionNoticeDate, 21)} until payment/certification is remedied.`,
      noticeGiven: true,
      premature,
      availableFrom: premature
        ? undefined
        : addDays(tl.suspensionNoticeDate, 21),
      accruesFrom: defaultArose,
    });
  } else {
    remedies.push({
      clauseRef: "16.1",
      label: "Suspension available (SC 16.1)",
      description: `A failure to ${ipcDefault ? "certify (SC 14.6)" : "pay (SC 14.7)"} arose on ${defaultArose}. You may give the Employer not less than 21 days' notice under Sub-Clause 16.1, then suspend or reduce the rate of work until it is remedied.`,
      noticeGiven: false,
      accruesFrom: defaultArose,
    });
  }

  return remedies;
}

/* ------------------------------------------------------------------ */
/* Core resolution                                                     */
/* ------------------------------------------------------------------ */

export function resolveObligation(
  tl: EventTimeline,
  contract: ContractContext,
  today: Date = new Date(),
): Obligation | null {
  const route = CATEGORY_ROUTES[tl.type];
  if (!route) return null; // "other" / unmapped -> no_action

  if (tl.closed) return closedObligation("Closed by user.");

  const step = nextOpenStep(route.entryStepId, tl);
  if (!step) {
    return closedObligation(
      tl.type === "payment"
        ? "Certified sum received in full. No further contractual action outstanding."
        : "Determination received. No further contractual action outstanding.",
    );
  }

  const dueDate = stepDue(step, tl, contract);
  const daysRemaining = dueDate ? daysBetweenTodayAnd(dueDate, today) : null;
  const late = daysRemaining !== null && daysRemaining < 0;

  // The flag reflects WHO must act. A counterparty blowing their deadline
  // stays `awaiting` — we cannot mark them overdue on our own event — but the
  // urgency goes critical so it surfaces at the top of What's Next.
  const ours = step.party === "contractor";
  const status: EventStatus = ours
    ? late && !step.nominal
      ? "overdue"
      : "action_needed"
    : "awaiting";

  const remedies = paymentRemedies(tl, contract, today);
  const bal = outstanding(tl);

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
    nominal: step.nominal,
    status,
    urgency: "ok",
    outstandingAmount: bal ?? undefined,
    remedies,
  };
  obligation.urgency = urgency(obligation);
  return obligation;
}

function closedObligation(description: string): Obligation {
  return {
    stepId: "closed",
    label: "Closed",
    clauseRef: "",
    basisClauses: [],
    party: "contractor",
    description,
    dueDate: "",
    daysRemaining: null,
    timeBarred: false,
    nominal: false,
    status: "closed",
    urgency: "none",
    remedies: [],
  };
}

/** Urgency bucket for sorting / colouring What's Next and the flag. */
export function urgency(o: Obligation): Urgency {
  if (o.status === "no_action" || o.status === "closed") return "none";
  if (o.status === "overdue") return "critical";

  const days = o.daysRemaining;

  if (o.status === "awaiting") {
    if (days === null || days >= 0) return "ok";
    // A nominal period carries no breach, so a late determination is a chase,
    // never a red flag. A blown 14.6/14.7 or 20.1 response is critical.
    return o.nominal ? "soon" : "critical";
  }

  // action_needed
  if (days === null) return "soon"; // no anchor yet — needs attention to start the clock
  if (o.timeBarred && days <= 7) return "critical";
  if (days <= 7) return "soon";
  return "ok";
}

export const STATUS_LABEL: Record<EventStatus, string> = {
  no_action: "No action",
  action_needed: "Action needed",
  awaiting: "Awaiting",
  overdue: "Overdue",
  closed: "Closed",
};
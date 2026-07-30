/**
 * lib/fidic/clauses.ts
 * ---------------------------------------------------------------------------
 * FIDIC Red Book 1999 clause registry + time-bar rules.
 *
 * The deterministic backbone of the proactive workflow. Deadlines here are
 * fixed by the contract and computed by `lib/fidic/engine.ts`. The AI layer
 * only chooses WHICH clause applies and writes the human-readable wording —
 * it never invents a time bar.
 *
 * Two rules govern this file:
 *   1. One column, one fact. A step's `from` anchor and the column that
 *      SATISFIES it are never the same column.
 *   2. Step position is derived. Each step declares `satisfiedBy`; the engine
 *      walks the chain and returns the first unsatisfied step. There is no
 *      stored `last_completed_step_id`.
 * ---------------------------------------------------------------------------
 */

export type Party = "contractor" | "engineer" | "employer";

export type ObligationKind =
  | "notice"
  | "particulars"
  | "submission"
  | "response"
  | "payment";

/** What the time-bar days are measured FROM. */
export type DeadlineAnchor =
  | "awareness_date"
  | "notice_date"
  | "submission_date"
  | "engineer_receipt_date"
  | "engineer_response_date"
  | "suspension_notice_date"
  | "commencement_date";

/**
 * Date fields on the timeline. These map 1:1 to columns on `events` and each
 * records exactly one real-world fact.
 */
export type TimelineDateField =
  | "noticeDate"
  | "submissionDate"
  | "engineerReceiptDate"
  | "engineerResponseDate"
  | "determinationDate"
  | "ipcIssuedDate"
  | "paymentReceivedDate"
  | "suspensionNoticeDate";


  /* ------------------------------------------------------------------ */
/* Editable contractual periods                                        */
/* ------------------------------------------------------------------ */

export type DayOverrides = Record<string, number>;

export interface EditablePeriod {
  key: string;        // matches the step id where a step exists
  clauseRef: string;
  label: string;
  defaultDays: number; // FIDIC GC default
  hint: string;
}

/** The six periods surfaced for editing. Order is display order. */
export const EDITABLE_PERIODS: EditablePeriod[] = [
  { key: "20.1-notice",      clauseRef: "20.1", label: "Notice of claim",       defaultDays: 28, hint: "Days to serve the claim notice (time-bar)" },
  { key: "20.1-particulars", clauseRef: "20.1", label: "Detailed particulars",  defaultDays: 42, hint: "Days to submit the fully detailed claim" },
  { key: "20.1-response",    clauseRef: "20.1", label: "Engineer's response",   defaultDays: 42, hint: "Days for the Engineer to respond after receipt" },
  { key: "14.6-ipc",         clauseRef: "14.6", label: "IPC issuance",          defaultDays: 28, hint: "Days for the Engineer to issue the IPC after receiving the Statement" },
  { key: "14.7-payment",     clauseRef: "14.7", label: "Payment",               defaultDays: 56, hint: "Days for the Employer to pay after the Engineer receives the Statement" },
  { key: "16.1-notice",      clauseRef: "16.1", label: "Suspension notice",     defaultDays: 21, hint: "Minimum days' notice before suspending work for non-payment" },
];

/**
 * The effective time bar for a step: contract override if present and valid,
 * otherwise the ClauseStep's own `days`, otherwise the EDITABLE_PERIODS
 * default (covers 16.1-notice, which has no ClauseStep). Nullable is
 * preserved for nominal steps that fix no period.
 *
 * Accepts a step object (in-chain) or a bare id (e.g. "16.1-notice").
 */
export function resolveDays(
  step: ClauseStep | string,
  dayOverrides?: DayOverrides | null,
): number | null {
  const id = typeof step === "string" ? step : step.id;
  const o = dayOverrides?.[id];
  if (typeof o === "number" && o > 0) return o;
  if (typeof step !== "string") return step.days;
  const found = getStep(id);
  if (found) return found.days;
  const period = EDITABLE_PERIODS.find((p) => p.key === id);
  return period ? period.defaultDays : null;
}

/**
 * How a step is proved complete.
 *  - `date`    : the named field is populated.
 *  - `payment` : payment_received_date is populated AND the amount received
 *                covers the certified amount. Part payment leaves it open.
 */
export type SatisfactionRule =
  | { kind: "date"; field: TimelineDateField }
  | { kind: "payment" };

export interface ClauseStep {
  id: string;
  label: string;
  party: Party;
  kind: ObligationKind;
  /** The time bar in calendar days, or null where the clause fixes no period. */
  days: number | null;
  from: DeadlineAnchor;
  timeBarred: boolean;
  /** True where FIDIC states no hard period — the deadline is indicative only. */
  nominal: boolean;
  /** What proves this step done. */
  satisfiedBy: SatisfactionRule;
  /**
   * Where a step TRANSMITS something to the Engineer, the field recording
   * their receipt of it. Receipt is not an obligation — nobody can be in
   * default of it — so it is never a step of its own. It is captured
   * alongside the submission, because it is the anchor the counterparty's
   * clock then runs from.
   */
  receiptField?: TimelineDateField;
  /** Completing this step ends the chain and closes the event. */
  closesEvent: boolean;
  description: string;
  nextStepId?: string;
}

export interface Clause {
  ref: string;
  title: string;
  kind: "entitlement" | "procedure" | "payment" | "administration";
  summary: string;
  steps: ClauseStep[];
}

/* ------------------------------------------------------------------ */
/* Clause registry                                                     */
/* ------------------------------------------------------------------ */

export const CLAUSES: Record<string, Clause> = {
  "20.1": {
    ref: "20.1",
    title: "Contractor's Claims",
    kind: "procedure",
    summary:
      "Procedure and time bars for claiming extension of time and/or additional payment.",
    steps: [
      {
        id: "20.1-notice",
        label: "Serve notice of claim",
        party: "contractor",
        kind: "notice",
        days: 28,
        from: "awareness_date",
        timeBarred: true,
        nominal: false,
        satisfiedBy: { kind: "date", field: "noticeDate" },
        closesEvent: false,
        description:
          "Give notice to the Engineer describing the event or circumstance giving rise to the claim. No later than 28 days after becoming aware — otherwise time/payment entitlement is lost and the Employer is discharged.",
        nextStepId: "20.1-particulars",
      },
      {
        id: "20.1-particulars",
        label: "Submit fully detailed claim",
        party: "contractor",
        kind: "particulars",
        days: 42,
        from: "awareness_date",
        timeBarred: false,
        nominal: false,
        satisfiedBy: { kind: "date", field: "submissionDate" },
        receiptField: "engineerReceiptDate",
        closesEvent: false,
        description:
          "Send the Engineer a fully detailed claim with full supporting particulars of the basis of the claim and of the time and/or money claimed, within 42 days of becoming aware.",
        nextStepId: "20.1-response",
      },
      {
        id: "20.1-response",
        label: "Await Engineer's response",
        party: "engineer",
        kind: "response",
        days: 42,
        from: "engineer_receipt_date",
        timeBarred: false,
        nominal: false,
        satisfiedBy: { kind: "date", field: "engineerResponseDate" },
        closesEvent: false,
        description:
          "The Engineer responds with approval or disapproval and detailed comments within 42 days of RECEIVING the claim or further particulars, then proceeds under 3.5 to agree or determine.",
        nextStepId: "3.5-determination",
      },
    ],
  },

  "3.5": {
    ref: "3.5",
    title: "Determinations",
    kind: "procedure",
    summary:
      "Failing agreement, the Engineer makes a fair determination of the claim.",
    steps: [
      {
        id: "3.5-determination",
        label: "Await Engineer's determination",
        party: "engineer",
        kind: "response",
        days: 42,
        from: "engineer_response_date",
        timeBarred: false,
        // FIDIC fixes no period for the determination itself. 42 days is our
        // house convention for when to chase — never presented as a breach.
        nominal: true,
        satisfiedBy: { kind: "date", field: "determinationDate" },
        closesEvent: true,
        description:
          "Following the response, the Engineer proceeds under Sub-Clause 3.5 to agree or fairly determine the claim. FIDIC sets no fixed period; chase if unreasonably delayed.",
      },
    ],
  },

  "14.3": {
    ref: "14.3",
    title: "Application for Interim Payment Certificates",
    kind: "payment",
    summary:
      "The Contractor submits a monthly Statement to the Engineer. Receipt of that Statement starts both payment clocks.",
    steps: [
      {
        id: "14.3-statement",
        label: "Submit Statement to the Engineer",
        party: "contractor",
        kind: "submission",
        // SC 14.3 fixes no time bar on the Contractor — the Statement is
        // submitted monthly. Nothing is forfeited by delay, you simply do not
        // get paid. So: a prompt, not a clock.
        days: null,
        from: "awareness_date",
        timeBarred: false,
        nominal: true,
        satisfiedBy: { kind: "date", field: "submissionDate" },
        receiptField: "engineerReceiptDate",
        closesEvent: false,
        description:
          "Submit the Statement, with supporting documents, to the Engineer. Record the date the Engineer RECEIVES it — that receipt starts both the 28-day certification period (SC 14.6) and the 56-day payment period (SC 14.7).",
        nextStepId: "14.6-ipc",
      },
    ],
  },

  "14.6": {
    ref: "14.6",
    title: "Issue of Interim Payment Certificates",
    kind: "payment",
    summary:
      "After a Statement is received, the Engineer must issue the Interim Payment Certificate within 28 days.",
    steps: [
      {
        id: "14.6-ipc",
        label: "Engineer issues IPC",
        party: "engineer",
        kind: "response",
        // Both the 28-day and the 56-day clock run from the SAME anchor: the
        // Engineer's receipt of the Statement. 56 is not 28 + 56.
        days: 28,
        from: "engineer_receipt_date",
        timeBarred: false,
        nominal: false,
        satisfiedBy: { kind: "date", field: "ipcIssuedDate" },
        closesEvent: false,
        description:
          "The Engineer issues the Interim Payment Certificate within 28 days after receiving the Statement and supporting documents.",
        nextStepId: "14.7-payment",
      },
    ],
  },

  "14.7": {
    ref: "14.7",
    title: "Payment",
    kind: "payment",
    summary:
      "The Employer must pay a certified interim amount within 56 days of the Engineer receiving the Statement.",
    steps: [
      {
        id: "14.7-payment",
        label: "Employer pays certified amount",
        party: "employer",
        kind: "payment",
        days: 56,
        from: "engineer_receipt_date",
        timeBarred: false,
        nominal: false,
        satisfiedBy: { kind: "payment" },
        closesEvent: true,
        description:
          "The Employer pays the amount certified in each Interim Payment Certificate within 56 days after the Engineer receives the Statement. Part payment does not discharge the obligation.",
      },
    ],
  },

  /* --- Remedies. Not chain steps: they attach to a defaulted payment. --- */

  "14.8": {
    ref: "14.8",
    title: "Delayed Payment",
    kind: "payment",
    summary:
      "If payment is late, the Contractor is entitled to financing charges compounded monthly on the overdue amount.",
    steps: [],
  },

  "16.1": {
    ref: "16.1",
    title: "Contractor's Entitlement to Suspend Work",
    kind: "administration",
    summary:
      "On non-certification (14.6) or non-payment (14.7), the Contractor may, after not less than 21 days' notice, suspend or reduce the rate of work.",
    steps: [],
  },

  /* --- Entitlement / basis clauses. No procedure of their own. --- */

  "8.4": {
    ref: "8.4",
    title: "Extension of Time for Completion",
    kind: "entitlement",
    summary:
      "Entitlement to extend the Time for Completion for qualifying delay events. Claimed through the 20.1 procedure.",
    steps: [],
  },
  "13.1": {
    ref: "13.1",
    title: "Right to Vary",
    kind: "administration",
    summary:
      "The Engineer may instruct Variations. The Contractor is bound unless he gives prompt notice that he cannot readily obtain the Goods.",
    steps: [],
  },
  "13.3": {
    ref: "13.3",
    title: "Variation Procedure",
    kind: "procedure",
    summary:
      "On a request to propose, the Contractor responds with a proposal; the Variation is then valued. Time/cost effects are claimed under 20.1.",
    steps: [],
  },
  "2.1": {
    ref: "2.1",
    title: "Right of Access to the Site",
    kind: "administration",
    summary:
      "The Employer must give access/possession by the time stated in the Appendix to Tender. Late access => claim under 20.1.",
    steps: [],
  },
  "4.12": {
    ref: "4.12",
    title: "Unforeseeable Physical Conditions",
    kind: "procedure",
    summary:
      "On encountering adverse unforeseeable physical conditions, give notice to the Engineer; time/cost claimed under 20.1.",
    steps: [],
  },
  "1.3": {
    ref: "1.3",
    title: "Communications",
    kind: "administration",
    summary:
      "Notices and other communications must be in writing and delivered/transmitted as the contract requires.",
    steps: [],
  },
};

/* ------------------------------------------------------------------ */
/* Category -> clause chain                                            */
/* ------------------------------------------------------------------ */

export interface CategoryRoute {
  basisClauses: string[];
  procedureClause: string;
  entryStepId: string;
  obligation: string;
}

export const CATEGORY_ROUTES: Record<string, CategoryRoute | null> = {
  variation: {
    basisClauses: ["13.1", "13.3"],
    procedureClause: "20.1",
    entryStepId: "20.1-notice",
    obligation:
      "A variation may carry time/cost. Protect entitlement by serving a 20.1 notice within 28 days, then a detailed claim within 42 days.",
  },
  delay: {
    basisClauses: ["8.4"],
    procedureClause: "20.1",
    entryStepId: "20.1-notice",
    obligation:
      "A delay event engages EOT under 8.4, claimed via 20.1: notice within 28 days, detailed claim within 42 days.",
  },
  payment: {
    basisClauses: ["14.3", "14.6", "14.7"],
    procedureClause: "14.7",
    entryStepId: "14.3-statement",
    obligation:
      "Track the payment cycle: submit the Statement (14.3); the Engineer must certify within 28 days (14.6) and the Employer must pay within 56 days (14.7), BOTH running from the Engineer's receipt of the Statement. Late payment engages 14.8 and 16.1.",
  },
  instruction: {
    basisClauses: ["13.1", "1.3"],
    procedureClause: "20.1",
    entryStepId: "20.1-notice",
    obligation:
      "If the instruction amounts to a variation or has time/cost impact, serve a 20.1 notice within 28 days to preserve entitlement.",
  },
  site_issue: {
    basisClauses: ["2.1", "4.12"],
    procedureClause: "20.1",
    entryStepId: "20.1-notice",
    obligation:
      "A site issue (late access under 2.1, or unforeseeable conditions under 4.12) is claimed via 20.1: notice within 28 days.",
  },
  other: null,
};

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

export function getStep(stepId: string): ClauseStep | undefined {
  for (const clause of Object.values(CLAUSES)) {
    const found = clause.steps.find((s) => s.id === stepId);
    if (found) return found;
  }
  return undefined;
}

export function getClause(ref: string): Clause | undefined {
  return CLAUSES[ref];
}

/** Every step id reachable from a route's entry step, in order. */
export function chainFor(entryStepId: string): ClauseStep[] {
  const out: ClauseStep[] = [];
  const seen = new Set<string>();
  let step = getStep(entryStepId);
  while (step && !seen.has(step.id)) {
    seen.add(step.id);
    out.push(step);
    step = step.nextStepId ? getStep(step.nextStepId) : undefined;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Step completion — used by advanceEventStep + the "Mark done" UI.    */
/* ------------------------------------------------------------------ */

/**
 * The events column written when a step is marked done. Derived from
 * `satisfiedBy`, so it can never drift out of step with what the engine reads.
 *
 * NOTE the change: "20.1-response" now writes `engineer_response_date`, NOT
 * `engineer_receipt_date`. Writing the response into the receipt column
 * destroyed the anchor the 42-day clock runs from.
 */
export const STEP_DATE_FIELD: Record<string, string> = {
  "20.1-notice": "notice_date",
  "14.3-statement": "submission_date",
  "20.1-particulars": "submission_date",
  "20.1-response": "engineer_response_date",
  "3.5-determination": "determination_date",
  "14.6-ipc": "ipc_issued_date",
  "14.7-payment": "payment_received_date",
  "16.1-notice": "suspension_notice_date",
};

/**
 * Steps that transmit something to the Engineer, and the column recording
 * their receipt. Mark-done for these captures TWO dates: the date sent and
 * the date received. Receipt defaults to the submission date (same-day for
 * digital transmission) and is editable.
 *
 * `engineer_receipt_date` serves both chains without collision: an event is
 * either a payment or a claim, never both, so the column means "received the
 * Statement" or "received the particulars" according to the event's type.
 */
export const STEP_RECEIPT_FIELD: Record<string, string> = {
  "14.3-statement": "engineer_receipt_date",
  "20.1-particulars": "engineer_receipt_date",
};

/** Steps whose completion requires an amount as well as a date. */
export const STEP_AMOUNT_FIELD: Record<string, string> = {
  "14.6-ipc": "certified_amount",
  "14.7-payment": "amount_received",
};

export const STEP_DONE_LABEL: Record<string, string> = {
  "20.1-notice": "Mark notice served",
  "14.3-statement": "Mark Statement submitted",
  "20.1-particulars": "Mark claim submitted",
  "20.1-response": "Mark Engineer responded",
  "3.5-determination": "Mark determination received",
  "14.6-ipc": "Mark IPC issued",
  "14.7-payment": "Mark payment received",
  "16.1-notice": "Mark 16.1 notice given",
};
/**
 * lib/fidic/clauses.ts
 * ---------------------------------------------------------------------------
 * FIDIC Red Book 1999 clause registry + time-bar rules.
 *
 * This is the deterministic backbone of the proactive workflow AND the
 * machine-readable "structured clause data" the app loads. Deadlines here are
 * fixed by the contract (28 days for a 20.1 notice, etc.) and are computed by
 * `lib/fidic/engine.ts`. The AI layer only chooses WHICH clause applies and
 * writes the human-readable wording — it never invents a time bar.
 *
 * Day counts are taken from the General Conditions. Project-specific values
 * (Time for Completion, access date, payment minimums, etc.) live in the
 * loaded contract data, not here — see contracts/<project>/contract-data.ts.
 * ---------------------------------------------------------------------------
 */

export type Party = "contractor" | "engineer" | "employer";

export type ObligationKind =
  | "notice" // serve a notice (frequently the time-barred step)
  | "particulars" // submit a fully detailed / supporting claim
  | "submission" // submit a document (programme, statement, security)
  | "response" // the other party must respond / determine
  | "payment"; // money falls due

/** What the time-bar days are measured FROM. Resolved against an event's dates. */
export type DeadlineAnchor =
  | "awareness_date" // when the Contractor became (or should have become) aware
  | "notice_date" // when our notice was served
  | "submission_date" // when we submitted particulars / a statement
  | "engineer_receipt_date" // when the Engineer received the claim / statement
  | "suspension_notice_date" // when our 16.1 notice was given
  | "commencement_date"; // Commencement Date (from the contract data)

/** A single time-barred step inside a clause's procedure. */
export interface ClauseStep {
  id: string; // stable id, e.g. "20.1-notice"
  label: string; // short label, e.g. "Notify claim"
  party: Party; // who must act
  kind: ObligationKind;
  days: number; // the time bar, in calendar days
  from: DeadlineAnchor; // what the days run from
  timeBarred: boolean; // true => missing the deadline forfeits entitlement
  description: string; // plain-English instruction
  nextStepId?: string; // step that becomes active once this one is done
}

export interface Clause {
  ref: string; // "20.1"
  title: string; // "Contractor's Claims"
  kind: "entitlement" | "procedure" | "payment" | "administration";
  summary: string; // one line, plain English
  steps: ClauseStep[];
}

/* ------------------------------------------------------------------ */
/* Clause registry — only the sub-clauses ClaimGuard acts on.          */
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
        description:
          "Give notice to the Engineer describing the event or circumstance giving rise to the claim. Must be no later than 28 days after becoming aware — otherwise time/payment entitlement is lost and the Employer is discharged.",
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
        description:
          "The Engineer responds with approval or disapproval and detailed comments within 42 days of receiving the claim or further particulars (then proceeds under 3.5 to agree or determine).",
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
        from: "engineer_receipt_date",
        timeBarred: false,
        description:
          "Following the response, the Engineer proceeds under Sub-Clause 3.5 to agree or fairly determine the claim. Chase if unreasonably delayed. Mark done when the determination is received.",
      },
    ],
  },

  "8.4": {
    ref: "8.4",
    title: "Extension of Time for Completion",
    kind: "entitlement",
    summary:
      "Entitlement to extend the Time for Completion for qualifying delay events. Claimed through the 20.1 procedure.",
    steps: [], // entitlement basis; its procedure runs through 20.1
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

  "14.6": {
    ref: "14.6",
    title: "Issue of Interim Payment Certificates",
    kind: "payment",
    summary:
      "After a Statement is submitted, the Engineer must issue the Interim Payment Certificate within 28 days.",
    steps: [
      {
        id: "14.6-ipc",
        label: "Engineer issues IPC",
        party: "engineer",
        kind: "response",
        days: 28,
        from: "submission_date",
        timeBarred: false,
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
        description:
          "The Employer pays the amount certified in each Interim Payment Certificate within 56 days after the Engineer receives the Statement.",
      },
    ],
  },

  "14.8": {
    ref: "14.8",
    title: "Delayed Payment",
    kind: "payment",
    summary:
      "If payment is late, the Contractor is entitled to financing charges compounded monthly on the overdue amount.",
    steps: [
      {
        id: "14.8-financing",
        label: "Claim financing charges",
        party: "contractor",
        kind: "payment",
        days: 0,
        from: "engineer_receipt_date",
        timeBarred: false,
        description:
          "Payment is overdue. Claim financing charges compounded monthly on the overdue amount under Sub-Clause 14.8. Include the calculation; rate = [INSERT, e.g. EIBOR + 3%].",
      },
    ],
  },

  "16.1": {
    ref: "16.1",
    title: "Contractor's Entitlement to Suspend Work",
    kind: "administration",
    summary:
      "On non-certification (14.6) or non-payment (14.7), the Contractor may, after 21 days' notice, suspend or reduce the rate of work.",
    steps: [
      {
        id: "16.1-notice",
        label: "Give 21-day suspension notice",
        party: "contractor",
        kind: "notice",
        days: 0,
        from: "notice_date",
        timeBarred: false,
        description:
          "You may give the Employer not less than 21 days' notice of intention to suspend work (or reduce the rate) under Sub-Clause 16.1, citing the non-certification / non-payment. This is a remedy, not a deadline.",
        nextStepId: "16.1-suspend",
      },
      {
        id: "16.1-suspend",
        label: "Right to suspend matures",
        party: "contractor",
        kind: "notice",
        days: 21,
        from: "suspension_notice_date",
        timeBarred: false,
        description:
          "21 days after your 16.1 notice, you may suspend or reduce the rate of work until payment/certification is remedied.",
      },
    ],
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
/* Category -> applicable clause chain.                                */
/*                                                                     */
/* The event category (variation/delay/payment/instruction/site_issue/ */
/* other) drives which clause procedure the engine runs. The AI may    */
/* refine `clauseRef` to a more specific sub-clause (e.g. 4.12 vs 2.1   */
/* for a site_issue) but the chain it triggers is one of these.        */
/* ------------------------------------------------------------------ */

export interface CategoryRoute {
  /** Entitlement / basis clauses to cite in the action and in any claim. */
  basisClauses: string[];
  /** The procedural clause whose steps the engine schedules. */
  procedureClause: string;
  /** Default first step id to schedule. */
  entryStepId: string;
  /** Plain-English description of the obligation this category creates. */
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
    basisClauses: ["14.6", "14.7"],
    procedureClause: "14.7",
    entryStepId: "14.6-ipc",
    obligation:
      "Track the payment cycle: Engineer must certify within 28 days (14.6) and the Employer must pay within 56 days (14.7); late payment engages 14.8.",
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
  other: null, // no automatic obligation; manual handling
};

/** Convenience: look up a step anywhere in the registry by id. */
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

/* ------------------------------------------------------------------ */
/* Step completion — used by advanceEventStep + the "Mark done" UI.    */
/* ------------------------------------------------------------------ */

/** When a step is marked complete, which events column records the date. */
export const STEP_DATE_FIELD: Record<string, string> = {
  "20.1-notice": "notice_date",
  "20.1-particulars": "submission_date",
  "20.1-response": "engineer_receipt_date", // "Engineer responded on"
  "14.6-ipc": "ipc_issued_date", // "IPC issued on"
  "16.1-notice": "suspension_notice_date",
};

/** Completing one of these closes the event (no further action). */
export const CLOSING_STEPS = new Set<string>([
  "3.5-determination", // determination received
  "14.7-payment", // paid
  "14.8-financing", // financing charges claimed
]);

/** Short verb for the "Mark done" button, per step. */
export const STEP_DONE_LABEL: Record<string, string> = {
  "20.1-notice": "Mark notice served",
  "20.1-particulars": "Mark claim submitted",
  "20.1-response": "Mark Engineer responded",
  "3.5-determination": "Mark determination received",
  "14.6-ipc": "Mark IPC issued",
  "14.7-payment": "Mark payment received",
  "14.8-financing": "Mark financing charges claimed",
  "16.1-notice": "Mark 16.1 notice given",
};
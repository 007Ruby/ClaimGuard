// lib/contract/fidic-defaults.ts
//
// FIDIC Red Book 1999 General-Conditions PARAMETER set. This is the universal fallback:
// resolveParameter() merges any stored override over these, field by field. FIDIC mode ships
// a profile whose `parameters` map is empty (pure defaults) until Particular Conditions amend
// it; a custom contract stores its extracted values as overrides against this same base.
//
// NOTE — these are numeric periods and structural facts (28 days, condition precedent,
// anchored on statement receipt), NOT FIDIC clause prose. The GC clause TEXT (the clauseMap
// layer) is populated from ClaimGuard's licensed FIDIC asset at seed time, never hardcoded
// here — both to respect FIDIC's copyright in the General Conditions and to keep this file
// the single home of the *numbers* the engine reads.

import type { ConceptKey, ConceptParameters } from './types';

export const FIDIC_DEFAULTS: Record<ConceptKey, ConceptParameters> = {
  // ── Group A — the time bar ────────────────────────────────────────────────
  claim_notice: {
    owner: 'contractor',
    anchor: 'contractor_awareness',
    durationDays: 28,
    consequence: 'condition_precedent',
  },
  claim_particulars: {
    owner: 'contractor',
    anchor: 'contractor_awareness', // parallel to the notice, NOT chained off it
    durationDays: 42,
    consequence: 'soft_support',
  },

  // ── Group B — the payment chain (all clocks run from statement_received) ───
  payment_statement: {
    owner: 'contractor',
    anchor: null,       // trigger: stamps statement_received for everything downstream
    durationDays: null,
    consequence: null,  // the anchor-setter, not a deadline in itself
  },
  ipc_issue: {
    owner: 'engineer',
    anchor: 'statement_received',
    durationDays: 28,
    consequence: 'counterparty_default',
  },
  payment_due: {
    owner: 'employer',
    anchor: 'statement_received', // ← 56 days from STATEMENT RECEIPT, never from IPC issue
    durationDays: 56,
    consequence: 'counterparty_default',
  },
  financing_charges: {
    owner: 'employer',    // the Employer's liability; accrues to the contractor's benefit
    anchor: 'payment_due_date',
    durationDays: null,   // accrues continuously from the due date, not a fixed window
    consequence: 'accrues_charges',
    // GC 14.8: three percentage points above the central-bank discount rate of the country
    // of the payment currency, compounded monthly. PERCENTAGE POINTS, not basis points.
    financingRate: { basis: 'central_bank_plus', marginPoints: 3, compounding: 'monthly' },
  },
  suspension_notice: {
    owner: 'contractor',
    anchor: 'suspension_notice_served', // the 21-day countdown runs from the served notice
    durationDays: 21,
    consequence: 'enables_right',
  },

  // ── Group C — the Engineer's response obligations ──────────────────────────
  claim_response: {
    owner: 'engineer',
    anchor: 'claim_received',
    durationDays: 42,     // nominal
    consequence: 'counterparty_default',
  },
  determination: {
    owner: 'engineer',
    anchor: 'consultation_complete',
    durationDays: null,   // nominal in GC — no hard FIDIC deadline
    consequence: 'counterparty_default',
    // UAE PCs often set a duration here and add a contractor-side challengeWindow that
    // flips this into a time bar. That is stored per contract, never baked in here.
  },

  // ── Group D — the RFI basis ────────────────────────────────────────────────
  delayed_instruction: {
    owner: 'engineer',
    anchor: 'instruction_required',
    durationDays: null,   // often "reasonable time" — drives escalation, not a hard clock
    consequence: 'counterparty_default',
  },
};
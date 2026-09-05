// lib/contract/concepts.ts
//
// The concept REGISTRY: canonical definitions of each deterministic concept, independent of
// any one contract's values. This is where the canonical display name (naming layer 2) lives,
// and it's the source for the Workflows-tab labels and the bot's system-context descriptions.
// Numbers/periods do NOT live here — those are per-contract and live in the profile (defaults
// in fidic-defaults.ts). This file answers "what concepts exist and what are they called",
// never "what are their values on this project".

import type { ConceptKey } from './types';

export type ConceptGroup =
  | 'time_bar'          // A — the claim time bar (highest legal stakes)
  | 'payment_chain'     // B — statement → IPC → payment → charges → suspension (highest money weight)
  | 'engineer_response' // C — the Engineer's response obligations
  | 'information';      // D — delayed drawings/instructions (the RFI basis)

export interface ConceptDefinition {
  key: ConceptKey;
  /** Canonical display name — ClaimGuard's label, FIDIC-flavoured so contractors recognise it,
   *  STABLE across every project. It is NOT a FIDIC clause number (labelling a custom contract's
   *  notice slot "SC 20.1" would be a lie about their contract). */
  displayName: string;
  group: ConceptGroup;
  /** The FIDIC clause this concept corresponds to — reference/provenance for the FIDIC seed only. */
  fidicRef: string;
  /** One-line description for the Workflows tab and the bot's always-resident system context. */
  summary: string;
  /** Live in MVP? (Deferred concepts are listed separately in DEFERRED_CONCEPTS, out of ConceptKey.) */
  mvp: boolean;
}

export const CONCEPTS: Record<ConceptKey, ConceptDefinition> = {
  // ── Group A — the time bar ────────────────────────────────────────────────
  claim_notice: {
    key: 'claim_notice',
    displayName: 'Notice of Claim',
    group: 'time_bar',
    fidicRef: '20.1',
    summary:
      'Notice that a claimable event has occurred. Condition precedent — miss it and the ' +
      'entitlement to time and money is lost. The single most important deadline in the system.',
    mvp: true,
  },
  claim_particulars: {
    key: 'claim_particulars',
    displayName: 'Fully Detailed Claim & Particulars',
    group: 'time_bar',
    fidicRef: '20.1',
    summary:
      'The detailed claim with supporting particulars. Runs in PARALLEL from the same awareness ' +
      'date as the notice (not chained off the served notice). Late particulars weaken but do not bar.',
    mvp: true,
  },

  // ── Group B — the payment chain (all anchored on Statement receipt) ────────
  payment_statement: {
    key: 'payment_statement',
    displayName: 'Monthly Statement',
    group: 'payment_chain',
    fidicRef: '14.3',
    summary:
      'The contractor\u2019s monthly Statement to the Engineer. A trigger event, not a deadline: ' +
      'its received date is the anchor the whole payment chain runs from.',
    mvp: true,
  },
  ipc_issue: {
    key: 'ipc_issue',
    displayName: 'Interim Payment Certificate',
    group: 'payment_chain',
    fidicRef: '14.6',
    summary:
      'The Engineer issues the IPC within 28 days of receiving the Statement. If late, the ' +
      'Engineer is in default — feeds follow-ups and contributes to the suspension ground.',
    mvp: true,
  },
  payment_due: {
    key: 'payment_due',
    displayName: 'Payment Due',
    group: 'payment_chain',
    fidicRef: '14.7',
    summary:
      'The Employer pays within 56 days of the Engineer RECEIVING THE STATEMENT (not from IPC ' +
      'issue). Expiry starts financing charges and unlocks the suspension clock.',
    mvp: true,
  },
  financing_charges: {
    key: 'financing_charges',
    displayName: 'Financing Charges',
    group: 'payment_chain',
    fidicRef: '14.8',
    summary:
      'Charges accrue on amounts unpaid past the payment-due date, to the contractor\u2019s ' +
      'benefit. Computed deterministically from a confirmed rate (margin over a base rate).',
    mvp: true,
  },
  suspension_notice: {
    key: 'suspension_notice',
    displayName: 'Notice of Intention to Suspend',
    group: 'payment_chain',
    fidicRef: '16.1',
    summary:
      'A RIGHT, not an obligation. After \u2265 21 days\u2019 notice on the non-payment / ' +
      'non-certification ground, the contractor may suspend or reduce the rate of work.',
    mvp: true,
  },

  // ── Group C — the Engineer's response obligations ──────────────────────────
  claim_response: {
    key: 'claim_response',
    displayName: 'Engineer\u2019s Response to Claim',
    group: 'engineer_response',
    fidicRef: '20.1',
    summary:
      'The Engineer responds on the PRINCIPLE of the claim (is there entitlement), nominally ' +
      'within 42 days. Distinct from determination, which deals with quantum. Chased via follow-ups.',
    mvp: true,
  },
  determination: {
    key: 'determination',
    displayName: 'Engineer\u2019s Determination',
    group: 'engineer_response',
    fidicRef: '3.5',
    summary:
      'After consultation, the Engineer determines the matter fairly. No hard FIDIC deadline ' +
      '(nominal). NOTE: UAE Particular Conditions frequently add a hard, final-and-binding-if-' +
      'unchallenged window here, which flips this Engineer-side nominal step into a contractor-' +
      'side time bar. Model that flip via an override consequence / the deferred ' +
      'determination_challenge concept — do not assume the nominal default holds on custom contracts.',
    mvp: true,
  },

  // ── Group D — the RFI basis ────────────────────────────────────────────────
  delayed_instruction: {
    key: 'delayed_instruction',
    displayName: 'Delayed Drawings or Instructions',
    group: 'information',
    fidicRef: '1.9',
    summary:
      'Where a needed drawing or instruction is absent and the works would be delayed, the ' +
      'contractor gives notice. Often keyed to "reasonable time" rather than a fixed count, so it ' +
      'drives a notice-and-escalation route rather than a hard clock. Underpins RFIs.',
    mvp: true,
  },
};

/**
 * Concepts we have deliberately designed the schema to ACCEPT but are not building for MVP.
 * Kept here (as plain strings, outside ConceptKey) so nothing depends on them yet, while the
 * shape doesn't paint us into a corner that excludes them.
 */
export const DEFERRED_CONCEPTS = [
  'variation',                 // SC 13 — its own instruct → value → agree sub-chain
  'eot',                       // SC 8.4 — the substantive EOT right claim_notice protects
  'determination_challenge',   // the contractor-side challenge window some UAE PCs add to 3.5
] as const;

/** Convenience: concepts grouped for the Workflows tab, in legal-weight order. */
export const CONCEPTS_BY_GROUP: Record<ConceptGroup, ConceptKey[]> = {
  time_bar: ['claim_notice', 'claim_particulars'],
  payment_chain: ['payment_statement', 'ipc_issue', 'payment_due', 'financing_charges', 'suspension_notice'],
  engineer_response: ['claim_response', 'determination'],
  information: ['delayed_instruction'],
};
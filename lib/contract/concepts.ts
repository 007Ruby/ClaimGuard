// lib/contract/concepts.ts
//
// The concept registry: static, contract-independent facts about each concept key. Nothing
// here is per-contract — per-contract values live in the profile. This file answers:
//   • what do we call this concept in the UI (before any contract-specific alias)?
//   • what SHAPE is it (deadline / trigger / right / accrual)?
//   • which anchors is an editor allowed to offer for it?
//   • which step in the frozen engine, if any, does it project onto?
//
// ⚠ engineStepId MUST match the step ids in lib/fidic/clauses.ts. A wrong string fails
// SILENTLY — projectDayOverrides() simply emits nothing for that concept and the engine
// quietly keeps its hardcoded default. Run assertEngineStepIds() in a test against the real
// EDITABLE_PERIODS keys before trusting this file.

import type { Anchor, ConceptKey, ConceptKind, ConsequenceType } from './types';

export interface ConceptDescriptor {
  /** Default UI label. A contract may alias this via clauseMap[key].canonicalName. */
  canonicalName: string;
  kind: ConceptKind;
  /** Step id in lib/fidic/clauses.ts, or null where the engine has no step. */
  engineStepId: string | null;
  /** The only anchors an editor may offer for this concept. */
  validAnchors: readonly Anchor[];
}

export const CONCEPTS: Record<ConceptKey, ConceptDescriptor> = {
  claim_notice: {
    canonicalName: 'Notice of Claim',
    kind: 'deadline',
    engineStepId: 'notice',
    validAnchors: ['contractor_awareness'],
  },
  claim_particulars: {
    canonicalName: 'Fully Detailed Claim',
    kind: 'deadline',
    engineStepId: 'particulars',
    validAnchors: ['contractor_awareness'],
  },
  payment_statement: {
    canonicalName: 'Monthly Statement',
    kind: 'trigger',
    engineStepId: null,
    validAnchors: [],
  },
  ipc_issue: {
    canonicalName: 'Interim Payment Certificate',
    kind: 'deadline',
    engineStepId: 'ipc',
    validAnchors: ['statement_received'],
  },
  payment_due: {
    canonicalName: 'Payment',
    kind: 'deadline',
    engineStepId: 'payment',
    validAnchors: ['statement_received'],
  },
  financing_charges: {
    canonicalName: 'Financing Charges',
    kind: 'accrual',
    engineStepId: null,
    validAnchors: ['payment_due_date'],
  },
  suspension_notice: {
    canonicalName: 'Notice of Intention to Suspend',
    kind: 'right',
    engineStepId: 'suspension_notice',
    validAnchors: ['suspension_notice_served'],
  },
  claim_response: {
    canonicalName: "Engineer's Response to Claim",
    kind: 'deadline',
    engineStepId: 'engineer_response',
    validAnchors: ['claim_received'],
  },
  determination: {
    canonicalName: 'Determination',
    kind: 'deadline',
    engineStepId: null,
    validAnchors: ['consultation_complete'],
  },
  delayed_instruction: {
    canonicalName: 'Delayed Drawing or Instruction',
    kind: 'deadline',
    engineStepId: null,
    validAnchors: ['instruction_required'],
  },
};

/**
 * CONSEQUENCE_BEHAVIOUR — what each consequence value MEANS to the engine and the UI. This
 * is the documentation of why `consequence` is a typed enum and not display copy.
 *
 * `enginePenalty` is the behaviour the engine applies when the period elapses unsatisfied.
 * `routesTo` is the workflow the surfaced prompt belongs to.
 */
export const CONSEQUENCE_BEHAVIOUR: Record<
  ConsequenceType,
  { enginePenalty: 'entitlement_lost' | 'weakened' | 'other_party_in_default' | 'charges_accrue' | 'right_unlocked'; routesTo: 'claims' | 'follow_ups' | 'payment' }
> = {
  condition_precedent: { enginePenalty: 'entitlement_lost', routesTo: 'claims' },
  soft_support: { enginePenalty: 'weakened', routesTo: 'claims' },
  counterparty_default: { enginePenalty: 'other_party_in_default', routesTo: 'follow_ups' },
  accrues_charges: { enginePenalty: 'charges_accrue', routesTo: 'payment' },
  enables_right: { enginePenalty: 'right_unlocked', routesTo: 'payment' },
};

/**
 * assertEngineStepIds — call this from a test with the real step ids read out of
 * lib/fidic/clauses.ts (e.g. Object.keys(EDITABLE_PERIODS)). Turns a silent no-op into a
 * loud failure. Returns the ids in this file that the engine does not know about.
 */
export function assertEngineStepIds(knownEngineStepIds: readonly string[]): string[] {
  const known = new Set(knownEngineStepIds);
  return (Object.keys(CONCEPTS) as ConceptKey[])
    .map((k) => CONCEPTS[k].engineStepId)
    .filter((id): id is string => id !== null && !known.has(id));
}
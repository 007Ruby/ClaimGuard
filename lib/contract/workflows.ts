// lib/contract/workflows.ts
//
// The view model for the Workflows page. This is a VIEW OVER ContractProfile, not a second
// system — it adds no state, stores nothing, and every value it shows comes back through
// resolveParameter(). If the page and the engine ever disagree, that is a bug in this file,
// not a difference of opinion between two sources of truth.
//
// What it adds is ORDER and GROUPING: the profile is a flat map of ten concepts, but a
// contractor thinks in chains — statement leads to certificate leads to payment leads to
// financing charges leads to suspension. The chain structure lives here because it is a
// presentation fact, not a contractual parameter.

import type {
  ConceptKey,
  ConceptParameters,
  StoredContractProfile,
} from './types';
import { CONCEPTS } from './concepts';
import { checkDivergence, resolveParameter } from './resolve';

export interface WorkflowNode {
  key: ConceptKey;
  name: string;
  /** The contract's own clause number, when mapped. */
  sourceClauseRef: string | null;
  present: boolean;
  parameters: ConceptParameters;
  /** True when a human has vouched for these values. Mirrors isParameterConfirmed. */
  confirmed: boolean;
  /** Live fields differing from what extraction read. Surfaced, never auto-reconciled. */
  diverged: (keyof ConceptParameters)[];
  /** Prose for the node's caption, e.g. "28 days from contractor awareness". */
  caption: string;
}

export interface WorkflowGroup {
  id: 'claims' | 'payment' | 'instructions';
  title: string;
  description: string;
  /** In chain order. The diagram renders these left to right. */
  nodes: WorkflowNode[];
}

/** Chain order per group. The only place concept ordering is asserted. */
const GROUP_DEFS: { id: WorkflowGroup['id']; title: string; description: string; keys: ConceptKey[] }[] = [
  {
    id: 'claims',
    title: 'Claims',
    description:
      'From becoming aware of an event through to the Engineer\'s determination. The notice ' +
      'period is the only step here that can extinguish an entitlement outright.',
    keys: ['claim_notice', 'claim_particulars', 'claim_response', 'determination'],
  },
  {
    id: 'payment',
    title: 'Payment chain',
    description:
      'The monthly cycle. Every clock in this chain runs from the Engineer\'s receipt of the ' +
      'Statement — not from the date the certificate is issued.',
    keys: ['payment_statement', 'ipc_issue', 'payment_due', 'financing_charges', 'suspension_notice'],
  },
  {
    id: 'instructions',
    title: 'Instructions & information',
    description:
      'Where a drawing or instruction the works depend on has not arrived. Drives RFIs and, ' +
      'where the delay bites, a claim.',
    keys: ['delayed_instruction'],
  },
];

const ANCHOR_PROSE: Record<string, string> = {
  contractor_awareness: 'from becoming aware of the event',
  statement_received: 'from the Engineer receiving the Statement',
  payment_due_date: 'from the payment due date',
  claim_received: 'from the Engineer receiving the claim',
  consultation_complete: 'from the end of consultation',
  suspension_notice_served: 'from serving the notice',
  instruction_required: 'from when the instruction was needed',
};

function captionFor(p: ConceptParameters): string {
  if (p.durationDays === null) {
    return p.anchor ? `No fixed period — ${ANCHOR_PROSE[p.anchor] ?? p.anchor}` : 'Trigger event';
  }
  const anchor = p.anchor ? ANCHOR_PROSE[p.anchor] ?? p.anchor : '';
  return `${p.durationDays} days ${anchor}`.trim();
}

/** A parameter is vouched for: FIDIC GC defaults are, extractions are only once proofread. */
export function isConfirmed(profile: StoredContractProfile, key: ConceptKey): boolean {
  const hasOverride = profile.parameters[key] !== undefined;
  if (profile.meta.profileType === 'fidic' && !hasOverride) return true;
  return profile.clauseMap[key]?.confirmed === true;
}

export function buildWorkflowGroups(profile: StoredContractProfile): WorkflowGroup[] {
  const absent = new Set(profile.absentConcepts);

  return GROUP_DEFS.map((def) => ({
    id: def.id,
    title: def.title,
    description: def.description,
    nodes: def.keys.map((key) => {
      const parameters = resolveParameter(profile, key);
      const entry = profile.clauseMap[key];
      return {
        key,
        name: entry?.canonicalName ?? CONCEPTS[key].canonicalName,
        sourceClauseRef: entry?.sourceClauseRef ?? null,
        present: !absent.has(key),
        parameters,
        confirmed: isConfirmed(profile, key),
        diverged: checkDivergence(profile, key),
        caption: captionFor(parameters),
      };
    }),
  }));
}

/** Count of things needing the user's attention, for the settings-nav badge. */
export function countNeedsAttention(profile: StoredContractProfile): number {
  const groups = buildWorkflowGroups(profile);
  return groups
    .flatMap((g) => g.nodes)
    .filter((n) => n.present && (!n.confirmed || n.diverged.length > 0)).length;
}
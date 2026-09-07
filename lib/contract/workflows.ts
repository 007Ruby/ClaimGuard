// lib/contract/workflows.ts
//
// The view model for the Workflows page. A VIEW OVER ContractProfile, not a second system — it
// stores nothing and every value comes back through resolveParameter(). If the page and the
// engine disagree, that is a bug here, not two sources of truth.
//
// What it adds is ORDER and GROUPING: the profile is a flat map of ten concepts, but a
// contractor thinks in chains. Chain structure is a presentation fact, so it lives here.

import type {
  ClauseTextEntry,
  ConceptKey,
  ConceptParameters,
  ParameterLayer,
  ResolvedParameters,
  StoredContractProfile,
} from './types';
import { CONCEPTS } from './concepts';
import { checkDivergence, generalLayer, resolveParameter } from './resolve';

export interface WorkflowNode {
  key: ConceptKey;
  name: string;
  sourceClauseRef: string | null;
  present: boolean;
  parameters: ResolvedParameters;
  /** The General Conditions value this contract departs from, when it departs from one. Null
   *  for a bespoke contract, or where the GC value still governs. Drives the
   *  "GC: 28 days → your contract: 21 days" line in the editor. */
  generalDurationDays: number | null;
  /** True when the contract or a manual edit changed the period away from the GC value. */
  amendsGeneral: boolean;
  confirmed: boolean;
  diverged: (keyof ConceptParameters)[];
  clause: ClauseTextEntry | null;
  caption: string;
}

export interface WorkflowGroup {
  id: 'claims' | 'payment';
  title: string;
  description: string;
  /** In chain order. */
  nodes: WorkflowNode[];
}

// Two groups, not three. `delayed_instruction` used to sit alone in an "Instructions" group,
// which rendered as a one-node chain — a chain with nothing to chain. It belongs with claims:
// a missing instruction is the ground a delay claim stands on, not a workflow of its own.
const GROUP_DEFS: { id: WorkflowGroup['id']; title: string; description: string; keys: ConceptKey[] }[] = [
  {
    id: 'claims',
    title: 'Claims',
    description:
      'From becoming aware of an event through to the Engineer\'s determination. The notice ' +
      'period is the only step that can extinguish an entitlement outright.',
    keys: ['delayed_instruction', 'claim_notice', 'claim_particulars', 'claim_response', 'determination'],
  },
  {
    id: 'payment',
    title: 'Payment',
    description:
      'The monthly cycle. Every clock runs from the Engineer\'s receipt of the Statement — ' +
      'not from the date the certificate is issued.',
    keys: ['payment_statement', 'ipc_issue', 'payment_due', 'financing_charges', 'suspension_notice'],
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

function captionFor(p: ResolvedParameters): string {
  if (!p.resolved) return 'Not found in your contract';
  if (p.durationDays === null) {
    return p.anchor ? `No fixed period — ${ANCHOR_PROSE[p.anchor] ?? p.anchor}` : 'Trigger event';
  }
  return `${p.durationDays} days ${p.anchor ? ANCHOR_PROSE[p.anchor] ?? p.anchor : ''}`.trim();
}

/** Human label for a provenance layer, for the "where did this come from" line. */
export function layerLabel(layer: ParameterLayer, baseLabel: string): string {
  switch (layer) {
    case 'manual':
      return 'You set this';
    case 'contract':
      return 'From your contract';
    case 'general':
      return baseLabel;
    case 'unresolved':
      return 'Not found';
  }
}

/** A parameter is vouched for: GC values are by construction, extractions only once proofread. */
export function isConfirmed(profile: StoredContractProfile, key: ConceptKey): boolean {
  // A manual edit is the user's own value — nothing to proofread.
  if (profile.parameters.manual[key] !== undefined) return true;
  // Nothing extracted for this concept: on a FIDIC profile the GC value stands unamended and
  // needs no confirmation; on a bespoke one it is unresolved, which is not the same as confirmed.
  if (profile.parameters.contract[key] === undefined) {
    return profile.meta.profileType === 'fidic';
  }
  return profile.clauseMap[key]?.confirmed === true;
}

export function buildWorkflowGroups(profile: StoredContractProfile): WorkflowGroup[] {
  const absent = new Set(profile.absentConcepts);

  return GROUP_DEFS.map((def) => ({
    id: def.id,
    title: def.title,
    description: def.description,
    nodes: def.keys.map((key): WorkflowNode => {
      const parameters = resolveParameter(profile, key);
      const entry = profile.clauseMap[key] ?? null;
      const general = generalLayer(profile.meta.profileType, key);
      const generalDays = general?.durationDays ?? null;

      return {
        key,
        name: entry?.canonicalName ?? CONCEPTS[key].canonicalName,
        sourceClauseRef: entry?.sourceClauseRef ?? null,
        present: !absent.has(key),
        parameters,
        generalDurationDays: generalDays,
        amendsGeneral:
          general !== null &&
          parameters.provenance.durationDays !== 'general' &&
          parameters.durationDays !== generalDays,
        confirmed: isConfirmed(profile, key),
        diverged: checkDivergence(profile, key),
        clause: entry,
        caption: captionFor(parameters),
      };
    }),
  }));
}

/** Count of things needing the user's attention, for the settings-nav badge. Unresolved
 *  concepts count: on a bespoke contract they are the whole onboarding task. */
export function countNeedsAttention(profile: StoredContractProfile): number {
  return buildWorkflowGroups(profile)
    .flatMap((g) => g.nodes)
    .filter((n) => n.present && (!n.parameters.resolved || !n.confirmed || n.diverged.length > 0))
    .length;
}
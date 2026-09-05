/**
 * lib/contract/types.ts
 *
 * Core types for the ContractProfile — the single per-project object that both the
 * deterministic engine and the bot read from.
 *
 * TWO LAYERS, held FLAT and joined by concept key:
 *   parameters : machine-read numbers + typed consequences. The engine consumes ONLY this.
 *   clauseMap  : verbatim prose + the contract's own naming. The bot retrieves and CITES
 *                from this. The engine never reads it.
 *
 * The layers are flat (two top-level maps) rather than nested per concept for one reason:
 * it makes the engine invariant STRUCTURAL. `EngineProfileView` below is
 * `Pick<StoredContractProfile, 'parameters'>` — the engine is handed an object that does
 * not contain clause prose, so it cannot read prose even by mistake. Nesting
 * `{ parameters, clause }` under each concept would put the prose one property access away
 * and demote the invariant to a code-review convention.
 *
 * STORED vs RESOLVED:
 *   StoredContractProfile   — what persists in project_contracts.data.contractProfile.
 *                             SPARSE: only diffs from the FIDIC defaults (the dayOverrides
 *                             philosophy, generalised).
 *   ResolvedContractProfile — the materialised view for the Workflows tab and the bot.
 *                             Every concept present and fully populated, and NESTED per
 *                             concept because that is what those consumers actually want.
 *
 * FIDIC is not baked in here. It is one *seed* of this shape (fidic-defaults.ts). A custom
 * contract produces the same shape via extraction.
 *
 * String-literal unions (via `as const`) instead of TS `enum`, so values exist at runtime
 * for iteration and validation, and tree-shake cleanly.
 */

// ---------------------------------------------------------------------------
// Concept keys — the stable internal address space (the "DNS zone").
// These never display and never change. Extraction maps each contract's clauses ONTO these
// keys; the engine resolves by key, never by clause number, so a custom contract's own
// numbering is irrelevant to computation.
// ---------------------------------------------------------------------------
export const CONCEPT_KEYS = [
  'claim_notice',
  'claim_particulars',
  'payment_statement',
  'ipc_issue',
  'payment_due',
  'financing_charges',
  'suspension_notice',
  'claim_response',
  'determination',
  'delayed_instruction',
] as const;

export type ConceptKey = (typeof CONCEPT_KEYS)[number];

// ---------------------------------------------------------------------------
// Owner — whose obligation / right this is. Drives workflow routing:
//   contractor deadline  -> claim / payment prompts
//   counterparty default -> follow-ups
// ---------------------------------------------------------------------------
export const OWNERS = ['contractor', 'engineer', 'employer'] as const;
export type Owner = (typeof OWNERS)[number];

// ---------------------------------------------------------------------------
// Consequence — the load-bearing enum. Governs ENGINE BEHAVIOUR, not just display.
// See CONSEQUENCE_BEHAVIOUR in concepts.ts for what each one does.
// `null` means "no expiry consequence" — used only by triggers (the Statement submission
// starts a clock but has no deadline of its own).
// ---------------------------------------------------------------------------
export const CONSEQUENCE_TYPES = [
  'condition_precedent',  // expiry => entitlement LOST (time bar)
  'soft_support',         // lateness weakens the claim but does not bar it
  'counterparty_default', // expiry => other party in default -> follow-up
  'accrues_charges',      // period elapsed => charges accrue (contractor benefit)
  'enables_right',        // period elapsed => an action / right unlocks
] as const;
export type ConsequenceType = (typeof CONSEQUENCE_TYPES)[number];

// ---------------------------------------------------------------------------
// Anchor — the real-world event a clock starts from. As important as duration.
// Most anchors are user-confirmed dates; payment_due_date is DERIVED from another
// concept's computed output. Editors constrain the anchor to a concept's `validAnchors`
// (concepts.ts) — never free text.
//
// RENAME NOTE: these literals are the canonical set. If concepts.ts / any extraction
// prompt still uses `after_consultation`, `contractor_elects` or `instruction_needed_by`,
// update them to `consultation_complete`, `suspension_notice_served`,
// `instruction_required` respectively. Grep for all seven before shipping.
// ---------------------------------------------------------------------------
export const ANCHORS = [
  'contractor_awareness',     // user-confirmed: when the contractor became aware of the event
  'statement_received',       // user-confirmed: Engineer's receipt of the Statement (payment anchor)
  'payment_due_date',         // DERIVED: the computed payment-due date (feeds financing charges)
  'claim_received',           // user-confirmed: Engineer's receipt of the claim / particulars
  'consultation_complete',    // user-confirmed: consultation concluded (determination)
  'suspension_notice_served', // user-confirmed: contractor served the suspension notice
  'instruction_required',     // user-confirmed: when the drawing / instruction was needed
] as const;
export type Anchor = (typeof ANCHORS)[number];

// ---------------------------------------------------------------------------
// Kind — the shape of a concept, so engine + UI know how to treat it.
//   deadline : a lapsing clock (most concepts)
//   trigger  : a real-world event that anchors other clocks (no deadline of its own)
//   right    : a waiting period that UNLOCKS an action (suspension)
//   accrual  : charges that begin accruing after a date (financing)
// ---------------------------------------------------------------------------
export const CONCEPT_KINDS = ['deadline', 'trigger', 'right', 'accrual'] as const;
export type ConceptKind = (typeof CONCEPT_KINDS)[number];

// ---------------------------------------------------------------------------
// Financing rate (financing_charges only). The GC default is a FORMULA, not a number, and
// Particular Conditions commonly amend it — so it is data, resolved deterministically. The
// engine does arithmetic on a confirmed figure; it never invents a rate.
// ---------------------------------------------------------------------------
export interface FinancingRate {
  basis: 'central_bank_plus' | 'fixed_annual';
  /** GC 14.8: 3 percentage points above the central-bank discount rate of the country of
   *  the payment currency. Percentage POINTS, not basis points. */
  marginPoints?: number;
  /** If a PC fixes a flat annual rate instead, e.g. 0.09 for 9% p.a. */
  fixedAnnualRate?: number;
  compounding: 'monthly' | 'annual' | 'simple';
}

// ---------------------------------------------------------------------------
// Challenge window (determination only, when a PC amends it). The UAE "flip": an
// Engineer-side nominal window becomes a CONTRACTOR-side time bar — miss the challenge and
// the determination is final and binding. Absent from the FIDIC defaults (GC has no such
// flip). This is the field that lets an amended SC 3.5 be modelled as data.
//
// NOT YET CONSUMED BY THE ENGINE — see the header of profile-adapter.ts.
// ---------------------------------------------------------------------------
export interface ChallengeWindow {
  days: number;
  owner: Owner;                 // typically 'contractor'
  consequence: ConsequenceType; // typically 'condition_precedent'
}

// ---------------------------------------------------------------------------
// PARAMETERS LAYER — the ONLY thing the engine reads.
//
// ConceptParameters is COMPLETE: it is the shape of a FIDIC default and of a resolved
// value. ConceptParametersOverride is the SPARSE stored shape.
//
// `undefined` vs `null` matters and the resolver distinguishes them:
//   undefined -> inherit the FIDIC default
//   null      -> explicitly nominal / not applicable (a real override)
// ---------------------------------------------------------------------------
export interface ConceptParameters {
  owner: Owner;
  anchor: Anchor | null;               // null for triggers
  durationDays: number | null;         // null = nominal / "reasonable time" (no hard clock)
  consequence: ConsequenceType | null; // null = no expiry consequence (triggers)

  // Sparse, concept-specific extensions:
  financingRate?: FinancingRate;       // financing_charges
  challengeWindow?: ChallengeWindow;   // determination (PC amendment)
}

export type ConceptParametersOverride = Partial<ConceptParameters>;

// ---------------------------------------------------------------------------
// CLAUSE-TEXT LAYER — the three naming layers + provenance + retrievable prose.
//
//   canonicalName      : ClaimGuard's stable label ("Notice of Claim"). FIDIC-flavoured but
//                        NOT a FIDIC clause number. Stored (not just derived from
//                        concepts.ts) so a project can ALIAS it to its own terminology.
//   contractLabel      : the contract's OWN heading, verbatim.
//   sourceClauseRef    : the contract's OWN clause number, for citation.
//   text               : verbatim clause prose — the retrievable material (Tier 2 exact,
//                        Tier 3 corpus). Populated for FIDIC seeds from ClaimGuard's
//                        licensed FIDIC asset at seed time, never hardcoded in this repo.
//   extractedParameters: what extraction READ from this clause, frozen at extraction time.
//                        Never updated when a human edits the live parameter — that is the
//                        whole point: it is the baseline checkDivergence() compares against.
//   confirmed          : true once a human has proofread this entry.
// ---------------------------------------------------------------------------
export interface ClauseTextEntry {
  canonicalName: string;
  contractLabel: string | null;
  sourceClauseRef: string | null;
  text: string | null;
  extractedParameters?: ConceptParametersOverride;
  confirmed: boolean;
}

// ---------------------------------------------------------------------------
// A clause that matched NO concept — kept verbatim for the record + Tier 3 retrieval.
// Carries no parameters, drives no deadline, is invisible to the engine.
// ---------------------------------------------------------------------------
export interface UnmappedClause {
  contractLabel: string | null;
  sourceClauseRef: string | null;
  text: string;
}

export type ProfileType = 'fidic' | 'custom';

export interface ProfileMeta {
  profileType: ProfileType;
  /** e.g. "FIDIC Red Book 1999" or "Aldar bespoke form". Display + provenance. */
  baseLabel: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

// ---------------------------------------------------------------------------
// THE STORED PROFILE — what persists in project_contracts.data.contractProfile.
//
// Sparse throughout. `absentConcepts` inverts the old per-concept `present` flag so the
// common case (every concept present) stores nothing: a concept is present unless it is
// listed here.
// ---------------------------------------------------------------------------
export interface StoredContractProfile {
  meta: ProfileMeta;
  parameters: Partial<Record<ConceptKey, ConceptParametersOverride>>;
  clauseMap: Partial<Record<ConceptKey, ClauseTextEntry>>;
  /** Concepts this contract does not have at all. Engine computes nothing for them; the
   *  Workflows diagram renders the node as absent. */
  absentConcepts: ConceptKey[];
  unmappedClauses: UnmappedClause[];
  /** Free-text edge-case notes that don't fit a parameter. Surfaced to the bot as context.
   *  NEVER written back to clause text. */
  notes: string | null;
}

/**
 * Input to the seed helpers. Deliberately has no `contractId`: the profile is stored ON the
 * project_contracts row (data.contractProfile), so the row's own id is the contract id and
 * duplicating it inside the JSON only creates a field that can drift.
 */
export interface ContractProfileSeedInput {
  /** Override the default display label, e.g. "Aldar bespoke form". */
  baseLabel?: string;
  /** ISO timestamp for createdAt/updatedAt. Injectable so seeds are testable. */
  now?: string;
}

// ---------------------------------------------------------------------------
// THE ENGINE'S VIEW — the load-bearing type of this file.
//
// Every engine-facing function takes THIS, not StoredContractProfile. Passing a full
// profile still type-checks (it is a superset), but inside the function body `clauseMap`
// is not on the type, so the engine cannot reach clause prose. That is the deterministic
// invariant made structural rather than conventional.
// ---------------------------------------------------------------------------
export type EngineProfileView = Pick<StoredContractProfile, 'parameters'>;

// ---------------------------------------------------------------------------
// THE RESOLVED PROFILE — the materialised view for the Workflows tab and the bot.
// Produced by resolveProfile(). Nested per concept, because those consumers want
// everything about one concept in one place. Never persisted, never given to the engine.
// ---------------------------------------------------------------------------
export interface ResolvedConcept {
  key: ConceptKey;
  present: boolean;
  parameters: ConceptParameters;
  /** null when the contract has no clause text mapped to this concept yet. */
  clause: ClauseTextEntry | null;
  /** Live parameter fields that differ from what extraction read. Information only. */
  diverged: (keyof ConceptParameters)[];
}

export interface ResolvedContractProfile {
  meta: ProfileMeta;
  concepts: Record<ConceptKey, ResolvedConcept>;
  unmappedClauses: UnmappedClause[];
  notes: string | null;
}
/**
 * lib/contract/types.ts
 *
 * Core types for the ContractProfile — the single per-project object the deterministic engine
 * and the bot both read from.
 *
 * TWO LAYERS, held flat and joined by concept key:
 *   parameters : machine-read numbers + typed consequences. The engine consumes ONLY this.
 *   clauseMap  : verbatim prose from the uploaded document. The bot cites from this. The
 *                engine never reads it.
 *
 * Flat rather than nested per concept so the engine invariant is STRUCTURAL: EngineProfileView
 * below is a Pick that omits clauseMap entirely, so engine-facing code cannot reach clause
 * prose even by mistake.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PARAMETER RESOLUTION IS THREE LAYERS, highest wins:
 *
 *   manual    — the user typed it on the Workflows page
 *   contract  — what this contract's document says (particulars, appendix, or a bespoke form)
 *   general   — FIDIC General Conditions. Present ONLY for a FIDIC profile.
 *
 * `general` is never stored: it is the FIDIC_DEFAULTS constant. That is why both stored maps
 * below are sparse, and why the Workflows dialog can show "GC says 28, your contract says 21"
 * without ever having persisted 28.
 *
 * For a non-FIDIC profile there is no `general` layer, so a concept extraction did not find
 * resolves to UNRESOLVED — not to a FIDIC value. This is the most important behaviour in this
 * file: a bespoke contract with no notice provision must never silently inherit a 28-day
 * condition precedent and compute a real deadline from it.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * CLAUSE TEXT comes from the user's upload in both modes. A conformed Conditions of Contract
 * prints the General Conditions, the Particular Conditions and the Appendix to Tender in one
 * document, so the upload is both the extraction source and the retrieval corpus. ClaimGuard
 * ships no FIDIC prose — only the numbers in fidic-defaults.ts.
 */

// ---------------------------------------------------------------------------
// Concept keys — the stable internal address space (the "DNS zone"). Extraction maps each
// contract's clauses ONTO these; the engine resolves by key, never by clause number, so a
// contract's own numbering is irrelevant to computation.
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

export const OWNERS = ['contractor', 'engineer', 'employer'] as const;
export type Owner = (typeof OWNERS)[number];

// ---------------------------------------------------------------------------
// Consequence — governs ENGINE BEHAVIOUR, not just display. See CONSEQUENCE_BEHAVIOUR in
// concepts.ts. `null` means no expiry consequence (triggers only).
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
// Anchor — the real-world event a clock starts from. As important as duration. Editors
// constrain to a concept's validAnchors (concepts.ts); never free text.
// ---------------------------------------------------------------------------
export const ANCHORS = [
  'contractor_awareness',     // user-confirmed: became aware of the event
  'statement_received',       // user-confirmed: Engineer's receipt of the Statement
  'payment_due_date',         // DERIVED: the computed payment-due date
  'claim_received',           // user-confirmed: Engineer's receipt of the claim
  'consultation_complete',    // user-confirmed: consultation concluded
  'suspension_notice_served', // user-confirmed: contractor served the suspension notice
  'instruction_required',     // user-confirmed: when the drawing / instruction was needed
] as const;
export type Anchor = (typeof ANCHORS)[number];

export const CONCEPT_KINDS = ['deadline', 'trigger', 'right', 'accrual'] as const;
export type ConceptKind = (typeof CONCEPT_KINDS)[number];

// ---------------------------------------------------------------------------
// Financing rate. The GC default is a FORMULA, not a number, and Particular Conditions
// commonly amend it — so it is data. The engine does arithmetic on a confirmed figure; it
// never invents a rate.
// ---------------------------------------------------------------------------
export interface FinancingRate {
  basis: 'central_bank_plus' | 'fixed_annual';
  /** Percentage POINTS above the central-bank discount rate. Not basis points. */
  marginPoints?: number;
  /** If a particular fixes a flat annual rate instead, e.g. 0.09 for 9% p.a. */
  fixedAnnualRate?: number;
  compounding: 'monthly' | 'annual' | 'simple';
}

// ---------------------------------------------------------------------------
// Challenge window (determination only). The UAE flip: an Engineer-side nominal window
// becomes a CONTRACTOR-side time bar — miss the challenge and the determination is final.
// Absent from the FIDIC defaults. NOT YET CONSUMED BY THE ENGINE (see profile-adapter.ts).
// ---------------------------------------------------------------------------
export interface ChallengeWindow {
  days: number;
  owner: Owner;
  consequence: ConsequenceType;
}

// ---------------------------------------------------------------------------
// PARAMETERS LAYER — the only thing the engine reads.
//
// ConceptParameters is COMPLETE (the shape of a FIDIC default). ConceptParametersOverride is
// the SPARSE stored shape used by both the `contract` and `manual` layers.
//
// `undefined` vs `null` matters and the resolver distinguishes them:
//   undefined -> defer to the layer below
//   null      -> explicitly nominal / not applicable (a real, deliberate value)
// ---------------------------------------------------------------------------
export interface ConceptParameters {
  owner: Owner;
  anchor: Anchor | null;               // null for triggers
  durationDays: number | null;         // null = nominal / reasonable time (no hard clock)
  consequence: ConsequenceType | null; // null = no expiry consequence (triggers)
  financingRate?: FinancingRate;
  challengeWindow?: ChallengeWindow;
}

export type ConceptParametersOverride = Partial<ConceptParameters>;

/** Which layer a resolved value came from. `unresolved` = no layer supplied it. */
export const PARAMETER_LAYERS = ['manual', 'contract', 'general', 'unresolved'] as const;
export type ParameterLayer = (typeof PARAMETER_LAYERS)[number];

/**
 * The two STORED layers. `general` is deliberately absent — it is the FIDIC_DEFAULTS constant
 * for a FIDIC profile and nothing at all for a bespoke one.
 *
 * Keeping `contract` and `manual` separate rather than collapsing edits into one map is what
 * lets the UI answer "did I change this, or did the contract say it?" — and lets a user revert
 * an edit to what the document says by deleting one entry.
 */
export interface ProfileParameters {
  /** What extraction read from the uploaded document. Written by extraction, not by the user. */
  contract: Partial<Record<ConceptKey, ConceptParametersOverride>>;
  /** What the user typed on the Workflows page. Overrides `contract`. */
  manual: Partial<Record<ConceptKey, ConceptParametersOverride>>;
}

// ---------------------------------------------------------------------------
// CLAUSE-TEXT LAYER — verbatim prose from the upload, with the contract's own naming.
// ---------------------------------------------------------------------------

/** One passage of contract prose, as printed. */
export interface ClauseExcerpt {
  /** The document's own heading, verbatim. */
  contractLabel: string | null;
  /** The document's own clause number, for citation. */
  sourceClauseRef: string | null;
  text: string;
  /** Page in the source PDF, for "open the contract here". */
  page: number | null;
}

/**
 * A concept's clause material.
 *
 *   text / contractLabel / sourceClauseRef : the OPERATIVE wording — the General Conditions
 *          clause where unamended, the Particular Condition where one amends it. This is what
 *          Tier 2 puts in front of the bot and what the user proofreads.
 *   general : the General Conditions clause this replaced, kept when a particular amends it,
 *          so the Workflows dialog can show both. Null when nothing was amended.
 *   extractedParameters : what extraction READ from the operative wording, frozen at
 *          extraction time. Never rewritten when a human edits a live parameter — that
 *          snapshot is the baseline checkDivergence() measures against.
 */
export interface ClauseTextEntry {
  canonicalName: string;
  contractLabel: string | null;
  sourceClauseRef: string | null;
  text: string | null;
  page: number | null;
  general: ClauseExcerpt | null;
  extractedParameters?: ConceptParametersOverride;
  confirmed: boolean;
}

/** A clause that matched no concept. Kept verbatim for the record and Tier 3. */
export interface UnmappedClause {
  contractLabel: string | null;
  sourceClauseRef: string | null;
  text: string;
  page: number | null;
}

// ---------------------------------------------------------------------------
// Profile metadata
// ---------------------------------------------------------------------------

/**
 * The fork the user makes before uploading. It cannot be inferred: a UAE developer's conformed
 * Conditions of Contract is FIDIC with amendments printed inline, and reads exactly like a
 * bespoke form to any classifier.
 *
 *   fidic  — extraction runs as a DIFF against the General Conditions. Anything not found
 *            stays at the GC value, which is correct.
 *   custom — extraction runs a FULL READ. Anything not found is UNRESOLVED. No deadline.
 */
export type ProfileType = 'fidic' | 'custom';

export interface ProfileMeta {
  profileType: ProfileType;
  /** e.g. "FIDIC Red Book 1999" or "Aldar bespoke form". Display + provenance. */
  baseLabel: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export interface ContractProfileSeedInput {
  baseLabel?: string;
  /** ISO timestamp for createdAt/updatedAt. Injectable so seeds are testable. */
  now?: string;
}

// ---------------------------------------------------------------------------
// THE STORED PROFILE — persisted in project_contracts.data.contractProfile.
// ---------------------------------------------------------------------------
export interface StoredContractProfile {
  meta: ProfileMeta;
  parameters: ProfileParameters;
  clauseMap: Partial<Record<ConceptKey, ClauseTextEntry>>;
  /** Concepts this contract does not have at all. Engine computes nothing for them. */
  absentConcepts: ConceptKey[];
  unmappedClauses: UnmappedClause[];
  /** Free-text edge cases. Surfaced to the bot; NEVER written back to clause text. */
  notes: string | null;
}

// ---------------------------------------------------------------------------
// THE ENGINE'S VIEW — the load-bearing type of this file.
//
// `meta` is included because the resolver needs profileType to decide whether the FIDIC
// baseline applies. `clauseMap` is NOT, so engine-facing code physically cannot read prose.
// ---------------------------------------------------------------------------
export type EngineProfileView = Pick<StoredContractProfile, 'parameters' | 'meta'>;

// ---------------------------------------------------------------------------
// THE RESOLVED VIEW — materialised for the Workflows page and the bot. Nested per concept,
// because those consumers want everything about one concept together. Never persisted.
// ---------------------------------------------------------------------------

/** Per-field provenance, so the UI can label where every number came from. */
export type ParameterProvenance = Record<
  'owner' | 'anchor' | 'durationDays' | 'consequence',
  ParameterLayer
>;

/**
 * A resolved parameter set.
 *
 * `resolved: false` means NO layer supplied this concept — the contract may not contain it, or
 * extraction may not have found it. Distinct from `durationDays: null`, which is a known,
 * deliberate "nominal / reasonable time". The engine must compute nothing for an unresolved
 * concept, and the UI must show it as needing attention rather than as a value.
 */
export interface ResolvedParameters extends ConceptParameters {
  resolved: boolean;
  provenance: ParameterProvenance;
}

export interface ResolvedConcept {
  key: ConceptKey;
  present: boolean;
  parameters: ResolvedParameters;
  clause: ClauseTextEntry | null;
  /** Live fields differing from what extraction read. Information only, never reconciled. */
  diverged: (keyof ConceptParameters)[];
}

export interface ResolvedContractProfile {
  meta: ProfileMeta;
  concepts: Record<ConceptKey, ResolvedConcept>;
  unmappedClauses: UnmappedClause[];
  notes: string | null;
}
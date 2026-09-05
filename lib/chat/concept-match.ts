// lib/chat/concept-match.ts
//
// TIER 2 — the DNS resolver. A question comes in as natural language; this resolves it to zero
// or more ConceptKeys, which the context assembler then uses to pull EXACT clause text and
// provenance out of the profile's clauseMap.
//
// Deliberately DETERMINISTIC — no model call. Three reasons:
//   1. It runs on every message; an LLM classify step would add latency and a failure mode to
//      the one part of the bot that must never silently degrade.
//   2. Tier 3 (semantic retrieval) is always-on behind this, so a miss here is not a dead end —
//      it falls through to retrieval rather than losing the answer.
//   3. The highest-signal matches are exact strings, not semantics: the user typing "clause
//      20.1" or the contract's own heading is an unambiguous address, and embedding it would
//      only add noise.
//
// The contract's OWN vocabulary is indexed at runtime from clauseMap, which is the whole point
// of the DNS design: on an Aldar form where the notice provision is clause 44.2 under a heading
// the contractor actually uses, "44.2" resolves to claim_notice without anything being
// hardcoded.

import type { ConceptKey, StoredContractProfile } from '@/lib/contract/types';
import { CONCEPT_KEYS } from '@/lib/contract/types';

/**
 * Surface forms for each concept — how a contractor actually TYPES about it. Kept here rather
 * than on ConceptDescriptor because concepts.ts is structural (what the engine and Workflows UI
 * need) and this is linguistic (what the bot needs). Different reasons to change.
 *
 * FIDIC clause numbers are included as terms because they are the lingua franca even on amended
 * forms — but they are STATIC hints, not authority. A contract's real numbering comes from
 * clauseMap and outranks these (see scoring below).
 */
const STATIC_TERMS: Record<ConceptKey, readonly string[]> = {
  claim_notice: [
    'notice of claim', 'claim notice', 'notice period', 'time bar', 'time-barred',
    '28 day', '28-day', 'clause 20.1', 'sub-clause 20.1', '20.1', 'notify the engineer',
  ],
  claim_particulars: [
    'particulars', 'fully detailed claim', 'detailed claim', 'supporting particulars',
    '42 day', '42-day', 'substantiate',
  ],
  payment_statement: [
    'statement', 'monthly statement', 'application for payment', 'payment application',
    'clause 14.3', '14.3', 'submit my statement',
  ],
  ipc_issue: [
    'ipc', 'interim payment certificate', 'certificate', 'certify', 'certification',
    'clause 14.6', '14.6', 'engineer has not certified',
  ],
  payment_due: [
    'payment', 'paid', 'payment due', 'due date', 'overdue payment', 'not been paid',
    'clause 14.7', '14.7', '56 day', '56-day',
  ],
  financing_charges: [
    'financing charge', 'financing charges', 'interest', 'late payment interest',
    'clause 14.8', '14.8', 'compound', 'discount rate',
  ],
  suspension_notice: [
    'suspend', 'suspension', 'reduce the rate of work', 'stop work', 'down tools',
    'clause 16.1', '16.1', '21 day', '21-day',
  ],
  claim_response: [
    'engineer response', "engineer's response", 'response to my claim', 'approve the claim',
    'disapprove', 'engineer has not responded',
  ],
  determination: [
    'determination', 'determine', 'determined', 'consultation', 'agreement or determination',
    'clause 3.5', '3.5', 'fair determination',
  ],
  delayed_instruction: [
    'rfi', 'request for information', 'drawing', 'instruction', 'delayed drawing',
    'missing information', 'clause 1.9', '1.9', 'further information',
  ],
};

export interface ConceptMatch {
  key: ConceptKey;
  score: number;
  /** What matched, for debugging and for the "why did it answer from this clause" trace. */
  via: string;
}

/** Weights. Contract-specific evidence outranks the static FIDIC hints, always. */
const W_SOURCE_CLAUSE_REF = 10; // the contract's own clause number — an exact address
const W_CONTRACT_LABEL = 6;     // the contract's own heading
const W_CANONICAL_NAME = 4;     // ClaimGuard's label / project alias
const W_STATIC_TERM = 2;        // generic FIDIC vocabulary

/** Below this, a match is noise; fall through to Tier 3 alone. */
export const MATCH_THRESHOLD = 4;

function normalise(s: string): string {
  return s.toLowerCase().replace(/[\u2018\u2019\u201c\u201d]/g, "'").replace(/\s+/g, ' ').trim();
}

/**
 * A clause reference appears in a question as a bare number ("what does 14.7 say"), so matching
 * it as a substring would fire on any digits. Bound it to a token so "114.75" does not match
 * "14.7".
 */
function containsClauseRef(haystack: string, ref: string): boolean {
  const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\d.])${escaped}([^\\d]|$)`).test(haystack);
}

/**
 * matchConcepts — resolve a question to concepts, best first.
 *
 * Takes the profile so the contract's own vocabulary is in the index. Returns only matches at
 * or above MATCH_THRESHOLD; an empty array is a legitimate, common outcome (general questions,
 * commercial questions, anything outside the ten modelled concepts) and simply means Tier 2
 * contributes nothing to this turn.
 */
export function matchConcepts(
  question: string,
  profile: Pick<StoredContractProfile, 'clauseMap' | 'absentConcepts'>,
  limit = 3,
): ConceptMatch[] {
  const q = normalise(question);
  const absent = new Set(profile.absentConcepts);
  const results: ConceptMatch[] = [];

  for (const key of CONCEPT_KEYS) {
    // A concept the contract does not contain must never be cited as if it did.
    if (absent.has(key)) continue;

    let score = 0;
    const via: string[] = [];
    const entry = profile.clauseMap[key];

    if (entry?.sourceClauseRef && containsClauseRef(q, normalise(entry.sourceClauseRef))) {
      score += W_SOURCE_CLAUSE_REF;
      via.push(`clause ref ${entry.sourceClauseRef}`);
    }
    if (entry?.contractLabel && q.includes(normalise(entry.contractLabel))) {
      score += W_CONTRACT_LABEL;
      via.push(`contract heading "${entry.contractLabel}"`);
    }
    if (entry?.canonicalName && q.includes(normalise(entry.canonicalName))) {
      score += W_CANONICAL_NAME;
      via.push(`name "${entry.canonicalName}"`);
    }
    for (const term of STATIC_TERMS[key]) {
      const t = normalise(term);
      const hit = /^\d+(\.\d+)*$/.test(t) ? containsClauseRef(q, t) : q.includes(t);
      if (hit) {
        score += W_STATIC_TERM;
        via.push(`term "${term}"`);
        break; // one static hit is evidence; ten is not ten times the evidence
      }
    }

    if (score >= MATCH_THRESHOLD) results.push({ key, score, via: via.join(', ') });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}
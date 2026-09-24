// TIER 2 — the DNS resolver. A question comes in as natural language; this resolves it to zero
// or more ConceptKeys, which the context assembler then uses to pull exact clause text and
// provenance out of the profile's clauseMap.


import type { ConceptKey, StoredContractProfile } from '@/lib/contract/types';
import { CONCEPT_KEYS } from '@/lib/contract/types';

//mapping each concept to phrases contractors are likely to refer to 
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
  // What matched, for debugging and for the "why did it answer from this clause" trace. (to be implemented)
  via: string;
}

//Weights. Contract-specific evidence outranks the static FIDIC hints
const W_SOURCE_CLAUSE_REF = 10; // the contract's own clause number — an exact address
const W_CONTRACT_LABEL = 6;     // the contract's own heading
const W_CANONICAL_NAME = 4;     // ClaimGuard's label / project alias
const W_STATIC_TERM = 2;        // generic FIDIC vocabulary

// Below this, a match is noise; fall through to Tier 3 alone. 
export const MATCH_THRESHOLD = 4;

function normalise(s: string): string {
  return s.toLowerCase().replace(/[\u2018\u2019\u201c\u201d]/g, "'").replace(/\s+/g, ' ').trim();
}

function containsClauseRef(haystack: string, ref: string): boolean {
  const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\d.])${escaped}([^\\d]|$)`).test(haystack);
}

//resolve a question to concepts, best first.
//Takes the profile so the contract's own vocabulary is in the index. Returns only matches at or above MATCH_THRESHOLD;

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

    //checks the score of the inputed question
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
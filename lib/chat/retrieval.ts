// lib/chat/retrieval.ts
//
// TIER 3 — always-on, relevance-gated semantic retrieval over the full contract corpus.
//
// STATUS: interface only. The implementation is BLOCKED, not merely unwritten, and the blocker
// is upstream of this file: the Marina Heights contract PDF is vector-outlined, so text
// extraction returns garbage. There is nothing to embed. Wiring an embedding pipeline against
// corrupt text would produce a retriever that confidently returns nonsense — strictly worse
// than one that returns nothing, because Tiers 1 and 2 already carry the load and a silent bad
// chunk would poison an otherwise correct answer.
//
// So this ships as a null implementation behind a stable interface. Tiers 1 and 2 work today;
// when OCR (tesseract.js fallback) lands and the corpus is real, only retrieveChunks() changes.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE DESIGN THIS IMPLEMENTS WHEN UNBLOCKED — always-retrieve-then-threshold-gate:
//
//   Retrieve on EVERY question, then discard below a similarity floor. NOT: pre-classify
//   whether the question "needs" the contract and skip retrieval if not. Pre-classification is
//   a second judgement call that can be wrong in the expensive direction — deciding a question
//   is off-contract when the answer was in clause 47. Retrieval is cheap; the gate is a
//   threshold on a number, not an opinion.
// ─────────────────────────────────────────────────────────────────────────────

export interface CorpusChunk {
  /** Stable id of the stored chunk. */
  id: string;
  /** Verbatim contract prose. Never paraphrased at storage time. */
  text: string;
  /** For citation: the contract's own clause number, where the chunk carries one. */
  sourceClauseRef: string | null;
  /** Page in the source PDF, for the "open the contract at this page" affordance. */
  page: number | null;
}

export interface RetrievedChunk extends CorpusChunk {
  /** Cosine similarity, 0–1. */
  score: number;
}

/**
 * The similarity floor. Chunks below this are discarded rather than passed to the model.
 * Deliberately conservative: a weak chunk is not neutral, it is a distractor that competes with
 * the confirmed parameters in Tier 1. Tune against real questions once the corpus exists.
 */
export const RELEVANCE_FLOOR = 0.62;

/** Cap on chunks admitted per turn, after gating. */
export const MAX_CHUNKS = 4;

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  /** False when retrieval could not run at all (no corpus / extraction failed). Distinct from
   *  "ran and found nothing", which is a valid, common result with chunks: []. */
  available: boolean;
  reason?: string;
}

/**
 * retrieveChunks — Tier 3 entry point.
 *
 * IMPLEMENTATION SKETCH for when the corpus exists (pgvector on Supabase):
 *
 *   1. Embed `question` (single call, cache by hash — questions repeat).
 *   2. `select id, text, source_clause_ref, page, 1 - (embedding <=> $1) as score
 *       from contract_chunks
 *       where project_id = $2
 *       order by embedding <=> $1
 *       limit 20`
 *   3. Filter `score >= RELEVANCE_FLOOR`, take MAX_CHUNKS.
 *   4. Drop any chunk whose source_clause_ref already came through Tier 2 — Tier 2's copy is
 *      exact and carries provenance; a fuzzy duplicate of it is pure token cost.
 *
 * Step 4 is the one that is easy to forget and expensive to omit.
 *
 * MUST FAIL SOFT. Every AI call in ClaimGuard fails without blocking deadline visibility; this
 * one returns `available: false` and the assembler carries on with Tiers 1 and 2. It must never
 * throw into the chat route.
 */
export async function retrieveChunks(
  _question: string,
  _projectId: string,
): Promise<RetrievalResult> {
  return {
    chunks: [],
    available: false,
    reason:
      'Contract corpus not indexed. Blocked on PDF text extraction (vector-outlined source; ' +
      'OCR fallback pending).',
  };
}
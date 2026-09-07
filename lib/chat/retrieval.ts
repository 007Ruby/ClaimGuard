// lib/chat/retrieval.ts
//
// TIER 3 — always-on, relevance-gated semantic retrieval over the contract corpus.
//
// ─────────────────────────────────────────────────────────────────────────────
// ALWAYS RETRIEVE, THEN THRESHOLD-GATE. Not: pre-classify whether the question "needs" the
// contract and skip retrieval if not. Pre-classification is a second judgement that can be
// wrong in the expensive direction — deciding a question is off-contract when the answer was
// in clause 47. Retrieval is cheap; the gate is a threshold on a number, not an opinion.
// ─────────────────────────────────────────────────────────────────────────────
//
// FAILS SOFT, ALWAYS. Every path returns `available: false` rather than throwing. Tiers 1 and 2
// answer every deadline question with this tier entirely absent, and a chat route that 500s
// because an embedding call timed out is a far worse outcome than a thinner answer.

import { EMBEDDING_MODEL } from '@/lib/contract/ingest';

export interface CorpusChunk {
  id: string;
  /** Verbatim contract prose. Never paraphrased at storage time. */
  text: string;
  /** The contract's own clause number, where the chunk carries one. */
  sourceClauseRef: string | null;
  page: number | null;
}

export interface RetrievedChunk extends CorpusChunk {
  /** Cosine similarity, 0–1. */
  score: number;
}

/**
 * The similarity floor. Deliberately conservative: a weak chunk is not neutral, it is a
 * distractor competing with the confirmed parameters in Tier 1. Tune against real questions
 * once you have a corpus — start by logging scores and reading what lands between 0.5 and 0.7.
 */
export const RELEVANCE_FLOOR = 0.62;

/** Cap on chunks admitted per turn, after gating. */
export const MAX_CHUNKS = 4;

/** Candidates pulled before gating. Wider than MAX_CHUNKS so the floor does the selecting. */
const CANDIDATE_LIMIT = 20;

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  /** False when retrieval could not run at all. Distinct from "ran and found nothing", which
   *  is a valid, common result with chunks: []. */
  available: boolean;
  reason?: string;
}

const UNAVAILABLE = (reason: string): RetrievalResult => ({ chunks: [], available: false, reason });

interface MatchRow {
  chunk_id: string;
  text: string;
  source_clause_ref: string | null;
  page: number | null;
  score: number;
}

export interface RetrievalDeps {
  supabase: {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: MatchRow[] | null; error: unknown }>;
  };
  openai: {
    embeddings: {
      create: (a: { model: string; input: string }) => PromiseLike<{ data: { embedding: number[] }[] }>;
    };
  };
}

/**
 * retrieveChunks — Tier 3 entry point.
 *
 * Dependencies are injected rather than imported, so this is testable without a database and
 * the chat route owns client construction. Pass `null` to disable the tier entirely — useful
 * while a corpus is being rebuilt, and the honest state for a project whose PDF has no text
 * layer.
 */
export async function retrieveChunks(
  question: string,
  projectId: string,
  deps: RetrievalDeps | null,
): Promise<RetrievalResult> {
  if (!deps) return UNAVAILABLE('Retrieval not configured for this project.');
  if (question.trim().length < 3) return UNAVAILABLE('Question too short to retrieve on.');

  let embedding: number[];
  try {
    const res = await deps.openai.embeddings.create({ model: EMBEDDING_MODEL, input: question });
    const first = res.data[0]?.embedding;
    if (!first) return UNAVAILABLE('Embedding returned no vector.');
    embedding = first;
  } catch (err) {
    console.error('[retrieval] embedding failed:', err);
    return UNAVAILABLE('Could not embed the question.');
  }

  try {
    const { data, error } = await deps.supabase.rpc('match_contract_chunks', {
      p_project_id: projectId,
      p_embedding: embedding,
      p_limit: CANDIDATE_LIMIT,
    });

    if (error) {
      console.error('[retrieval] match query failed:', error);
      return UNAVAILABLE('Could not search the contract index.');
    }

    const rows = data ?? [];

    // Ran fine, found nothing: a real result, not a failure. The contract may simply not
    // address the question. `available: true` so the assembler reports it honestly.
    const chunks = rows
      .filter((r) => r.score >= RELEVANCE_FLOOR)
      .slice(0, MAX_CHUNKS)
      .map((r) => ({
        id: r.chunk_id,
        text: r.text,
        sourceClauseRef: r.source_clause_ref,
        page: r.page,
        score: r.score,
      }));

    return { chunks, available: true };
  } catch (err) {
    console.error('[retrieval] unexpected failure:', err);
    return UNAVAILABLE('Retrieval failed.');
  }
}
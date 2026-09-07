// lib/contract/ingest.ts
//
// TIER 3 INGESTION. Turns an uploaded Conditions of Contract into a retrievable corpus.
//
// Runs for BOTH profile types. A conformed document prints the General Conditions, the
// Particular Conditions and the Appendix to Tender together, so the upload is the whole corpus
// — ClaimGuard ships no FIDIC prose of its own and there is no second source to merge.
//
// ─────────────────────────────────────────────────────────────────────────────
// CHUNKING IS CLAUSE-AWARE, NOT FIXED-WINDOW.
//
// A fixed 500-token window cuts through the middle of provisions, and half a clause is worse
// than no clause: it reads complete, carries a clause number, and omits the proviso that
// changes its meaning. Contract prose is already structured — numbered clauses with a
// consistent numbering scheme — so the chunk boundary should follow the document's own
// structure. Only when a single clause exceeds the size ceiling does this fall back to
// splitting, and then on paragraph boundaries with the clause reference carried onto every
// piece so citation survives.
// ─────────────────────────────────────────────────────────────────────────────

import type { CorpusChunk } from '@/lib/chat/retrieval';

/** A page of extracted text, as produced by the PDF text layer. */
export interface SourcePage {
  page: number;
  text: string;
}

/** Chunk size ceiling, in characters. Roughly 500 tokens — comfortably inside the embedding
 *  model's window and small enough that four retrieved chunks do not crowd out Tier 1. */
const MAX_CHUNK_CHARS = 2000;

/** Below this a "clause" is a heading, a page number, or extraction noise. Indexing those
 *  pollutes similarity search with high-scoring meaningless matches. */
const MIN_CHUNK_CHARS = 80;

/**
 * Matches a clause number at the start of a line: "20.1", "14.6.2", "3.5 Determinations".
 * Anchored to line start with the multiline flag, because a bare number mid-sentence ("within
 * 28 days under 20.1") is a cross-reference, not a new clause.
 */
const CLAUSE_START = /^[ \t]*(\d{1,2}(?:\.\d{1,2}){0,3})[ \t.)\u2014-]+(?=\S)/;

interface RawSection {
  ref: string | null;
  lines: string[];
  page: number;
}

/**
 * splitIntoSections — walk the pages line by line, opening a new section whenever a line
 * begins with a clause number. Lines before the first clause number (cover pages, contents)
 * accumulate into an unreferenced leading section, which usually falls below MIN_CHUNK_CHARS
 * and is dropped.
 */
function splitIntoSections(pages: SourcePage[]): RawSection[] {
  const sections: RawSection[] = [];
  let current: RawSection = { ref: null, lines: [], page: pages[0]?.page ?? 1 };

  for (const { page, text } of pages) {
    for (const line of text.split(/\r?\n/)) {
      const match = CLAUSE_START.exec(line);
      if (match?.[1]) {
        if (current.lines.length > 0) sections.push(current);
        current = { ref: match[1], lines: [line], page };
      } else {
        current.lines.push(line);
      }
    }
  }
  if (current.lines.length > 0) sections.push(current);

  return sections;
}

/** Split an oversized section on blank lines, keeping the clause reference on every part. */
function splitOversized(section: RawSection): RawSection[] {
  const paragraphs = section.lines.join('\n').split(/\n\s*\n/);
  const out: RawSection[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (buffer.length > 0) {
      out.push({ ref: section.ref, lines: [...buffer], page: section.page });
      buffer = [];
    }
  };

  for (const para of paragraphs) {
    const wouldBe = [...buffer, para].join('\n\n').length;
    if (wouldBe > MAX_CHUNK_CHARS && buffer.length > 0) flush();
    buffer.push(para);
  }
  flush();

  return out;
}

/**
 * chunkDocument — pure. No I/O, no model call, so it is testable against a fixture and its
 * output can be eyeballed before anything is embedded. Worth doing on a real contract before
 * trusting the retriever: bad chunk boundaries are invisible once everything is a vector.
 */
export function chunkDocument(pages: SourcePage[], idPrefix: string): CorpusChunk[] {
  const sections = splitIntoSections(pages).flatMap((s) =>
    s.lines.join('\n').length > MAX_CHUNK_CHARS ? splitOversized(s) : [s],
  );

  return sections
    .map((s) => ({ ...s, text: s.lines.join('\n').replace(/[ \t]+\n/g, '\n').trim() }))
    .filter((s) => s.text.length >= MIN_CHUNK_CHARS)
    .map((s, i) => ({
      id: `${idPrefix}:${i}`,
      text: s.text,
      sourceClauseRef: s.ref,
      page: s.page,
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Embedding + storage
// ─────────────────────────────────────────────────────────────────────────────

export const EMBEDDING_MODEL = 'text-embedding-3-small';
export const EMBEDDING_DIMENSIONS = 1536;

/** OpenAI accepts batched inputs; batching cuts a 300-chunk contract from 300 round trips to 3. */
const EMBED_BATCH = 128;

/**
 * embedTexts — vectors for a list of strings, in input order.
 *
 * Throws on failure rather than returning partial results. A half-embedded corpus is the worst
 * outcome available: retrieval would run, return the chunks that happened to make it, and give
 * no signal that the rest of the contract is missing. Better to fail the whole ingest and leave
 * the corpus unavailable, which retrieval.ts already reports honestly.
 */
export async function embedTexts(
  texts: string[],
  openai: { embeddings: { create: (a: { model: string; input: string[] }) => Promise<{ data: { embedding: number[] }[] }> } },
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: batch });
    if (res.data.length !== batch.length) {
      throw new Error(`Embedding returned ${res.data.length} vectors for ${batch.length} inputs.`);
    }
    for (const d of res.data) out.push(d.embedding);
  }
  return out;
}

export interface IngestResult {
  chunks: number;
  skipped: number;
}

/**
 * ingestContractDocument — chunk, embed, and store.
 *
 * Deletes this project's existing chunks first, so a re-upload replaces rather than
 * accumulates. Re-uploading a corrected contract is a normal thing to do, and a corpus holding
 * both the old and the new wording would retrieve contradictory clauses with no way to tell
 * which governs.
 */
export async function ingestContractDocument(input: {
  projectId: string;
  documentId: string;
  pages: SourcePage[];
  supabase: {
    from: (t: string) => {
      delete: () => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
      insert: (rows: unknown[]) => Promise<{ error: unknown }>;
    };
  };
  openai: Parameters<typeof embedTexts>[1];
}): Promise<IngestResult> {
  const { projectId, documentId, pages, supabase, openai } = input;

  const chunks = chunkDocument(pages, documentId);
  if (chunks.length === 0) {
    // Almost always means the PDF has no text layer — scanned, or vector-outlined. Callers
    // should surface this rather than reporting a successful ingest of nothing.
    throw new Error(
      'No text could be extracted from this document. It may be a scan or have outlined text.',
    );
  }

  const vectors = await embedTexts(chunks.map((c) => c.text), openai);

  const { error: deleteError } = await supabase
    .from('contract_chunks')
    .delete()
    .eq('project_id', projectId);
  if (deleteError) {
    console.error('[ingest] failed clearing old chunks:', deleteError);
    throw new Error('Could not clear the previous contract index.');
  }

  const rows = chunks.map((c, i) => ({
    project_id: projectId,
    document_id: documentId,
    chunk_id: c.id,
    text: c.text,
    source_clause_ref: c.sourceClauseRef,
    page: c.page,
    embedding: vectors[i],
  }));

  const { error: insertError } = await supabase.from('contract_chunks').insert(rows);
  if (insertError) {
    console.error('[ingest] failed inserting chunks:', insertError);
    throw new Error('Could not save the contract index.');
  }

  return { chunks: chunks.length, skipped: 0 };
}
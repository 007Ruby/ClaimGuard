// lib/rfi/types.ts

export type RfiStatus = "draft" | "sent" | "responded" | "closed";

export interface RfiQuery {
  question: string;
  contractRef?: string | null; // e.g. "1.9"
}

/**
 * The seed shape used by the parked assistant / inbox-flag entry points via
 * createRfiDraft(seed). The RFI *page* no longer mints rows up-front — it uses
 * the builder + saveRfiDraft (mirroring follow-ups), so createRfiDraft is now
 * only kept alive for those other entry points.
 */
export interface RfiSeed {
  eventId?: string | null;
  evidenceId?: string | null;
  recipient?: string | null;
  subject?: string | null;
  background?: string | null;
  queries?: RfiQuery[];
  contractReferences?: string[];
  aiGenerated?: boolean;
}

export interface Rfi {
  id: string;
  orgId: string;
  projectId: string;
  eventId: string | null;
  evidenceId: string | null;
  reference: string;
  status: RfiStatus;
  recipient: string | null;
  subject: string | null;
  background: string | null;
  queries: RfiQuery[];
  contractReferences: string[];
  draftBody: string | null;
  responseRequiredBy: string | null;
  dateSent: string | null;
  responseReceivedOn: string | null;
  responseSummary: string | null;
  aiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
}

export const RFI_STATUSES: RfiStatus[] = [
  "draft",
  "sent",
  "responded",
  "closed",
];

/** Queries → the plain one-per-line textarea the builder/detail dialog edit. */
export function queriesToText(queries: RfiQuery[]): string {
  return queries.map((q) => q.question).filter(Boolean).join("\n");
}

/**
 * The plain textarea → queries. AI-supplied contract refs are recovered
 * POSITIONALLY: a line keeps its ref only if its question text is unchanged
 * from the same position in `prev` (the last Analyze output, or the row's
 * stored queries). Edited/new lines get a null ref — there's no ref-editing UI.
 */
export function linesToQueries(text: string, prev: RfiQuery[] = []): RfiQuery[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((question, i) => ({
      question,
      contractRef:
        prev[i] && prev[i].question.trim() === question
          ? prev[i].contractRef ?? null
          : null,
    }));
}

/** DB row (snake_case) → app model (camelCase). */
export function mapRfi(row: any): Rfi {
  const rawQueries = Array.isArray(row?.queries) ? row.queries : [];
  return {
    id: row.id,
    orgId: row.org_id,
    projectId: row.project_id,
    eventId: row.event_id ?? null,
    evidenceId: row.evidence_id ?? null,
    reference: row.reference,
    status: (row.status ?? "draft") as RfiStatus,
    recipient: row.recipient ?? null,
    subject: row.subject ?? null,
    background: row.background ?? null,
    queries: rawQueries.map((q: any) => ({
      question: (q?.question ?? "").toString(),
      contractRef: q?.contract_ref ?? null,
    })),
    contractReferences: Array.isArray(row.contract_references)
      ? row.contract_references
      : [],
    draftBody: row.draft_body ?? null,
    responseRequiredBy: row.response_required_by ?? null,
    dateSent: row.date_sent ?? null,
    responseReceivedOn: row.response_received_on ?? null,
    responseSummary: row.response_summary ?? null,
    aiGenerated: !!row.ai_generated,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
// lib/rfi/types.ts

export type RfiStatus = "draft" | "sent" | "responded" | "closed";

export interface RfiQuery {
  question: string;
  contractRef?: string | null; // e.g. "1.9"
}

/**
 * The single seed shape used by ALL three entry points
 * (inbox flag · assistant card · manual "Analyze with AI").
 * createRfiDraft(seed) writes a draft row, then we deep-link to
 * /rfi?open={id}&ts={nonce}.
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
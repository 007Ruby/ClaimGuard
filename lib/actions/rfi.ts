"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import {
  mapRfi,
  RFI_STATUSES,
  type Rfi,
  type RfiQuery,
  type RfiSeed,
  type RfiStatus,
} from "@/lib/rfi/types";

function normalizeQueries(queries?: RfiQuery[]) {
  return Array.isArray(queries)
    ? queries
        .filter((q) => q && (q.question ?? "").trim())
        .map((q) => ({
          question: q.question.trim(),
          contract_ref: (q.contractRef ?? "")?.toString().trim() || null,
        }))
    : [];
}

async function nextReference(supabase: any, projectId: string) {
  const { count } = await supabase
    .from("rfis")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  return `RFI-${String((count ?? 0) + 1).padStart(3, "0")}`;
}

/**
 * saveRfiDraft — the RFI-page equivalent of saveFollowUpDraft. Inserts a FRESH
 * draft row every time (RFIs accumulate — each is a numbered instrument, so
 * there's no partial-unique-index like follow-ups) and returns its id. The
 * builder holds the in-progress draft; a row only exists once you Save.
 *
 * Reference is per-project sequential (count + 1). Single-user tool, so the
 * theoretical race on concurrent creates is acceptable for now.
 */
export async function saveRfiDraft(input: {
  evidence_id?: string | null;
  event_id?: string | null;
  recipient?: string | null;
  subject?: string | null;
  background?: string | null;
  queries?: RfiQuery[];
  contract_references?: string[];
  draft_body?: string | null;
  ai_generated?: boolean;
}): Promise<{ error?: string; id?: string }> {
  const { orgId, projectId, user } = await getSessionContext();
  const supabase = await createClient();

  const reference = await nextReference(supabase, projectId);

  const { data, error } = await supabase
    .from("rfis")
    .insert({
      org_id: orgId,
      project_id: projectId,
      event_id: input.event_id ?? null,
      evidence_id: input.evidence_id ?? null,
      reference,
      status: "draft",
      recipient: (input.recipient ?? "The Engineer").trim() || "The Engineer",
      subject: (input.subject ?? "").trim() || null,
      background: (input.background ?? "").trim() || null,
      queries: normalizeQueries(input.queries),
      contract_references: Array.isArray(input.contract_references)
        ? input.contract_references
        : [],
      draft_body: (input.draft_body ?? "").trim() || null,
      ai_generated: !!input.ai_generated,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data)
    return { error: error?.message ?? "Could not save the RFI." };

  revalidatePath("/rfi");
  return { id: data.id };
}

/** Flip a saved RFI to 'sent' and stamp today's date. */
export async function markRfiSent(id: string): Promise<{ error?: string }> {
  const today = new Date().toISOString().slice(0, 10);
  return updateRfi(id, { status: "sent", dateSent: today });
}

/**
 * RETAINED (no longer the RFI page's entry pattern). The manual page now uses
 * the builder + saveRfiDraft. createRfiDraft is kept only so the parked
 * assistant panel and create-rfi.tsx imports don't break the build — delete it
 * (and them) when those entry points are removed.
 */
export async function createRfiDraft(
  seed: RfiSeed,
): Promise<{ error?: string; id?: string }> {
  return saveRfiDraft({
    evidence_id: seed.evidenceId ?? null,
    event_id: seed.eventId ?? null,
    recipient: seed.recipient ?? null,
    subject: seed.subject ?? null,
    background: seed.background ?? null,
    queries: seed.queries,
    contract_references: seed.contractReferences,
    ai_generated: !!seed.aiGenerated,
  });
}

/**
 * Patch an existing RFI. Only whitelisted, camel-cased fields are accepted and
 * mapped to columns; queries are re-shaped to snake_case.
 */
export async function updateRfi(
  id: string,
  patch: Partial<
    Pick<
      Rfi,
      | "eventId"
      | "evidenceId"
      | "recipient"
      | "subject"
      | "background"
      | "queries"
      | "contractReferences"
      | "draftBody"
      | "responseRequiredBy"
      | "dateSent"
      | "responseReceivedOn"
      | "responseSummary"
      | "status"
    >
  > & { aiGenerated?: boolean },
): Promise<{ error?: string }> {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ("eventId" in patch) row.event_id = patch.eventId ?? null;
  if ("evidenceId" in patch) row.evidence_id = patch.evidenceId ?? null;
  if ("recipient" in patch) row.recipient = (patch.recipient ?? "").trim() || null;
  if ("subject" in patch) row.subject = (patch.subject ?? "").trim() || null;
  if ("background" in patch) row.background = (patch.background ?? "").trim() || null;
  if ("draftBody" in patch) row.draft_body = (patch.draftBody ?? "").trim() || null;
  if ("responseRequiredBy" in patch) row.response_required_by = patch.responseRequiredBy ?? null;
  if ("dateSent" in patch) row.date_sent = patch.dateSent ?? null;
  if ("responseReceivedOn" in patch) row.response_received_on = patch.responseReceivedOn ?? null;
  if ("responseSummary" in patch) row.response_summary = (patch.responseSummary ?? "").trim() || null;
  if ("aiGenerated" in patch) row.ai_generated = !!patch.aiGenerated;

  if ("status" in patch) {
    const s = (patch.status ?? "").toString();
    row.status = RFI_STATUSES.includes(s as RfiStatus) ? s : "draft";
  }

  if ("contractReferences" in patch) {
    row.contract_references = Array.isArray(patch.contractReferences)
      ? patch.contractReferences
      : [];
  }

  if ("queries" in patch) {
    row.queries = normalizeQueries(patch.queries);
  }

  const { error } = await supabase
    .from("rfis")
    .update(row)
    .eq("id", id)
    .eq("project_id", projectId);

  if (error) return { error: error.message };

  revalidatePath("/rfi");
  return {};
}

export async function setRfiStatus(
  id: string,
  status: RfiStatus,
): Promise<{ error?: string }> {
  return updateRfi(id, { status });
}

export async function listRfis(): Promise<Rfi[]> {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("rfis")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  return (data ?? []).map(mapRfi);
}

export async function getRfi(id: string): Promise<Rfi | null> {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("rfis")
    .select("*")
    .eq("id", id)
    .eq("project_id", projectId)
    .single();
  return data ? mapRfi(data) : null;
}
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { mapRfi, RFI_STATUSES, type Rfi, type RfiSeed, type RfiStatus } from "@/lib/rfi/types";

function normalizeQueries(seed: RfiSeed) {
  return Array.isArray(seed.queries)
    ? seed.queries
        .filter((q) => q && (q.question ?? "").trim())
        .map((q) => ({
          question: q.question.trim(),
          contract_ref: (q.contractRef ?? "")?.toString().trim() || null,
        }))
    : [];
}

/**
 * Seed a draft RFI and return its id. Every entry point (inbox flag,
 * assistant card, manual page) routes through here, then deep-links to
 * /rfi?open={id}&ts={nonce}.
 *
 * Reference is per-project sequential (count + 1). Single-user tool, so the
 * theoretical race on concurrent creates is acceptable for now.
 */
export async function createRfiDraft(
  seed: RfiSeed,
): Promise<{ error?: string; id?: string }> {
  const { orgId, projectId, user } = await getSessionContext();
  const supabase = await createClient();

  const { count } = await supabase
    .from("rfis")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);

  const reference = `RFI-${String((count ?? 0) + 1).padStart(3, "0")}`;

  const { data, error } = await supabase
    .from("rfis")
    .insert({
      org_id: orgId,
      project_id: projectId,
      event_id: seed.eventId ?? null,
      evidence_id: seed.evidenceId ?? null,
      reference,
      status: "draft",
      recipient: (seed.recipient ?? "The Engineer").trim() || "The Engineer",
      subject: (seed.subject ?? "").trim() || null,
      background: (seed.background ?? "").trim() || null,
      queries: normalizeQueries(seed),
      contract_references: Array.isArray(seed.contractReferences)
        ? seed.contractReferences
        : [],
      ai_generated: !!seed.aiGenerated,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data)
    return { error: error?.message ?? "Could not create the RFI." };

  revalidatePath("/rfi");
  return { id: data.id };
}

/**
 * Patch an existing RFI from the dialog. Only whitelisted, camel-cased fields
 * are accepted and mapped to columns; queries are re-shaped to snake_case.
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
    row.queries = Array.isArray(patch.queries)
      ? patch.queries
          .filter((q) => q && (q.question ?? "").trim())
          .map((q) => ({
            question: q.question.trim(),
            contract_ref: (q.contractRef ?? "")?.toString().trim() || null,
          }))
      : [];
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
"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

const CLAIM_TYPES = [
  "variation_change", "delay_eot", "payment_dispute",
  "disruption", "acceleration", "backcharge",
];
const RELIEF = ["money", "time", "both"];

const norm = (v: string | null | undefined, allowed: string[]) => {
  const x = (v ?? "").toLowerCase().trim();
  return allowed.includes(x) ? x : null;
};

export async function createClaim(input: {
  title: string;
  kind?: "notice" | "detailed";
  type?: string | null;
  relief_sought?: string | null;
  amount?: number | null;
  time_days?: number | null;
  description?: string | null;
  body?: string | null;
  ai_generated?: boolean;
  primary_event_id?: string | null;
  event_ids?: string[]; // additional events linked as further evidence
}): Promise<{ error?: string; id?: string }> {
  const { orgId, projectId, user } = await getSessionContext();
  const supabase = await createClient();

  const title = (input.title ?? "").trim();
  if (!title) return { error: "Title is required." };

  const { data: claim, error } = await supabase
    .from("claims")
    .insert({
      org_id: orgId,
      project_id: projectId,
      title,
      kind: input.kind === "notice" ? "notice" : "detailed",
      type: norm(input.type, CLAIM_TYPES),
      relief_sought: norm(input.relief_sought, RELIEF),
      amount: input.amount,
      time_days: input.time_days ?? null,
      currency: "AED",
      description: (input.description ?? "").trim() || null,
      body: (input.body ?? "").trim() || null,
      ai_generated: !!input.ai_generated,
      status: "draft",
      primary_event_id: input.primary_event_id ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !claim)
    return { error: error?.message ?? "Could not save the claim." };

  // Link the primary event plus any additional evidence events (de-duped).
  const ids = Array.from(
    new Set(
      [
        ...(input.primary_event_id ? [input.primary_event_id] : []),
        ...(input.event_ids ?? []),
      ].filter(Boolean),
    ),
  );
  if (ids.length) {
    await supabase
      .from("claim_events")
      .insert(ids.map((event_id) => ({ claim_id: claim.id, event_id })));
  }

  revalidatePath("/claims");
  revalidatePath("/");
  return { id: claim.id };
}

export async function updateClaim(
  id: string,
  patch: {
    title?: string;
    type?: string | null;
    relief_sought?: string | null;
    amount?: number | null;
    time_days?: number | null;
    description?: string | null;
    body?: string | null;
  },
): Promise<{ error?: string }> {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();
  if (!id) return { error: "Missing claim id." };

  // Only drafts are editable — enforced here so a stale UI can't slip an edit past the lock.
  const { data: existing, error: readErr } = await supabase
    .from("claims")
    .select("status")
    .eq("id", id)
    .eq("project_id", projectId)
    .single();
  if (readErr || !existing) return { error: "Claim not found." };
  if (existing.status !== "draft")
    return { error: "This claim has been submitted and can no longer be edited." };

  const update: Record<string, any> = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { error: "Title is required." };
    update.title = t;
  }
  if (patch.type !== undefined) update.type = norm(patch.type, CLAIM_TYPES);
  if (patch.relief_sought !== undefined) update.relief_sought = norm(patch.relief_sought, RELIEF);
  if (patch.amount !== undefined) update.amount = patch.amount;
  if (patch.time_days !== undefined) update.time_days = patch.time_days;
  if (patch.description !== undefined) update.description = (patch.description ?? "").trim() || null;
  if (patch.body !== undefined) update.body = (patch.body ?? "").trim() || null;

  if (Object.keys(update).length === 0) return {};

  const { error } = await supabase
    .from("claims")
    .update(update)
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) return { error: error.message };

  revalidatePath("/claims");
  revalidatePath("/");
  return {};
}

export async function markClaimSubmitted(id: string): Promise<{ error?: string }> {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();
  if (!id) return { error: "Missing claim id." };

  const { error } = await supabase
    .from("claims")
    .update({ status: "submitted" })
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) return { error: error.message };

  revalidatePath("/claims");
  revalidatePath("/");
  return {};
}

export async function getClaimEventDates(
  eventId: string,
): Promise<{ notice_date: string | null; submission_date: string | null } | null> {
  await getSessionContext();
  const supabase = await createClient();
  if (!eventId) return null;
  // No project_id filter here, matching advanceEventStep's convention (RLS handles isolation).
  const { data } = await supabase
    .from("events")
    .select("notice_date, submission_date")
    .eq("id", eventId)
    .single();
  return data ?? null;
}
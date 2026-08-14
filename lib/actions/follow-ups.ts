"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

type FollowUpInput = {
  event_id: string;
  step_id: string;
  recipient?: string | null;
  subject?: string | null;
  key_points?: string | null;
  body?: string | null;
};

const clean = (v: string | null | undefined) => (v ?? "").trim() || null;

// Always inserts a fresh draft row. Multiple drafts per step are allowed now —
// the saved-follow-ups list is what disambiguates them, so there's no upsert.
export async function saveFollowUpDraft(
  input: FollowUpInput,
): Promise<{ error?: string; id?: string }> {
  const { orgId, projectId, user } = await getSessionContext();
  const supabase = await createClient();

  if (!input.event_id) return { error: "Missing event." };
  if (!input.step_id) return { error: "Missing step." };

  const { data: created, error } = await supabase
    .from("follow_ups")
    .insert({
      org_id: orgId,
      project_id: projectId,
      event_id: input.event_id,
      step_id: input.step_id,
      status: "draft",
      created_by: user.id,
      recipient: clean(input.recipient),
      subject: clean(input.subject),
      key_points: clean(input.key_points),
      body: clean(input.body),
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !created)
    return { error: error?.message ?? "Could not save the follow-up." };

  revalidatePath("/follow-ups");
  return { id: created.id };
}

// Edit a draft in place. Draft-only, server-enforced — a stale UI can't edit a sent chase.
export async function updateFollowUp(
  id: string,
  patch: {
    recipient?: string | null;
    subject?: string | null;
    key_points?: string | null;
    body?: string | null;
  },
): Promise<{ error?: string }> {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();
  if (!id) return { error: "Missing follow-up id." };

  const { data: existing, error: readErr } = await supabase
    .from("follow_ups")
    .select("status")
    .eq("id", id)
    .eq("project_id", projectId)
    .single();
  if (readErr || !existing) return { error: "Follow-up not found." };
  if (existing.status !== "draft")
    return { error: "This follow-up has been sent and can no longer be edited." };

  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (patch.recipient !== undefined) update.recipient = clean(patch.recipient);
  if (patch.subject !== undefined) update.subject = clean(patch.subject);
  if (patch.key_points !== undefined) update.key_points = clean(patch.key_points);
  if (patch.body !== undefined) update.body = clean(patch.body);

  const { error } = await supabase
    .from("follow_ups")
    .update(update)
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) return { error: error.message };

  revalidatePath("/follow-ups");
  return {};
}

// Flip a saved draft to 'sent'. Logged as history; a fresh draft can follow.
export async function markFollowUpSent(id: string): Promise<{ error?: string }> {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();
  if (!id) return { error: "Missing follow-up id." };

  const { error } = await supabase
    .from("follow_ups")
    .update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("project_id", projectId);
  if (error) return { error: error.message };

  revalidatePath("/follow-ups");
  return {};
}
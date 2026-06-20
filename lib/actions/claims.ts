"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

export async function createClaim(formData: FormData) {
  const { orgId, projectId, user } = await getSessionContext();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  const { data: claim, error } = await supabase
    .from("claims")
    .insert({
      org_id: orgId,
      project_id: projectId,
      title,
      type: String(formData.get("type") ?? "") || null,
      body: String(formData.get("body") ?? "").trim() || null,
      status: "draft",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !claim) return;

  const eventIds = formData.getAll("event_ids").map(String).filter(Boolean);
  if (eventIds.length) {
    await supabase.from("claim_events").insert(
      eventIds.map((event_id) => ({ claim_id: claim.id, event_id }))
    );
  }

  revalidatePath("/claims");
  revalidatePath("/");
}
"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

export async function createEvent(formData: FormData) {
  const { orgId, projectId, user } = await getSessionContext();
  const supabase = await createClient();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;

  await supabase.from("events").insert({
    org_id: orgId,
    project_id: projectId,
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    type: String(formData.get("type") ?? "other"),
    occurred_on: String(formData.get("occurred_on") ?? "") || null,
    created_by: user.id,
  });

  revalidatePath("/events");
  revalidatePath("/calendar");
  revalidatePath("/");
}
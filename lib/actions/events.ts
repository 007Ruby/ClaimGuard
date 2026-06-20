"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

function touch() {
  revalidatePath("/events"); revalidatePath("/inbox");
  revalidatePath("/calendar"); revalidatePath("/");
}

export async function createEvent(formData: FormData) {
  const { orgId, projectId, user } = await getSessionContext();
  const supabase = await createClient();
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  await supabase.from("events").insert({
    org_id: orgId, project_id: projectId, title,
    description: String(formData.get("description") ?? "").trim() || null,
    type: String(formData.get("type") ?? "other"),
    occurred_on: String(formData.get("occurred_on") ?? "") || null,
    created_by: user.id,
  });
  touch();
}

export async function updateEvent(formData: FormData) {
  await getSessionContext();
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!id || !title) return;
  await supabase.from("events").update({
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    type: String(formData.get("type") ?? "other"),
    occurred_on: String(formData.get("occurred_on") ?? "") || null,
  }).eq("id", id);
  touch();
}

export async function deleteEvent(id: string) {
  await getSessionContext();
  const supabase = await createClient();
  if (!id) return;
  // Linked inbox items return to the inbox rather than vanishing.
  await supabase.from("evidence").update({ status: "inbox", event_id: null }).eq("event_id", id);
  await supabase.from("events").delete().eq("id", id);
  touch();
}
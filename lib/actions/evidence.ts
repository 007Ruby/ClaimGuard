"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

function touch() {
  revalidatePath("/inbox"); revalidatePath("/events");
  revalidatePath("/calendar"); revalidatePath("/");
}

export async function createInboxItem(formData: FormData) {
  const { orgId, projectId, user } = await getSessionContext();
  const supabase = await createClient();
  const source = String(formData.get("source_type") ?? "note");
  const eventIdRaw = String(formData.get("event_id") ?? "");
  const eventId = eventIdRaw && eventIdRaw !== "none" ? eventIdRaw : null;

  // If the inbox form already uploaded the PDF (via /api/inbox/extract-pdf) it
  // sends file_path; use it as-is. Otherwise fall back to uploading the raw file.
  let filePath: string | null = String(formData.get("file_path") ?? "") || null;
  if (!filePath && source === "file") {
    const file = formData.get("file") as File | null;
    if (file && file.size > 0) {
      const path = `${projectId}/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("evidence").upload(path, file);
      if (!error) filePath = path;
    }
  }

  await supabase.from("evidence").insert({
    org_id: orgId, project_id: projectId, event_id: eventId,
    status: eventId ? "linked" : "inbox", source_type: source,
    title: String(formData.get("title") ?? "").trim() || null,
    content: String(formData.get("content") ?? "").trim() || null,
    event_date: String(formData.get("event_date") ?? "") || null,
    file_path: filePath, uploaded_by: user.id,
  });
  touch();
}

export async function updateInboxItem(formData: FormData) {
  await getSessionContext();
  const supabase = await createClient();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const eventIdRaw = String(formData.get("event_id") ?? "");
  const eventId = eventIdRaw && eventIdRaw !== "none" ? eventIdRaw : null;
  await supabase.from("evidence").update({
    source_type: String(formData.get("source_type") ?? "note"),
    title: String(formData.get("title") ?? "").trim() || null,
    content: String(formData.get("content") ?? "").trim() || null,
    event_date: String(formData.get("event_date") ?? "") || null,
    event_id: eventId, status: eventId ? "linked" : "inbox",
  }).eq("id", id);
  touch();
}

export async function deleteInboxItem(id: string) {
  await getSessionContext();
  const supabase = await createClient();
  if (!id) return;
  await supabase.from("evidence").delete().eq("id", id);
  touch();
}
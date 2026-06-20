"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

export async function createInboxItem(formData: FormData) {
  const { orgId, projectId, user } = await getSessionContext();
  const supabase = await createClient();

  const source = String(formData.get("source_type") ?? "note");
  const eventIdRaw = String(formData.get("event_id") ?? "");
  const eventId = eventIdRaw && eventIdRaw !== "none" ? eventIdRaw : null;

  let filePath: string | null = null;
  if (source === "file") {
    const file = formData.get("file") as File | null;
    if (file && file.size > 0) {
      const path = `${projectId}/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("evidence").upload(path, file);
      if (!error) filePath = path;
    }
  }

  await supabase.from("evidence").insert({
    org_id: orgId,
    project_id: projectId,
    event_id: eventId,
    status: eventId ? "linked" : "inbox",
    source_type: source,
    title: String(formData.get("title") ?? "").trim() || null,
    content: String(formData.get("content") ?? "").trim() || null,
    event_date: String(formData.get("event_date") ?? "") || null,
    file_path: filePath,
    uploaded_by: user.id,
  });

  revalidatePath("/inbox");
  revalidatePath("/events");
  revalidatePath("/calendar");
  revalidatePath("/");
}
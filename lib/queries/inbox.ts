import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

export async function listInboxItems() {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("evidence")
    .select("id, title, content, source_type, event_date, file_path, status, created_at, event:events(id, title)")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  return data ?? [];
}
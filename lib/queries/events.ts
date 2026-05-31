import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

export async function listEvents() {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();

  const { data } = await supabase
    .from("events")
    .select("id, title, type, status, occurred_on, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function getEvent(id: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single();

  return data;
}
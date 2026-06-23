import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

// Events for the list page, each with its linked inbox items.
export async function listEventsWithEvidence() {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, title, type, description, occurred_on, created_at, evidence(id, title, source_type)")
    .eq("project_id", projectId)
    .order("occurred_on", { ascending: false, nullsFirst: false });
  return data ?? [];
}

// Lightweight list for dropdowns / checkboxes.
export async function listEventsForSelect() {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("id, title, type, occurred_on")
    .eq("project_id", projectId)
    .order("occurred_on", { ascending: false, nullsFirst: false });
  return data ?? [];
}
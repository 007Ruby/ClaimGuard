import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

export async function listClaims() {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("claims")
    .select(
      "id, title, kind, type, status, relief_sought, amount, currency, description, body, created_at, primary_event_id, claim_events(event:events(id, title))",
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  return data ?? [];
}
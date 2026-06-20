import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

export async function getWhatsNext() {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();

  const { count: unlinkedInbox } = await supabase
    .from("evidence").select("id", { count: "exact", head: true })
    .eq("project_id", projectId).eq("status", "inbox");

  const { count: draftClaims } = await supabase
    .from("claims").select("id", { count: "exact", head: true })
    .eq("project_id", projectId).eq("status", "draft");

  const { data: events } = await supabase
    .from("events").select("id, evidence(id)").eq("project_id", projectId);
  const eventsNoEvidence = (events ?? []).filter((e: any) => (e.evidence?.length ?? 0) === 0).length;

  return { unlinkedInbox: unlinkedInbox ?? 0, draftClaims: draftClaims ?? 0, eventsNoEvidence };
}
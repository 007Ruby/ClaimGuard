"use server";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

export async function resolveSuggestion(id: string, accepted: boolean) {
  const { user } = await getSessionContext();
  const supabase = await createClient();
  if (!id) return;
  await supabase.from("ai_suggestions").update({
    status: accepted ? "accepted" : "dismissed",
    resolved_by: user.id, resolved_at: new Date().toISOString(),
  }).eq("id", id);
}
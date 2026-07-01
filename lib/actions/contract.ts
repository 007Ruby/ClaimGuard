"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

// Must match CONTRACT_TABLE in lib/fidic/get-obligations.ts.
// If you ran migration 0005, set both to "project_contracts".
const CONTRACT_TABLE = "project_contracts";

export async function saveContract(data: Record<string, any>) {
  const { orgId, projectId } = await getSessionContext();
  const supabase = await createClient();

  const row = {
    org_id: orgId,
    project_id: projectId,
    name: data.name || "Project contract",
    framework: data.framework || "FIDIC Red Book 1999",
    commencement_date: data.commencementDate || null,
    data,
  };

  // One contract per project: update if it exists, else insert.
  const { data: existing } = await supabase
    .from(CONTRACT_TABLE).select("id").eq("project_id", projectId).maybeSingle();
  if (existing) await supabase.from(CONTRACT_TABLE).update(row).eq("id", existing.id);
  else await supabase.from(CONTRACT_TABLE).insert(row);

  revalidatePath("/"); revalidatePath("/events"); revalidatePath("/settings/contract");
  return { ok: true as const };
}
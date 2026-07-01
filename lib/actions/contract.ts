"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

const CONTRACT_TABLE = "project_contracts";

type SaveResult = { ok: boolean; error?: string };

export async function saveContract(data: Record<string, any>): Promise<SaveResult> {
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

  const { data: existing } = await supabase
    .from(CONTRACT_TABLE).select("id").eq("project_id", projectId).maybeSingle();

  const { error } = existing
    ? await supabase.from(CONTRACT_TABLE).update(row).eq("id", existing.id)
    : await supabase.from(CONTRACT_TABLE).insert(row);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/"); revalidatePath("/events"); revalidatePath("/settings/contract");
  return { ok: true };
}
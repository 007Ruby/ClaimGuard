"use server";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { revalidatePath } from "next/cache";
import { EDITABLE_PERIODS } from "@/lib/fidic/clauses";

export async function saveContractPeriods(overrides: Record<string, number>) {
  const { projectId } = await getSessionContext();
  const supabase = await createClient(); // async — must await

  // Only known keys, positive integers.
  const clean: Record<string, number> = {};
  for (const p of EDITABLE_PERIODS) {
    const v = Number(overrides[p.key]);
    if (Number.isFinite(v) && v > 0) clean[p.key] = Math.round(v);
  }

  const { data: row, error: selErr } = await supabase
    .from("project_contracts")
    .select("id, data")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selErr) return { error: selErr.message };
  if (!row) return { error: "No contract found for this project." };

  const nextData = {
    ...(row.data ?? {}),
    dayOverrides: { ...(row.data?.dayOverrides ?? {}), ...clean },
  };

  const { error: updErr } = await supabase
    .from("project_contracts")
    .update({ data: nextData })
    .eq("id", row.id);

  if (updErr) return { error: updErr.message };

  revalidatePath("/settings"); // set to your actual settings route
  return { ok: true };
}


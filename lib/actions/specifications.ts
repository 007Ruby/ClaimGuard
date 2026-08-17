"use server";
import { getSessionContext } from "@/lib/queries/session";
import { createClient } from "@/lib/supabase/server";

type DocId = "contract" | "specification";

export async function setDocumentPriority(order: DocId[]) {
  try {
    const { projectId } = await getSessionContext();
    const supabase = await createClient();

    const { data: row, error: readErr } = await supabase
      .from("project_contracts")
      .select("data")
      .eq("project_id", projectId)
      .maybeSingle();

    if (readErr) {
      console.error("[setDocumentPriority] read failed:", readErr);
      return { error: readErr.message };
    }
    if (!row?.data) {
      return { error: "Upload a contract first before setting document priority." };
    }

    // Shallow-merge into existing data so dayOverrides et al. are untouched.
    const nextData = { ...(row.data as Record<string, any>), documentPriority: order };

    const { error: writeErr } = await supabase
      .from("project_contracts")
      .update({ data: nextData })
      .eq("project_id", projectId);

    if (writeErr) {
      console.error("[setDocumentPriority] write failed:", writeErr);
      return { error: writeErr.message };
    }
    return { ok: true };
  } catch (e: any) {
    console.error("[setDocumentPriority] failed:", e);
    return { error: e?.message ?? "Couldn't save priority." };
  }
}
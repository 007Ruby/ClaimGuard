import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { askJSON } from "@/lib/ai/run";
import { buildOutlinePrompt } from "@/lib/ai/claim-prompts";

export async function POST(req: Request) {
  const { description, claim_type, relief_sought, amount } = await req.json();
  if (!description || typeof description !== "string") {
    return NextResponse.json({ error: "Add a description first." }, { status: 400 });
  }

  const { projectId } = await getSessionContext();
  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events").select("id, title, type, occurred_on, description")
    .eq("project_id", projectId).order("occurred_on", { ascending: false, nullsFirst: false });

  try {
    const p = buildOutlinePrompt({ description, claim_type, relief_sought, amount }, events ?? []);
    const out = await askJSON(p.system, p.user);
    const validIds = new Set((events ?? []).map((e: any) => e.id));
    return NextResponse.json({
      relevant_event_ids: (Array.isArray(out.relevant_event_ids) ? out.relevant_event_ids : []).filter((id: string) => validIds.has(id)),
      key_points: (Array.isArray(out.key_points) ? out.key_points : []).filter((s: any) => typeof s === "string"),
    });
  } catch {
    return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  }
}
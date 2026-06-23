import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { askJSON } from "@/lib/ai/run";
import { buildClaimPrompt } from "@/lib/ai/claim-prompts";

export async function POST(req: Request) {
  const { title, claim_type, relief_sought, amount, description, event_ids, key_points } = await req.json();
  const { projectId } = await getSessionContext();
  const supabase = await createClient();

  const ids = Array.isArray(event_ids) && event_ids.length ? event_ids : ["00000000-0000-0000-0000-000000000000"];
  const { data: events } = await supabase
    .from("events").select("title, type, occurred_on, description")
    .eq("project_id", projectId).in("id", ids);

  try {
    const p = buildClaimPrompt(
      { title: title ?? "", claim_type, relief_sought, amount, description: description ?? "" },
      events ?? [],
      Array.isArray(key_points) ? key_points : []
    );
    const out = await askJSON(p.system, p.user);
    return NextResponse.json({ claim: typeof out.claim === "string" ? out.claim : "" });
  } catch {
    return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  }
}
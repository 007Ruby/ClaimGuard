import { NextResponse } from "next/server";
import { openai } from "@/lib/ai/client";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { buildExtractionPrompt } from "@/lib/ai/prompts";

export async function POST(req: Request) {
  const { source_type, content } = await req.json();
  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "No content" }, { status: 400 });
  }

  const { orgId, projectId } = await getSessionContext();
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("events").select("id, title, type, occurred_on")
    .eq("project_id", projectId).order("occurred_on", { ascending: false, nullsFirst: false });

  const prompt = buildExtractionPrompt(source_type, content, events ?? []);

  let suggestion: any;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    });
    suggestion = JSON.parse(completion.choices[0].message.content ?? "{}");
  } catch {
    return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  }

  // Persist for the audit trail (status defaults to 'pending').
  const { data: row } = await supabase.from("ai_suggestions").insert({
    org_id: orgId, project_id: projectId, type: "classify_document",
    payload: suggestion, confidence: suggestion?.confidence ?? null,
  }).select("id").single();

  return NextResponse.json({ suggestionId: row?.id ?? null, suggestion });
}
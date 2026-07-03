import { NextResponse } from "next/server";
import { openai } from "@/lib/ai/client";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

/**
 * POST /api/ai/followup/outline  ("Analyze with AI" for a chaser email)
 * Input:  { event_id, party, action_label, clause_ref, due_date, days }
 *   days: signed days remaining (negative = overdue)
 * Output: { subject, key_points[] }
 */
export async function POST(req: Request) {
  const body = await req.json();
  const eventId: string | undefined = body?.event_id;
  if (!eventId) {
    return NextResponse.json({ error: "No event selected" }, { status: 400 });
  }

  const { projectId } = await getSessionContext();
  const supabase = await createClient();

  const { data: ev } = await supabase
    .from("events")
    .select("id, title, type, occurred_on")
    .eq("id", eventId)
    .eq("project_id", projectId)
    .single();
  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data: evidence } = await supabase
    .from("evidence")
    .select("content, source_type")
    .eq("event_id", eventId);
  const evidenceText = (evidence ?? [])
    .map((e: any, i: number) => `[${i + 1}] (${e.source_type ?? "note"}) ${(e.content ?? "").trim()}`)
    .filter((s) => s.length > 8)
    .join("\n\n")
    .slice(0, 6000);

  const party = body?.party === "employer" ? "Employer" : "Engineer";
  const days = typeof body?.days === "number" ? body.days : null;
  const dueLine = body?.due_date
    ? `Due on ${body.due_date}.${days == null ? "" : days < 0 ? ` Overdue by ${Math.abs(days)} days.` : ` Not yet overdue (due in ${days} days).`}`
    : "";

  const system = [
    `You help a subcontractor prepare a polite but firm follow-up email chasing the ${party} for an outstanding action they owe under the FIDIC Conditions of Contract for Construction (Red Book, 1999).`,
    'Return ONLY a JSON object — no markdown, no preamble: {"subject": string, "key_points": string[]}.',
    "subject: a concise, professional email subject. key_points: 3–5 short bullets covering what is outstanding, the sub-clause, when it was due, and the specific request / next step.",
    "Never invent amounts, dates or durations beyond those given; use [INSERT …] placeholders where a specific is missing.",
  ].join("\n");

  const user = [
    `OUTSTANDING ACTION: ${body?.action_label ?? "outstanding item"}`,
    body?.clause_ref ? `SUB-CLAUSE: SC ${body.clause_ref}` : "",
    dueLine,
    `RESPONSIBLE PARTY: ${party}`,
    `EVENT: ${ev.title ?? "(untitled)"} · ${ev.type ?? ""}${ev.occurred_on ? ` · ${ev.occurred_on}` : ""}`,
    "",
    "LINKED EVIDENCE (inbox items):",
    evidenceText || "(none linked)",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const out = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
    return NextResponse.json({
      subject: typeof out.subject === "string" ? out.subject : "",
      key_points: Array.isArray(out.key_points)
        ? out.key_points.filter(Boolean).map(String)
        : [],
    });
  } catch {
    return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  }
}
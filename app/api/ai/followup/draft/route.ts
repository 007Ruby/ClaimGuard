import { NextResponse } from "next/server";
import { openai } from "@/lib/ai/client";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

/**
 * POST /api/ai/followup/draft
 * Input:  { event_id, party, recipient, action_label, clause_ref, due_date,
 *           days, subject, key_points[] }
 * Output: { email }  (plain text, begins with a Subject: line)
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
  const recipient = (body?.recipient ?? "").toString().trim() || `[${party}]`;
  const points: string[] = Array.isArray(body?.key_points) ? body.key_points : [];
  const days = typeof body?.days === "number" ? body.days : null;
  const dueLine = body?.due_date
    ? `Due on ${body.due_date}.${days == null ? "" : days < 0 ? ` Overdue by ${Math.abs(days)} days.` : ` Not yet overdue (due in ${days} days).`}`
    : "";

  const system = [
    `Draft a complete, professional follow-up email from a subcontractor chasing the ${party} for an outstanding action under the FIDIC Conditions of Contract for Construction (Red Book, 1999).`,
    "Formal UK English, polite but firm. Reference the sub-clause and the due date, state the outstanding item plainly, and request it with a reasonable next step.",
    `Address it to ${recipient}. Begin the output with a "Subject:" line. Output only the email text — no preamble, no markdown, no code fences.`,
    "Never invent amounts, dates or durations; use [INSERT …] placeholders for missing specifics and a [Contractor] signature placeholder at the end.",
  ].join("\n");

  const user = [
    body?.subject ? `SUGGESTED SUBJECT: ${body.subject}` : "",
    `OUTSTANDING ACTION: ${body?.action_label ?? ""}`,
    body?.clause_ref ? `SUB-CLAUSE: SC ${body.clause_ref}` : "",
    dueLine,
    points.length ? `KEY POINTS TO COVER:\n- ${points.join("\n- ")}` : "",
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
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return NextResponse.json({
      email: completion.choices[0]?.message?.content ?? "",
    });
  } catch {
    return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  }
}
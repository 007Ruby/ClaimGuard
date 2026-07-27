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
  const nominal = body?.nominal === true;
  const remedies: Array<{ clause?: string; text?: string }> =
    Array.isArray(body?.remedies) ? body.remedies : [];
  const outstanding = typeof body?.outstanding === "number" ? body.outstanding : null;
  const dueLine = body?.due_date
    ? nominal
      ? `Indicative response date ${body.due_date}.${
          days == null || days >= 0
            ? ""
            : ` ${Math.abs(days)} days have elapsed. FIDIC fixes no period for this step — do NOT describe it as overdue, late or a breach. Chase it as a courtesy.`
        }`
      : `Due on ${body.due_date}.${
          days == null ? "" : days < 0 ? ` Overdue by ${Math.abs(days)} days.` : ` Not yet overdue (due in ${days} days).`
        }`
    : "";

  const system = [
    `Draft a complete, professional follow-up email from a subcontractor chasing the ${party} for an outstanding action under the FIDIC Conditions of Contract for Construction (Red Book, 1999).`,
    "Formal UK English, polite but firm. Reference the sub-clause and the due date, state the outstanding item plainly, and request it with a reasonable next step.",
    `Address it to ${recipient}. Begin the output with a "Subject:" line. Output only the email text — no preamble, no markdown, no code fences.`,
    "Never invent amounts, dates or durations; use [INSERT …] placeholders for missing specifics and a [Contractor] signature placeholder at the end.",
    "Where remedies are listed, reserve them: state that the entitlement exists and rights are reserved. Never issue an ultimatum, never state a suspension date unless one is given to you.",
    "Never state, estimate or calculate a financing charge rate or interest figure. Write the rate as [INSERT rate, e.g. EIBOR + 3%] and leave the calculation to the user.",
    "If a remedy is described as premature or invalid, do NOT assert that right in the email. Say nothing about it.",
  ].join("\n");

  const remedyLines = remedies.length
    ? `CONTRACTUAL REMEDIES NOW AVAILABLE (reserve them in measured terms; do not threaten):\n- ${remedies
        .map((r) => `SC ${r.clause}: ${r.text}`)
        .join("\n- ")}`
    : "";
  const outstandingLine =
    outstanding != null && outstanding > 0
      ? `OUTSTANDING CERTIFIED SUM: ${outstanding.toLocaleString("en-GB")} — quote this figure as given; do not recalculate it.`
      : ""; 
  const user = [
    body?.subject ? `SUGGESTED SUBJECT: ${body.subject}` : "",
    `OUTSTANDING ACTION: ${body?.action_label ?? ""}`,
    body?.clause_ref ? `SUB-CLAUSE: SC ${body.clause_ref}` : "",
    dueLine,
    outstandingLine,
    remedyLines,
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
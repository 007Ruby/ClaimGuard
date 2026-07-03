import { NextResponse } from "next/server";
import { openai } from "@/lib/ai/client";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { CATEGORY_ROUTES, CLAUSES } from "@/lib/fidic/clauses";

/**
 * POST /api/ai/claim/generate
 * ---------------------------------------------------------------------------
 * mode = "notice"   → a short SC 20.1 reserving-rights notice
 * mode = "detailed" → full detailed particulars
 * mode = "both"     → ONE cohesive document: the notice, then the particulars
 *
 * Grounds the output in (a) the primary event + any linked evidence, and
 * (b) the FIDIC clauses that map to the event's category. Never invents
 * quantum — figures that aren't provided become [INSERT …] placeholders.
 * Returns { claim } (prose), matching the existing draft route's shape.
 * ---------------------------------------------------------------------------
 */

type Mode = "notice" | "detailed" | "both";

function normalize(raw: string | null | undefined): string {
  return (raw ?? "").toString().trim().toLowerCase().replace(/\s+/g, "_");
}

export async function POST(req: Request) {
  const body = await req.json();
  const mode: Mode = body?.mode;
  if (!["notice", "detailed", "both"].includes(mode)) {
    return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  }
  const primaryEventId: string | undefined = body?.primary_event_id;
  if (!primaryEventId) {
    return NextResponse.json({ error: "No event selected" }, { status: 400 });
  }

  const { projectId } = await getSessionContext();
  const supabase = await createClient();

  // Primary event.
  const { data: ev } = await supabase
    .from("events")
    .select("id, title, type, occurred_on")
    .eq("id", primaryEventId)
    .eq("project_id", projectId)
    .single();
  if (!ev) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Linked evidence (inbox items) for the primary + any extra evidence events.
  const eventIds = [primaryEventId, ...(body?.extra_event_ids ?? [])].filter(
    Boolean,
  );
  const { data: evidence } = await supabase
    .from("evidence")
    .select("content, source_type, event_id")
    .in("event_id", eventIds);

  const evidenceText = (evidence ?? [])
    .map(
      (e: any, i: number) =>
        `[${i + 1}] (${e.source_type ?? "note"}) ${(e.content ?? "").trim()}`,
    )
    .filter((s) => s.length > 8)
    .join("\n\n")
    .slice(0, 8000);

  // Clauses that map to this event's category.
  const route = CATEGORY_ROUTES[normalize(ev.type)];
  const clauseRefs = route
    ? [route.procedureClause, ...route.basisClauses]
    : ["20.1"];
  const clauseText = Array.from(new Set(clauseRefs))
    .map((r) => {
      const c = CLAUSES[r];
      return c ? `SC ${r} — ${c.title}` : `SC ${r}`;
    })
    .join("\n");

  const keyPoints: string[] = Array.isArray(body?.key_points)
    ? body.key_points
    : [];
  const amount =
    typeof body?.amount === "number" && !Number.isNaN(body.amount)
      ? body.amount
      : null;

  const { system, user } = buildPrompt(mode, {
    eventTitle: ev.title ?? "(untitled event)",
    eventType: ev.type ?? "",
    occurredOn: ev.occurred_on ?? "",
    claimType: body?.claim_type ?? "",
    relief: body?.relief_sought ?? "",
    amount,
    description: (body?.description ?? "").toString().trim(),
    keyPoints,
    clauseText,
    evidenceText,
  });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    return NextResponse.json({
      claim: completion.choices[0]?.message?.content ?? "",
    });
  } catch {
    return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  }
}

// ---------------------------------------------------------------------------

const QUANTUM_RULE =
  "Never invent amounts, durations, dates or quantum of any kind. Use ONLY figures explicitly provided. Wherever a figure is required but not provided, insert a bracketed placeholder such as [INSERT amount], [INSERT number of days] or [INSERT date] for the user to complete. Do not soften or omit the placeholders.";

const GROUNDING =
  "You are assisting a subcontractor operating under the FIDIC Conditions of Contract for Construction (Red Book, 1999). Write in formal UK contractual English. Cite sub-clauses in the form 'Sub-Clause 20.1'. Output only the document text with no preamble, explanation or markdown code fences.";

function buildPrompt(
  mode: Mode,
  ctx: {
    eventTitle: string;
    eventType: string;
    occurredOn: string;
    claimType: string;
    relief: string;
    amount: number | null;
    description: string;
    keyPoints: string[];
    clauseText: string;
    evidenceText: string;
  },
) {
  const instruction =
    mode === "notice"
      ? [
          "Draft a concise NOTICE OF CLAIM under Sub-Clause 20.1.",
          "It is a short reserving-rights notification, NOT full particulars.",
          "It must: identify the event and the date the Contractor became aware of it; state that the Contractor gives notice of a claim; cite the relevant sub-clause(s); and reserve the right to submit detailed particulars in due course.",
          "Keep it to a few short paragraphs.",
        ].join(" ")
      : mode === "detailed"
        ? [
            "Draft the full DETAILED PARTICULARS OF CLAIM under Sub-Clause 20.1.",
            "Structure it clearly with headed sections: (1) The Event; (2) Contractual Basis / Entitlement (grounded in the clauses below); (3) Cause and Effect; (4) Relief Sought (time and/or money as indicated); (5) Supporting Evidence (reference the linked items).",
          ].join(" ")
        : [
            "Produce ONE cohesive document that contains BOTH parts, in this order:",
            "PART A — NOTICE OF CLAIM: a concise reserving-rights notice under Sub-Clause 20.1.",
            "PART B — DETAILED PARTICULARS OF CLAIM: the full particulars, with headed sections for The Event, Contractual Basis / Entitlement, Cause and Effect, Relief Sought, and Supporting Evidence.",
            "Use a clear heading for each part so the single document reads as a complete notice-and-particulars submission.",
          ].join(" ");

  const system = [GROUNDING, instruction, QUANTUM_RULE].join("\n\n");

  const user = [
    `EVENT: ${ctx.eventTitle}`,
    ctx.eventType ? `CATEGORY: ${ctx.eventType}` : "",
    ctx.occurredOn ? `DATE OF EVENT / AWARENESS: ${ctx.occurredOn}` : "",
    ctx.claimType ? `CLAIM TYPE: ${ctx.claimType}` : "",
    ctx.relief ? `RELIEF SOUGHT: ${ctx.relief}` : "",
    `AMOUNT PROVIDED: ${ctx.amount != null ? `AED ${ctx.amount}` : "not provided — use a placeholder"}`,
    "",
    "RELEVANT CLAUSES:",
    ctx.clauseText || "SC 20.1",
    "",
    "DESCRIPTION (from the user):",
    ctx.description || "(none provided)",
    "",
    ctx.keyPoints.length
      ? `KEY POINTS TO COVER:\n- ${ctx.keyPoints.join("\n- ")}`
      : "",
    "",
    "LINKED EVIDENCE (inbox items — reference these, do not fabricate others):",
    ctx.evidenceText || "(none linked)",
  ]
    .filter((l) => l !== "")
    .join("\n");

  return { system, user };
}
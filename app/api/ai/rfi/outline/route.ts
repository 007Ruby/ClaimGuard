import { NextResponse } from "next/server";
import { openai } from "@/lib/ai/client";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { CATEGORY_ROUTES, CLAUSES } from "@/lib/fidic/clauses";
import { RFI_GROUNDING } from "@/lib/rfi/grounding";

/**
 * POST /api/ai/rfi/outline   (event-anchored "Analyze with AI")
 * ---------------------------------------------------------------------------
 * Input:  { event_id, evidence_id? }
 * Reads the event + its linked evidence + the FIDIC clauses mapped to its
 * category, and infers the RFI's framing so the builder form fills in.
 *
 * Output: { subject, background, queries[{question, contract_ref}],
 *           contract_references[] }
 *
 * Same chain used by all three entry points once an event is known. Never
 * invents facts — unknown specifics become bracketed placeholders.
 * ---------------------------------------------------------------------------
 */

function normalize(raw: string | null | undefined): string {
  return (raw ?? "").toString().trim().toLowerCase().replace(/\s+/g, "_");
}

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
    .select("id, title, type, occurred_on, description")
    .eq("id", eventId)
    .eq("project_id", projectId)
    .single();
  if (!ev) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const { data: evidence } = await supabase
    .from("evidence")
    .select("content, source_type, event_id")
    .eq("event_id", eventId);
  const evidenceText = (evidence ?? [])
    .map(
      (e: any, i: number) =>
        `[${i + 1}] (${e.source_type ?? "note"}) ${(e.content ?? "").trim()}`,
    )
    .filter((s) => s.length > 8)
    .join("\n\n")
    .slice(0, 8000);

  // Clauses that map to the event's category (used only to hint at refs).
  const route = CATEGORY_ROUTES[normalize(ev.type)];
  const clauseRefs = route
    ? [route.procedureClause, ...route.basisClauses]
    : ["1.9"];
  const clauseText = Array.from(new Set(clauseRefs))
    .map((r) => {
      const c = CLAUSES[r];
      return c ? `SC ${r} — ${c.title}` : `SC ${r}`;
    })
    .join("\n");

  const system = [
    "You are assisting a subcontractor under the FIDIC Conditions of Contract for Construction (Red Book, 1999) to prepare a Request for Further Information (RFI) arising from a site event and its evidence.",
    RFI_GROUNDING,
    "From the event and its evidence, identify the specific points that are unclear, missing, contradictory, or that require a decision from the Engineer, and turn each into a precise query.",
    "Respond with ONLY a JSON object — no markdown, no code fences, no preamble — with exactly these fields:",
    `{"subject": string, "background": string, "queries": [{"question": string, "contract_ref": string | null}], "contract_references": string[]}`,
    "subject: a short, specific RFI subject line. background: 1–3 sentences setting the context the recipient needs. queries: 1–6 distinct, precisely-worded questions; set contract_ref to the most relevant sub-clause (e.g. \"1.9\") only where one genuinely applies, otherwise null. contract_references: the distinct sub-clauses cited across the queries.",
    "Do not invent drawing numbers, dates, amounts or facts. Where a specific reference is needed but not present in the evidence, write a bracketed placeholder such as [INSERT drawing reference] inside the question.",
  ].join("\n\n");

  const user = [
    `EVENT: ${ev.title ?? "(untitled)"} · ${ev.type ?? ""}${ev.occurred_on ? ` · ${ev.occurred_on}` : ""}`,
    ev.description ? `EVENT DESCRIPTION: ${ev.description}` : "",
    "",
    "CLAUSES MAPPED TO THIS CATEGORY (hints — cite only where they truly apply):",
    clauseText,
    "",
    "LINKED EVIDENCE (inbox items):",
    evidenceText || "(none linked)",
  ]
    .filter((l) => l !== "")
    .join("\n");

  let out: any;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    out = JSON.parse(completion.choices[0]?.message?.content ?? "{}");
  } catch {
    return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  }

  const queries = Array.isArray(out.queries)
    ? out.queries
        .map((q: any) => ({
          question: typeof q?.question === "string" ? q.question : "",
          contract_ref:
            typeof q?.contract_ref === "string" && q.contract_ref.trim()
              ? q.contract_ref.trim()
              : null,
        }))
        .filter((q: any) => q.question.trim())
    : [];

  const contract_references = Array.isArray(out.contract_references)
    ? out.contract_references.filter(Boolean).map(String)
    : [];

  return NextResponse.json({
    subject: typeof out.subject === "string" ? out.subject : "",
    background: typeof out.background === "string" ? out.background : "",
    queries,
    contract_references,
  });
}
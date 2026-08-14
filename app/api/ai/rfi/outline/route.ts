import { NextResponse } from "next/server";
import { openai } from "@/lib/ai/client";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { CATEGORY_ROUTES, CLAUSES } from "@/lib/fidic/clauses";
import { RFI_GROUNDING } from "@/lib/rfi/grounding";

/**
 * POST /api/ai/rfi/outline   ("Analyze with AI")
 * ---------------------------------------------------------------------------
 * Input:  { event_id?, evidence_id? }  — at least one required.
 * Anchors on whichever is given (inbox-launched RFIs pass evidence_id, often
 * with no event). An inbox item may itself supply the event; if neither an
 * event nor any evidence text is available, there's nothing to analyze.
 *
 * Output: { subject, background, queries[{question, contract_ref}],
 *           contract_references[] }
 *
 * Never invents facts — unknown specifics become bracketed placeholders.
 * ---------------------------------------------------------------------------
 */

function normalize(raw: string | null | undefined): string {
  return (raw ?? "").toString().trim().toLowerCase().replace(/\s+/g, "_");
}

export async function POST(req: Request) {
  const body = await req.json();
  const eventIdInput: string | null = body?.event_id || null;
  const evidenceIdInput: string | null = body?.evidence_id || null;

  if (!eventIdInput && !evidenceIdInput) {
    return NextResponse.json(
      { error: "Select an inbox item or an event to analyze." },
      { status: 400 },
    );
  }

  const { projectId } = await getSessionContext();
  const supabase = await createClient();

  // Anchor inbox item (evidence), when the RFI was launched from one. It can
  // also supply the event if the user didn't pick one.
  let anchor:
    | {
        title: string | null;
        content: string | null;
        source_type: string | null;
        event_id: string | null;
        ai_notes: string | null;
        suggested_query: string | null;
      }
    | null = null;
  if (evidenceIdInput) {
    const { data } = await supabase
      .from("evidence")
      .select("title, content, source_type, event_id, ai_notes, suggested_query")
      .eq("id", evidenceIdInput)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!data) {
      return NextResponse.json({ error: "Inbox item not found" }, { status: 404 });
    }
    anchor = data as any;
  }

  const eventId = eventIdInput ?? anchor?.event_id ?? null;

  let ev:
    | { id: string; title: string | null; type: string | null; occurred_on: string | null; description: string | null }
    | null = null;
  if (eventId) {
    const { data } = await supabase
      .from("events")
      .select("id, title, type, occurred_on, description")
      .eq("id", eventId)
      .eq("project_id", projectId)
      .single();
    // Only a hard error if the user explicitly chose an event that's missing;
    // an event merely inherited from the inbox item is optional context.
    if (!data && eventIdInput) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    ev = (data as any) ?? null;
  }

  // Evidence context: the anchor item if we have one, otherwise all evidence
  // linked to the event.
  let evidenceText = "";
  if (anchor) {
    evidenceText = [
      `(${anchor.source_type ?? "note"}) ${anchor.title ? `${anchor.title} — ` : ""}${(anchor.content ?? "").trim()}`,
      anchor.ai_notes ? `Contract analysis: ${anchor.ai_notes}` : "",
      anchor.suggested_query ? `Suggested queries:\n${anchor.suggested_query}` : "",
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, 8000);
  } else if (eventId) {
    const { data: evidence } = await supabase
      .from("evidence")
      .select("content, source_type")
      .eq("event_id", eventId);
    evidenceText = (evidence ?? [])
      .map((e: any, i: number) => `[${i + 1}] (${e.source_type ?? "note"}) ${(e.content ?? "").trim()}`)
      .filter((s) => s.length > 8)
      .join("\n\n")
      .slice(0, 8000);
  }

  if (!ev && !evidenceText) {
    return NextResponse.json(
      { error: "Nothing to analyze yet — add content to the inbox item or link an event." },
      { status: 400 },
    );
  }

  // Clauses mapped to the event's category (hints only). No event → default the
  // RFI's home clause, SC 1.9.
  const route = ev ? CATEGORY_ROUTES[normalize(ev.type)] : null;
  const clauseRefs = route ? [route.procedureClause, ...route.basisClauses] : ["1.9"];
  const clauseText = Array.from(new Set(clauseRefs))
    .map((r) => {
      const c = CLAUSES[r];
      return c ? `SC ${r} — ${c.title}` : `SC ${r}`;
    })
    .join("\n");

  const system = [
    "You are assisting a subcontractor under the FIDIC Conditions of Contract for Construction (Red Book, 1999) to prepare a Request for Further Information (RFI) arising from a site event and/or an inbox item and its evidence.",
    RFI_GROUNDING,
    "From the event and/or the inbox item, identify the specific points that are unclear, missing, contradictory, or that require a decision from the Engineer, and turn each into a precise query.",
    "Respond with ONLY a JSON object — no markdown, no code fences, no preamble — with exactly these fields:",
    `{"subject": string, "background": string, "queries": [{"question": string, "contract_ref": string | null}], "contract_references": string[]}`,
    'subject: a short, specific RFI subject line. background: 1–3 sentences setting the context the recipient needs. queries: 1–6 distinct, precisely-worded questions; set contract_ref to the most relevant sub-clause (e.g. "1.9") only where one genuinely applies, otherwise null. contract_references: the distinct sub-clauses cited across the queries.',
    "Do not invent drawing numbers, dates, amounts or facts. Where a specific reference is needed but not present in the source, write a bracketed placeholder such as [INSERT drawing reference] inside the question.",
  ].join("\n\n");

  const user = [
    ev
      ? `EVENT: ${ev.title ?? "(untitled)"} · ${ev.type ?? ""}${ev.occurred_on ? ` · ${ev.occurred_on}` : ""}`
      : "EVENT: (no event linked — analyze from the inbox item below)",
    ev?.description ? `EVENT DESCRIPTION: ${ev.description}` : "",
    "",
    "CLAUSES MAPPED TO THIS CATEGORY (hints — cite only where they truly apply):",
    clauseText,
    "",
    anchor ? "INBOX ITEM (the subject of this RFI):" : "LINKED EVIDENCE (inbox items):",
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
  } catch (e) {
    console.error("[ai/rfi/outline] failed:", e);
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
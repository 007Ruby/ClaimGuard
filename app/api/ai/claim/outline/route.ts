import { NextResponse } from "next/server";
import { openai } from "@/lib/ai/client";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { CATEGORY_ROUTES, CLAUSES } from "@/lib/fidic/clauses";

/**
 * POST /api/ai/claim/outline   (event-anchored "Analyze with AI")
 * ---------------------------------------------------------------------------
 * Input:  { event_id, extra_event_ids? }
 * The event alone is enough. Reads the primary event + its linked inbox
 * evidence + the FIDIC clauses that map to its category, and infers the claim's
 * framing so the builder form fills in. Also suggests OTHER related events to
 * link as further evidence.
 *
 * Output: { title, claim_type, relief_sought, description, key_points[],
 *           relevant_event_ids[] }
 *
 * This is the single chain behind both entry points: the "Analyze with AI"
 * button and the "Action" deep-link from What's Next both land here with an
 * event_id. Never invents quantum.
 * ---------------------------------------------------------------------------
 */

const CLAIM_TYPES = [
  "variation_change", "delay_eot", "payment_dispute",
  "disruption", "acceleration", "backcharge",
];
const RELIEF = ["money", "time", "both"];

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

  const [{ data: primary }, { data: allEvents }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, type, occurred_on")
      .eq("id", eventId)
      .eq("project_id", projectId)
      .single(),
    supabase
      .from("events")
      .select("id, title, type, occurred_on")
      .eq("project_id", projectId)
      .order("occurred_on", { ascending: false, nullsFirst: false }),
  ]);
  if (!primary) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  // Evidence for the primary (+ any already-linked extras).
  const evIds = [eventId, ...(body?.extra_event_ids ?? [])].filter(Boolean);
  const { data: evidence } = await supabase
    .from("evidence")
    .select("content, source_type, event_id")
    .in("event_id", evIds);
  const evidenceText = (evidence ?? [])
    .map(
      (e: any, i: number) =>
        `[${i + 1}] (${e.source_type ?? "note"}) ${(e.content ?? "").trim()}`,
    )
    .filter((s) => s.length > 8)
    .join("\n\n")
    .slice(0, 8000);

  // Other events, offered to the model to link as further evidence.
  const others = (allEvents ?? []).filter((e: any) => e.id !== eventId);
  const othersText = others
    .map(
      (e: any) =>
        `${e.id} :: ${e.title ?? "(untitled)"} · ${e.type ?? ""}${e.occurred_on ? ` · ${e.occurred_on}` : ""}`,
    )
    .join("\n");

  // Clauses mapped to the primary event's category.
  const route = CATEGORY_ROUTES[normalize(primary.type)];
  const clauseRefs = route
    ? [route.procedureClause, ...route.basisClauses]
    : ["20.1"];
  const clauseText = Array.from(new Set(clauseRefs))
    .map((r) => {
      const c = CLAUSES[r];
      return c ? `SC ${r} — ${c.title}` : `SC ${r}`;
    })
    .join("\n");

  const system = [
    "You are assisting a subcontractor under the FIDIC Conditions of Contract for Construction (Red Book, 1999) to prepare a claim from a single site event.",
    "From the event and its linked evidence, infer the claim's framing. Respond with ONLY a JSON object — no markdown, no code fences, no preamble — with exactly these fields:",
    `{"title": string, "claim_type": one of [${CLAIM_TYPES.join(", ")}], "relief_sought": one of [${RELIEF.join(", ")}], "description": string, "key_points": string[], "relevant_event_ids": string[]}`,
    "title: a short, specific claim title. description: 1–3 sentences on what the claim is about. key_points: the spine of the argument as 3–6 short bullets. relevant_event_ids: ids taken ONLY from the OTHER EVENTS list that relate to the same matter and should be linked as further evidence — may be empty, and must never include the primary event's id.",
    "Never invent amounts, durations or dates. Do not place quantum figures in key_points unless they actually appear in the evidence.",
  ].join("\n");

  const user = [
    `PRIMARY EVENT: ${primary.title ?? "(untitled)"} · ${primary.type ?? ""}${primary.occurred_on ? ` · ${primary.occurred_on}` : ""}`,
    "",
    "RELEVANT CLAUSES:",
    clauseText,
    "",
    "LINKED EVIDENCE (inbox items):",
    evidenceText || "(none linked)",
    "",
    "OTHER EVENTS (id :: title · type · date) — pick any that relate:",
    othersText || "(none)",
  ].join("\n");

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

  // Sanitise the model output against known-good values.
  const validIds = new Set(others.map((e: any) => e.id));
  const claim_type = CLAIM_TYPES.includes(normalize(out.claim_type))
    ? normalize(out.claim_type)
    : null;
  const relief_sought = RELIEF.includes((out.relief_sought ?? "").toLowerCase())
    ? (out.relief_sought as string).toLowerCase()
    : null;
  const relevant_event_ids = Array.isArray(out.relevant_event_ids)
    ? out.relevant_event_ids.filter((id: string) => validIds.has(id))
    : [];
  const key_points = Array.isArray(out.key_points)
    ? out.key_points.filter(Boolean).map(String)
    : [];

  return NextResponse.json({
    title: typeof out.title === "string" ? out.title : "",
    claim_type,
    relief_sought,
    description: typeof out.description === "string" ? out.description : "",
    key_points,
    relevant_event_ids,
  });
}
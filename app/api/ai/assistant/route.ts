import { NextResponse } from "next/server";
import { openai } from "@/lib/ai/client";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { CATEGORY_ROUTES, CLAUSES } from "@/lib/fidic/clauses";
import { RFI_GROUNDING } from "@/lib/rfi/grounding";

/**
 * POST /api/ai/assistant   (context-scoped side panel)
 * ---------------------------------------------------------------------------
 * A normal chat, scoped to ONE surface's context (no global retrieval):
 *   - events page  → the open event + its evidence
 *   - inbox item   → that evidence item + its parent event (+ siblings)
 *   - claims page  → the claim's primary event + that event's evidence
 *   - rfi page     → the RFI's event + that event's evidence
 *
 * The model answers clarifying questions, and — when it judges an RFI is
 * warranted — appends a single delimited block:
 *     <<<RFI_SUGGESTION>>>{ ...RfiSeed-shaped JSON... }<<<END>>>
 * We parse and strip that here, returning { reply, suggestion }. Functionally
 * the same delimited-block pattern you use elsewhere, just resolved on the
 * server so the client only has to check `suggestion`.
 *
 * Input:
 *   { messages: {role:"user"|"assistant", content:string}[],
 *     context: { surface: "event"|"inbox"|"claim"|"rfi",
 *                event_id?, evidence_id?, claim_id?, rfi_id? } }
 * Output: { reply: string, suggestion: RfiSeed | null }
 * ---------------------------------------------------------------------------
 */

const SUGGESTION_OPEN = "<<<RFI_SUGGESTION>>>";
const SUGGESTION_CLOSE = "<<<END>>>";

function normalize(raw: string | null | undefined): string {
  return (raw ?? "").toString().trim().toLowerCase().replace(/\s+/g, "_");
}

async function resolveEventId(
  supabase: any,
  projectId: string,
  ctx: any,
): Promise<string | null> {
  if (ctx?.event_id) return ctx.event_id;
  if (ctx?.evidence_id) {
    const { data } = await supabase
      .from("evidence")
      .select("event_id")
      .eq("id", ctx.evidence_id)
      .single();
    return data?.event_id ?? null;
  }
  if (ctx?.claim_id) {
    const { data } = await supabase
      .from("claims")
      .select("primary_event_id")
      .eq("id", ctx.claim_id)
      .eq("project_id", projectId)
      .single();
    return data?.primary_event_id ?? null;
  }
  if (ctx?.rfi_id) {
    const { data } = await supabase
      .from("rfis")
      .select("event_id")
      .eq("id", ctx.rfi_id)
      .eq("project_id", projectId)
      .single();
    return data?.event_id ?? null;
  }
  return null;
}

export async function POST(req: Request) {
  const body = await req.json();
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const ctx = body?.context ?? {};

  const { projectId } = await getSessionContext();
  const supabase = await createClient();

  const eventId = await resolveEventId(supabase, projectId, ctx);

  // Assemble the scoped context text.
  let contextBlock = "No specific event is in focus on this screen.";
  let clauseHint = "";
  if (eventId) {
    const { data: ev } = await supabase
      .from("events")
      .select("title, type, occurred_on, description")
      .eq("id", eventId)
      .eq("project_id", projectId)
      .single();

    const { data: evidence } = await supabase
      .from("evidence")
      .select("content, source_type")
      .eq("event_id", eventId);

    if (ev) {
      const route = CATEGORY_ROUTES[normalize(ev.type)];
      const clauseRefs = route
        ? [route.procedureClause, ...route.basisClauses]
        : ["1.9"];
      clauseHint = Array.from(new Set(clauseRefs))
        .map((r) => (CLAUSES[r] ? `SC ${r} — ${CLAUSES[r].title}` : `SC ${r}`))
        .join(", ");

      const evidenceText =
        (evidence ?? [])
          .map(
            (e: any, i: number) =>
              `  [${i + 1}] (${e.source_type ?? "note"}) ${(e.content ?? "").trim()}`,
          )
          .filter((s) => s.length > 12)
          .join("\n")
          .slice(0, 8000) || "  (none)";

      contextBlock = [
        `EVENT IN FOCUS: ${ev.title ?? "(untitled)"} · ${ev.type ?? ""}${ev.occurred_on ? ` · ${ev.occurred_on}` : ""}`,
        ev.description ? `DESCRIPTION: ${ev.description}` : "",
        `LINKED EVIDENCE (inbox items):\n${evidenceText}`,
        clauseHint ? `POTENTIALLY RELEVANT CLAUSES: ${clauseHint}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
  }

  const system = [
    "You are ClaimGuard's contract-administration assistant, helping a subcontractor working under the FIDIC Conditions of Contract for Construction (Red Book, 1999).",
    "You help the user understand the event and evidence in focus, answer clarifying questions about the contract and the situation, and explain what is unclear or missing. You do NOT take actions on the user's behalf and you never invent facts, amounts, dates or durations.",
    "You are scoped to ONLY the context provided below — do not claim knowledge of other events, projects or documents. If asked about something outside this context, say it is outside what you can see on this screen.",
    RFI_GROUNDING,
    `WHEN — and only when — a Request for Further Information would genuinely help (something is unclear, missing, contradictory, or needs an Engineer's decision), append EXACTLY ONE block at the very end of your reply, after your prose, in this form:\n${SUGGESTION_OPEN}{"subject": string, "background": string, "queries": [{"question": string, "contractRef": string | null}], "contractReferences": string[]}${SUGGESTION_CLOSE}\nUse [INSERT …] placeholders inside questions for any specific you don't have. If an RFI is not warranted, do NOT append the block. Never mention the block or its syntax in your prose.`,
    "CONTEXT:",
    contextBlock,
  ].join("\n\n");

  const chat = messages
    .filter(
      (m: any) =>
        (m?.role === "user" || m?.role === "assistant") &&
        typeof m?.content === "string",
    )
    .slice(-12)
    .map((m: any) => ({ role: m.role, content: m.content }));

  let raw = "";
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      messages: [{ role: "system", content: system }, ...chat],
    });
    raw = completion.choices[0]?.message?.content ?? "";
  } catch {
    return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  }

  // Parse + strip the suggestion block.
  let reply = raw;
  let suggestion: any = null;
  const start = raw.indexOf(SUGGESTION_OPEN);
  if (start !== -1) {
    const end = raw.indexOf(SUGGESTION_CLOSE, start);
    const jsonStr =
      end !== -1
        ? raw.slice(start + SUGGESTION_OPEN.length, end)
        : raw.slice(start + SUGGESTION_OPEN.length);
    reply = raw.slice(0, start).trim();
    try {
      const parsed = JSON.parse(jsonStr.trim());
      const queries = Array.isArray(parsed?.queries)
        ? parsed.queries
            .map((q: any) => ({
              question: (q?.question ?? "").toString(),
              contractRef:
                typeof q?.contractRef === "string" && q.contractRef.trim()
                  ? q.contractRef.trim()
                  : null,
            }))
            .filter((q: any) => q.question.trim())
        : [];
      suggestion = {
        eventId: eventId ?? null,
        evidenceId: ctx?.evidence_id ?? null,
        subject: typeof parsed?.subject === "string" ? parsed.subject : "",
        background:
          typeof parsed?.background === "string" ? parsed.background : "",
        queries,
        contractReferences: Array.isArray(parsed?.contractReferences)
          ? parsed.contractReferences.filter(Boolean).map(String)
          : [],
        aiGenerated: true,
      };
    } catch {
      suggestion = null; // malformed block → just drop it, keep the prose
    }
  }

  return NextResponse.json({ reply, suggestion });
}
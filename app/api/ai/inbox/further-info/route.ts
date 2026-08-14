import { NextResponse } from "next/server";
import { openai } from "@/lib/ai/client";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { CLAUSES } from "@/lib/fidic/clauses";

/**
 * POST /api/ai/inbox/further-info
 * ---------------------------------------------------------------------------
 * Reviews ONE inbox item against the contract on TWO orthogonal axes:
 *   alignment — how it sits with/against the contract (merits)
 *   clarity   — whether the contractor can act on it, or needs information
 *               to proceed (readiness)  → this is what an RFI resolves.
 * Grounds on BOTH the general FIDIC Red Book 1999 position AND the project's
 * parsed Particular Conditions — with the uploaded contract taking priority.
 *
 * Input:  { source_type, content }
 * Output: { ai_notes, alignment, clarity, suggested_query }
 *   alignment ∈ aligned | contentious | against_contract   (or null)
 *   clarity   ∈ clear | unclear                            (or null)
 *   suggested_query: newline-separated RFI query lines (one per driver), or ""
 *
 * Called as a parallel step by the inbox "Analyze with AI" press.
 * ---------------------------------------------------------------------------
 */

const ALIGNMENT = ["aligned", "contentious", "against_contract"];
const CLARITY = ["clear", "unclear"];

export async function POST(req: Request) {
  const { source_type, content } = await req.json();
  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "No content" }, { status: 400 });
  }

  const { projectId } = await getSessionContext();
  const supabase = await createClient();

  // Parsed Particular Conditions (Appendix to Tender values), if a contract
  // has been uploaded. This takes priority over the general Red Book position.
  const { data: contract } = await supabase
    .from("project_contracts")
    .select("commencement_date, data")
    .eq("project_id", projectId)
    .maybeSingle();

  const particulars = contract?.data
    ? JSON.stringify(contract.data).slice(0, 4000)
    : null;

  // General Red Book positions from the clause registry.
  const clauseText = Object.entries(CLAUSES)
    .map(([ref, c]: [string, any]) => `SC ${ref} — ${c.title}`)
    .join("\n")
    .slice(0, 3000);

  const system = [
    "You are a FIDIC Conditions of Contract for Construction (Red Book, 1999) contract-administration assistant, reviewing ONE inbox item (an email received, or a note logged) for a subcontractor.",
    "Assess the item on TWO INDEPENDENT axes. Do not collapse them — an item can be against the contract yet perfectly clear, or contract-aligned yet ambiguous.",
    "  • ALIGNMENT (merits): does what the item describes/requests sit with or against the contract and the contractor's rights? One of: aligned | contentious | against_contract.",
    "  • CLARITY (readiness): can the contractor act on it as written, or is it ambiguous, incomplete, or internally conflicting such that information is needed to proceed? One of: clear | unclear.",
    "GROUNDING PRIORITY: prefer the project's PARTICULAR CONDITIONS / parsed contract values where provided; fall back to the general Red Book position otherwise.",
    'Return ONLY a JSON object — no markdown, no preamble: {"ai_notes": string, "alignment": one of [aligned, contentious, against_contract], "clarity": one of [clear, unclear], "suggested_query": string}.',
    "ai_notes: specific, practical notes grounded in the sub-clauses (cite them like 'SC 13.3'). When MORE THAN ONE flag applies, STRUCTURE ai_notes as labelled lines so each concern reads distinctly — a line starting 'Contentious — …' or 'Against contract — …' for the alignment concern, a line starting 'Unclear — …' for the clarity concern, then a final 'Overall — …' line tying them together. Separate the lines with a single newline (\\n). When only ONE flag applies, 2–3 plain sentences are fine. Keep each line tight.",
    "alignment: 'aligned' if consistent with the contractor's position; 'contentious' if arguable or warranting a reserving/cautious response; 'against_contract' if it asks the contractor to act contrary to the contract or asserts something the contract does not support.",
    "clarity: 'unclear' only when genuine information is needed to proceed (ambiguous instruction, missing detail, conflicting documents); otherwise 'clear'.",
    "suggested_query: propose the request(s) for information to put to the Engineer, ONE PER LINE (newline-separated), and ONLY when alignment != aligned OR clarity == unclear. Seed by driver: for unclear → 'Please clarify [X] so we can proceed.'; for against_contract → 'Please confirm the contractual basis for [instruction].'; for contentious → 'Please substantiate [position].'. If several drivers apply, include a line for each. If alignment == aligned AND clarity == clear, return an empty string.",
    "Never invent contract figures or durations; if a value isn't given, say it is unspecified rather than guessing.",
  ].join("\n");

  const user = [
    `SOURCE TYPE: ${source_type ?? "note"}`,
    "",
    "INBOX ITEM CONTENT:",
    content.slice(0, 8000),
    "",
    "PARTICULAR CONDITIONS (parsed from the uploaded contract — use in priority):",
    particulars ?? "(no contract uploaded — use the general Red Book position)",
    "",
    "GENERAL RED BOOK CLAUSES (fallback reference):",
    clauseText,
  ].join("\n");

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

    const alignment = ALIGNMENT.includes((out.alignment ?? "").toLowerCase())
      ? (out.alignment as string).toLowerCase()
      : null;
    const clarity = CLARITY.includes((out.clarity ?? "").toLowerCase())
      ? (out.clarity as string).toLowerCase()
      : null;
    const suggested_query =
      typeof out.suggested_query === "string" ? out.suggested_query.trim() : "";

    return NextResponse.json({
      ai_notes: typeof out.ai_notes === "string" ? out.ai_notes : "",
      alignment,
      clarity,
      suggested_query,
    });
  } catch (e) {
    console.error("[ai/inbox/further-info] failed:", e);
    return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  }
}
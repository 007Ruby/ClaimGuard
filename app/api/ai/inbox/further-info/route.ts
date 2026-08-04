import { NextResponse } from "next/server";
import { openai } from "@/lib/ai/client";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { CLAUSES } from "@/lib/fidic/clauses";

/**
 * POST /api/ai/inbox/further-info
 * ---------------------------------------------------------------------------
 * Reviews ONE inbox item against the contract and returns structured-lite notes.
 * Grounds on BOTH the general FIDIC Red Book 1999 position AND the project's
 * parsed Particular Conditions — with the uploaded contract taking priority.
 *
 * Input:  { source_type, content }
 * Output: { ai_notes, alignment }   alignment ∈ aligned | contentious | against_contract
 *
 * Called as a third, parallel step by the inbox "Analyze with AI" press.
 * ---------------------------------------------------------------------------
 */

const ALIGNMENT = ["aligned", "contentious", "against_contract"];

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
    "Assess whether what the item describes or requests aligns with the contract and the contractor's rights and obligations.",
    "GROUNDING PRIORITY: prefer the project's PARTICULAR CONDITIONS / parsed contract values where provided; fall back to the general Red Book position otherwise.",
    'Return ONLY a JSON object — no markdown, no preamble: {"ai_notes": string, "alignment": one of [aligned, contentious, against_contract]}.',
    "ai_notes: 2–4 sentences of specific, practical notes — what the item is, which sub-clause(s) bear on it, and any risk or action for the contractor (e.g. an instruction to proceed without a variation order under SC 13, a deduction the contract doesn't permit, or a deadline that differs from the contract). Cite sub-clauses like 'SC 13.3'.",
    "alignment: 'aligned' if consistent with the contractor's position; 'contentious' if arguable or warranting a reserving/cautious response; 'against_contract' if it asks the contractor to act contrary to the contract or asserts something the contract does not support.",
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
    return NextResponse.json({
      ai_notes: typeof out.ai_notes === "string" ? out.ai_notes : "",
      alignment,
    });
  } catch {
    return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  }
}
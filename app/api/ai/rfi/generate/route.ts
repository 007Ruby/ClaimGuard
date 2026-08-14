import { NextResponse } from "next/server";
import { openai } from "@/lib/ai/client";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { RFI_GROUNDING } from "@/lib/rfi/grounding";

/**
 * POST /api/ai/rfi/generate   ("Draft RFI")
 * ---------------------------------------------------------------------------
 * Turns the (user-editable) input boxes into a formal RFI letter. Grounds the
 * wording in the linked event and/or the anchor inbox item, but treats the
 * boxes as the source of truth. Never invents facts — missing specifics become
 * [INSERT …] placeholders.
 *
 * Input:  { event_id?, evidence_id?, subject, background, recipient?,
 *           queries: [{question, contract_ref}], contract_references: string[] }
 * Output: { rfi }  (prose letter)
 * ---------------------------------------------------------------------------
 */

const QUANTUM_RULE =
  "Never invent drawing numbers, references, amounts, durations or dates. Use ONLY specifics explicitly provided. Where a specific is required but not provided, insert a bracketed placeholder such as [INSERT drawing reference], [INSERT date] or [INSERT amount] for the user to complete. Do not soften or omit the placeholders.";

const FORMAT =
  "Output only the letter text with no preamble, explanation or markdown code fences. Structure it as: a subject line; a short background paragraph; a clearly numbered list of the queries (each as its own item, citing the relevant Sub-Clause where one is given); and a closing paragraph requesting a response in reasonable time, referencing Sub-Clause 1.9 where a delayed response would cause delay to the Works. Address it to the stated recipient (default: the Engineer).";

export async function POST(req: Request) {
  const body = await req.json();

  const subject: string = (body?.subject ?? "").toString().trim();
  const background: string = (body?.background ?? "").toString().trim();
  const recipient: string =
    (body?.recipient ?? "").toString().trim() || "The Engineer";
  const contractRefs: string[] = Array.isArray(body?.contract_references)
    ? body.contract_references.map(String)
    : [];
  const queries: { question: string; contract_ref?: string | null }[] =
    Array.isArray(body?.queries)
      ? body.queries
          .map((q: any) => ({
            question: (q?.question ?? "").toString().trim(),
            contract_ref: q?.contract_ref ?? null,
          }))
          .filter((q: any) => q.question)
      : [];

  if (!queries.length && !background && !subject) {
    return NextResponse.json(
      { error: "Nothing to draft — add a subject, background or at least one query." },
      { status: 400 },
    );
  }

  // Ground in the linked event and/or the anchor inbox item, when set.
  let eventText = "(no event linked)";
  let evidenceText = "(none linked)";
  const eventId: string | undefined = body?.event_id;
  const evidenceId: string | undefined = body?.evidence_id;

  if (eventId || evidenceId) {
    const { projectId } = await getSessionContext();
    const supabase = await createClient();

    if (eventId) {
      const { data: ev } = await supabase
        .from("events")
        .select("title, type, occurred_on, description")
        .eq("id", eventId)
        .eq("project_id", projectId)
        .single();
      if (ev) {
        eventText = [
          `${ev.title ?? "(untitled)"} · ${ev.type ?? ""}${ev.occurred_on ? ` · ${ev.occurred_on}` : ""}`,
          ev.description ? ev.description : "",
        ]
          .filter(Boolean)
          .join("\n");
      }

      const { data: evidence } = await supabase
        .from("evidence")
        .select("content, source_type")
        .eq("event_id", eventId);
      evidenceText =
        (evidence ?? [])
          .map(
            (e: any, i: number) =>
              `[${i + 1}] (${e.source_type ?? "note"}) ${(e.content ?? "").trim()}`,
          )
          .filter((s) => s.length > 8)
          .join("\n\n")
          .slice(0, 8000) || "(none linked)";
    }

    // The inbox item this RFI was launched from (may be the only anchor).
    if (evidenceId) {
      const { data: item } = await supabase
        .from("evidence")
        .select("title, content, source_type, ai_notes")
        .eq("id", evidenceId)
        .eq("project_id", projectId)
        .maybeSingle();
      if (item) {
        const anchorText = [
          `(${item.source_type ?? "note"}) ${item.title ? `${item.title} — ` : ""}${(item.content ?? "").trim()}`,
          item.ai_notes ? `Contract analysis: ${item.ai_notes}` : "",
        ]
          .filter(Boolean)
          .join("\n")
          .slice(0, 8000);
        evidenceText =
          evidenceText === "(none linked)" ? anchorText : `${anchorText}\n\n${evidenceText}`;
      }
    }
  }

  const system = [RFI_GROUNDING, FORMAT, QUANTUM_RULE].join("\n\n");

  const user = [
    `RECIPIENT: ${recipient}`,
    subject ? `SUBJECT: ${subject}` : "SUBJECT: [INSERT subject]",
    "",
    "BACKGROUND (from the user):",
    background || "(none provided)",
    "",
    "QUERIES (draft each as a numbered item, in this order):",
    queries.length
      ? queries
          .map(
            (q, i) =>
              `${i + 1}. ${q.question}${q.contract_ref ? `  [Sub-Clause ${q.contract_ref}]` : ""}`,
          )
          .join("\n")
      : "(none provided)",
    "",
    contractRefs.length
      ? `CONTRACT REFERENCES CITED: ${contractRefs.map((r) => `Sub-Clause ${r}`).join(", ")}`
      : "",
    "",
    "LINKED EVENT (context only — do not add facts beyond this):",
    eventText,
    "",
    "LINKED EVIDENCE (inbox items — reference these, do not fabricate others):",
    evidenceText,
  ]
    .filter((l) => l !== "")
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
      rfi: completion.choices[0]?.message?.content ?? "",
    });
  } catch (e) {
    console.error("[ai/rfi/generate] failed:", e);
    return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  }
}
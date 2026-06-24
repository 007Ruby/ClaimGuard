// app/api/ai/event/obligations/route.ts
// ---------------------------------------------------------------------------
// Hybrid obligation builder.
//
//   1. The engine (lib/fidic/engine.ts) computes the current step, deadline and
//      status from the contract's fixed time bars. This is authoritative for
//      anything date-related.
//   2. The model only (a) refines the precise clause for ambiguous categories
//      (e.g. a site_issue -> 2.1 late access vs 4.12 unforeseeable conditions)
//      and (b) writes the human-readable action wording, FIDIC-grounded.
//
// The model never sets a deadline and never invents quantum: amounts/durations
// it cannot source from the event content are left as [INSERT ...] placeholders.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/lib/supabase/server";
import {
  resolveObligation,
  type ContractContext,
  type EventTimeline,
} from "@/lib/fidic/engine";
import { CATEGORY_ROUTES, CLAUSES } from "@/lib/fidic/clauses";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  const { eventId } = await req.json();
  const supabase = await createClient();

  const { data: event, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .single();
  if (error || !event) {
    return NextResponse.json({ error: "event not found" }, { status: 404 });
  }

  const { data: contract } = await supabase
    .from("contracts")
    .select("*")
    .eq("project_id", event.project_id)
    .maybeSingle();

  const ctx: ContractContext = {
    commencementDate:
      contract?.commencement_date ?? new Date().toISOString().slice(0, 10),
    dayOverrides: contract?.data?.dayOverrides ?? {},
  };

  const timeline: EventTimeline = {
    type: event.type,
    awarenessDate: event.awareness_date ?? event.event_date,
    noticeDate: event.notice_date,
    submissionDate: event.submission_date,
    engineerReceiptDate: event.engineer_receipt_date,
    lastCompletedStepId: event.last_completed_step_id,
    closed: event.closed,
  };

  // (1) Deterministic obligation — the source of truth for the deadline.
  const obligation = resolveObligation(timeline, ctx);

  if (!obligation || obligation.status === "no_action") {
    await supabase
      .from("events")
      .update({ status: "no_action", obligation_synced_at: new Date().toISOString() })
      .eq("id", eventId);
    return NextResponse.json({ status: "no_action" });
  }
  if (obligation.status === "closed") {
    await supabase
      .from("events")
      .update({ status: "closed", obligation_synced_at: new Date().toISOString() })
      .eq("id", eventId);
    return NextResponse.json({ status: "closed" });
  }

  // (2) AI: refine the precise clause + write wording. JSON only, no preamble.
  const route = CATEGORY_ROUTES[event.type]!;
  const candidateClauses = [
    obligation.clauseRef,
    ...obligation.basisClauses,
    ...(event.type === "site_issue" ? ["2.1", "4.12"] : []),
  ].map((ref) => ({ ...(CLAUSES[ref] ?? {}), ref }));

  const system = [
    "You are a FIDIC Red Book 1999 contract administrator assisting a subcontractor.",
    "You are given an event and the SINGLE next contractual step already determined by a deterministic engine.",
    "Do NOT change the step, the party, the deadline or the day count — those are fixed by the contract.",
    "Your job: (a) pick the most precise applicable clause from the candidates, and",
    "(b) write a short, specific action instruction grounded in that clause.",
    "Cite sub-clause numbers explicitly. Never invent amounts or durations:",
    "use only figures present in the event content; otherwise write [INSERT ...].",
    "Return ONLY minified JSON, no markdown, no backticks, matching:",
    '{"clause_ref":"20.1","basis_clauses":["8.4"],"action":"...","reason":"..."}',
  ].join(" ");

  const user = JSON.stringify({
    event: {
      title: event.title,
      type: event.type,
      summary: event.summary,
      content: event.content?.slice(0, 4000),
      event_date: event.event_date,
    },
    determined_step: {
      label: obligation.label,
      party: obligation.party,
      due_date: obligation.dueDate,
      time_barred: obligation.timeBarred,
      base_instruction: obligation.description,
    },
    candidate_clauses: candidateClauses,
  });

  let clauseRef = obligation.clauseRef;
  let basis = obligation.basisClauses;
  let action = obligation.description;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(res.choices[0].message.content ?? "{}");
    if (parsed.clause_ref && CLAUSES[parsed.clause_ref]) clauseRef = parsed.clause_ref;
    if (Array.isArray(parsed.basis_clauses)) basis = parsed.basis_clauses.filter((r: string) => CLAUSES[r]);
    if (typeof parsed.action === "string" && parsed.action.length > 0) action = parsed.action;
  } catch (e) {
    // Fall back to the engine's plain instruction — never block on the model.
    console.error("obligation AI refine failed", e);
  }

  // (3) Persist the snapshot. Engine owns status + due_date; AI owns wording.
  const update = {
    status: obligation.status,
    fidic_clause_ref: clauseRef,
    fidic_basis_clauses: basis,
    action_label: obligation.label,
    action_description: action,
    action_party: obligation.party,
    action_due_date: obligation.dueDate || null,
    action_time_barred: obligation.timeBarred,
    obligation_synced_at: new Date().toISOString(),
  };
  await supabase.from("events").update(update).eq("id", eventId);

  return NextResponse.json({
    ...update,
    days_remaining: obligation.daysRemaining,
    basis_clause_titles: basis.map((r) => CLAUSES[r]?.title).filter(Boolean),
  });
}
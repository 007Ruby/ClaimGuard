import { NextResponse } from "next/server";
import { openai } from "@/lib/ai/client";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { buildClassifyPrompt, buildLinkPrompt } from "@/lib/ai/prompts";

const MODEL = "gpt-5.4-mini";          // Q3: the model swap lives here
const LINK_THRESHOLD = 0.7;            // Q2: the gate — raise to link less, lower to link more
const VALID = ["variation", "delay", "payment", "instruction", "site_issue", "other"];

function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
}

async function askJSON(system: string, user: string) {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    response_format: { type: "json_object" },
    // NOTE: no `temperature` — GPT-5.x reasoning models reject a custom value.
    messages: [{ role: "system", content: system }, { role: "user", content: user }],
  });
  return JSON.parse(completion.choices[0].message.content ?? "{}");
}

export async function POST(req: Request) {
  const { source_type, content } = await req.json();
  if (!content || typeof content !== "string") {
    return NextResponse.json({ error: "No content" }, { status: 400 });
  }

  const { orgId, projectId } = await getSessionContext();
  const supabase = await createClient();

  // ---- Step 1: classify + extract (no events shown) -----------------------
  let cls: any;
  try {
    const p = buildClassifyPrompt(source_type, content);
    cls = await askJSON(p.system, p.user);
} catch (e) {
    console.error("[ai/analyze] classify failed:", e);
    return NextResponse.json({ error: "AI request failed" }, { status: 502 });
  }
  const category = VALID.includes(String(cls.category ?? "").toLowerCase())
    ? String(cls.category).toLowerCase() : "other";
  const eventDate = cls.event_date || todayISO();

  // ---- Step 2: load all events (no category filter — match on subject matter) ----
  const { data: allEvents } = await supabase
    .from("events").select("id, title, type, occurred_on, description")
    .eq("project_id", projectId);
  const candidates = allEvents ?? [];

  // ---- Step 3: link decision — runs if any event exists -------------------
  let decision: any = { action: "create", event_id: null, match_score: 0, reason: "No events exist yet." };
  if (candidates.length > 0) {
    try {
      const p = buildLinkPrompt(
        { title: cls.title ?? "", category, summary: cls.summary ?? "" },
        candidates.map((e: any) => ({
          id: e.id, title: e.title, type: e.type, occurred_on: e.occurred_on, description: e.description,
        }))
      );
      decision = await askJSON(p.system, p.user);
    } catch {
      decision = { action: "create", event_id: null, match_score: 0, reason: "Link step failed; defaulting to create." };
    }
  }
  // ---- Step 4: THRESHOLD GATE ---------------------------------------------
  const score = typeof decision.match_score === "number" ? decision.match_score : 0;
  if (decision.action === "link") {
    const linked = candidates.find((e: any) => e.id === decision.event_id);
    if (!linked || score < LINK_THRESHOLD) {
      decision.action = candidates.length >= 2 ? "ask" : "create";   // safe fallback
      decision.event_id = null;
      decision.reason = `${decision.reason ?? ""} (match ${score.toFixed(2)} < ${LINK_THRESHOLD})`.trim();
    }
  }

  // ---- Assemble in the shape the inbox form already consumes --------------
  const suggestion = {
    title: cls.title ?? null,
    event_date: eventDate,
    summary: cls.summary ?? null,
    confidence: cls.confidence ?? null,
    category,
    event_decision: {
      action: decision.action,
      event_id: decision.event_id ?? null,
      match_score: score,
      reason: decision.reason ?? null,
      new_event: decision.action === "create"
        ? { title: cls.title ?? "", type: category, occurred_on: eventDate, description: cls.summary ?? "" }
        : null,
    },
  };

  const { data: row } = await supabase.from("ai_suggestions").insert({
    org_id: orgId, project_id: projectId, type: "classify_document",
    payload: suggestion, confidence: suggestion.confidence,
  }).select("id").single();

  return NextResponse.json({ suggestionId: row?.id ?? null, suggestion });
}
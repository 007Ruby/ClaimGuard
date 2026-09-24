// FOCUS: event-scoped depth.
//
// The project lists in context.ts give the bot breadth (one line per record, project-wide).
// This gives it depth: find the event(s) the question is about, then pull every record
// carrying that event_id — full evidence content, claim bodies, RFI queries, follow-ups.
// FAILS SOFT, like retrieval: any error returns no focus block and the bot falls back to
// the project lists.

import type OpenAI from "openai";
import { EMBEDDING_MODEL } from "@/lib/contract/ingest";

// Tune from eval traces (the harness logs every candidate score). Start low: a missed
// event costs more than an extra one.
export const EVENT_MATCH_FLOOR = 0.3;
export const MAX_FOCUS_EVENTS = 2;

const CONTENT_CHARS = 1500;
const BODY_CHARS = 900;

export interface EventMatch {
  eventId: string;
  title: string;
  score: number;
}

export interface FocusResult {
  block: string | null;
  matches: EventMatch[];     // expanded
  candidates: EventMatch[];  // every event, scored — for tuning
}

const EMPTY: FocusResult = { block: null, matches: [], candidates: [] };

type Supa = { from: (t: string) => any };

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

function cut(s: string | null | undefined, n: number): string {
  if (!s) return "";
  const t = s.trim();
  return t.length > n ? t.slice(0, n) + " …[truncated]" : t;
}

async function matchEvents(
  question: string,
  events: { id: string; title: string | null; description: string | null }[],
  openai: OpenAI,
): Promise<{ matches: EventMatch[]; candidates: EventMatch[] }> {
  if (events.length === 0 || question.trim().length < 3) return { matches: [], candidates: [] };

  const inputs = [
    question,
    ...events.map((e) => `${e.title ?? ""}\n${e.description ?? ""}`.slice(0, 4000)),
  ];
  const res = await openai.embeddings.create({ model: EMBEDDING_MODEL, input: inputs });
  const vecs = [...res.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
  const q = vecs[0];
  if (!q) return { matches: [], candidates: [] };

  const candidates = events
    .map((e, i) => ({
      eventId: e.id,
      title: e.title ?? "(untitled)",
      score: cosine(q, vecs[i + 1] ?? []),
    }))
    .sort((a, b) => b.score - a.score);

  const matches = candidates.filter((c) => c.score >= EVENT_MATCH_FLOOR).slice(0, MAX_FOCUS_EVENTS);
  return { matches, candidates };
}

export async function buildFocus(
  question: string,
  projectId: string,
  supabase: Supa,
  openai: OpenAI,
): Promise<FocusResult> {
  try {
    const { data: events, error } = await supabase
      .from("events")
      .select("id, title, description")
      .eq("project_id", projectId);
    if (error) throw error;

    const { matches, candidates } = await matchEvents(question, events ?? [], openai);
    if (matches.length === 0) return { block: null, matches, candidates };

    const ids = matches.map((m) => m.eventId);

    const [ev, evid, rfis, claims, fus] = await Promise.all([
      supabase
        .from("events")
        .select(
          "id, title, type, description, awareness_date, notice_date, submission_date, " +
            "engineer_receipt_date, ipc_issued_date, engineer_response_date, determination_date, " +
            "payment_received_date, certified_amount, amount_received",
        )
        .in("id", ids),
      supabase
        .from("evidence")
        .select("id, event_id, title, event_date, alignment, clarity, ai_notes, content")
        .in("event_id", ids)
        .order("event_date", { ascending: true }),
      supabase
        .from("rfis")
        .select(
          "event_id, reference, status, subject, background, queries, date_sent, " +
            "response_required_by, response_received_on, response_summary",
        )
        .in("event_id", ids),
      supabase
        .from("claims")
        .select("primary_event_id, title, kind, status, submitted_at, amount, currency, time_days, body")
        .in("primary_event_id", ids),
      supabase
        .from("follow_ups")
        .select("event_id, step_id, status, sent_at, recipient, subject, body")
        .in("event_id", ids),
    ]);

    for (const r of [ev, evid, rfis, claims, fus]) if (r.error) throw r.error;

    const lines: string[] = [
      "## Records for the event(s) this question is about",
      "",
      "The project's own records, in full, for the events matched to this question. Use them for",
      "what has happened, what has been sent, and what each party said. They are NOT a source of",
      "deadlines: due dates come only from Live deadlines above.",
    ];

    for (const m of matches) {
      const e = (ev.data ?? []).find((x: any) => x.id === m.eventId);
      if (!e) continue;

      const dates = [
        ["aware", e.awareness_date], ["notice served", e.notice_date],
        ["submitted", e.submission_date], ["Engineer received", e.engineer_receipt_date],
        ["IPC issued", e.ipc_issued_date], ["Engineer responded", e.engineer_response_date],
        ["determination", e.determination_date], ["payment received", e.payment_received_date],
      ].filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join("; ");

      lines.push("", `### EVENT: ${e.title} [${e.type}]`);
      if (dates) lines.push(`Recorded dates: ${dates}`);
      if (e.certified_amount != null) lines.push(`Certified: ${e.certified_amount}${e.amount_received != null ? `; received: ${e.amount_received}` : ""}`);
      if (e.description) lines.push(cut(e.description, CONTENT_CHARS));

      for (const c of (claims.data ?? []).filter((x: any) => x.primary_event_id === m.eventId)) {
        lines.push(
          "", `-- CLAIM (${c.kind}, ${c.status}${c.submitted_at ? `, submitted ${String(c.submitted_at).slice(0, 10)}` : ", NOT submitted"}): ${c.title}` +
            (c.amount != null ? ` — ${c.currency ?? ""} ${c.amount}` : "") +
            (c.time_days != null ? ` — ${c.time_days} days` : ""),
          cut(c.body, BODY_CHARS),
        );
      }

      for (const r of (rfis.data ?? []).filter((x: any) => x.event_id === m.eventId)) {
        const qs = Array.isArray(r.queries)
          ? r.queries.map((q: any, i: number) => `  ${i + 1}. ${q?.question ?? ""}${q?.contract_ref ? ` (SC ${q.contract_ref})` : ""}`).join("\n")
          : "";
        lines.push(
          "", `-- ${r.reference} [${r.status}]${r.date_sent ? ` sent ${r.date_sent}` : " not sent"}` +
            (r.response_required_by ? `; response required by ${r.response_required_by}` : "") +
            (r.response_received_on ? `; answered ${r.response_received_on}` : "") +
            `: ${r.subject ?? ""}`,
          cut(r.background, BODY_CHARS),
          qs,
          r.response_summary ? `Response: ${cut(r.response_summary, BODY_CHARS)}` : "",
        );
      }

      for (const f of (fus.data ?? []).filter((x: any) => x.event_id === m.eventId)) {
        lines.push(
          "", `-- FOLLOW-UP [${f.status}]${f.sent_at ? ` sent ${String(f.sent_at).slice(0, 10)}` : ""} to ${f.recipient ?? "?"}: ${f.subject ?? ""}`,
          cut(f.body, BODY_CHARS),
        );
      }

      for (const x of (evid.data ?? []).filter((y: any) => y.event_id === m.eventId)) {
        lines.push(
          "", `-- INBOX: ${x.title ?? "(untitled)"}${x.event_date ? ` (${x.event_date})` : ""} — alignment=${x.alignment ?? "—"}, clarity=${x.clarity ?? "—"}`,
          x.ai_notes ? `Notes: ${cut(x.ai_notes, 400)}` : "",
          cut(x.content, CONTENT_CHARS),
        );
      }
    }

    return { block: lines.join("\n").replace(/\n{3,}/g, "\n\n"), matches, candidates };
  } catch (err) {
    console.error("[chat/focus] failed:", err);
    return EMPTY;
  }
}
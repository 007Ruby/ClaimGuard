
//get client and project data 
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { buildFocus, type EventMatch } from "./focus";
import type { LiveDigestItem } from "./assemble";
import type { RetrievalResult } from "./retrieval";
//get claim, evidence, event, followups, evidence data
import { listClaims } from "@/lib/queries/claims";
import { listEventsWithEvidence } from "@/lib/queries/events";
import { listAwaitingEvents, listSavedFollowUps } from "@/lib/queries/follow-ups";
import { listInboxCards } from "@/lib/queries/inbox";
import { assembleContext, buildIdentity } from "./assemble";

//get contract, and determinsitic engine data
import { asProjectContractData } from "@/lib/contract/contract-data";
import { loadChatDigest } from "@/lib/fidic/get-obligations";
import OpenAI from "openai";

const MAX_ITEMS = 60;

//normalises input (takes care of nullish inputs, whitespaces, etc)
function trunc(s: string | null | undefined, n: number): string {
  if (!s) return "";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

//catches failed sections, pushes it to the failedSections array, and returns the string that will go into prompt
function sectionFailed(failed: string[], label: string, e: unknown): string {
  console.error(`[chat context] ${label} failed:`, e);
  failed.push(label);
  return `${label}\n(⚠ COULD NOT BE LOADED this session — a loading/technical error, NOT a sign there are none)`;
}

//joins lines to meet MAX_ITEMS limit 
function capList(lines: string[]): string {
  if (lines.length <= MAX_ITEMS) return lines.join("\n");
  return lines.slice(0, MAX_ITEMS).join("\n") + `\n…and ${lines.length - MAX_ITEMS} more`;
}

export interface ChatTrace {
  digest: LiveDigestItem[];
  retrieval: RetrievalResult | null;
  eventMatch: { matches: EventMatch[]; candidates: EventMatch[] };
}
export const EMPTY_TRACE: ChatTrace = { digest: [], retrieval: null, eventMatch: { matches: [], candidates: [] } };

export async function buildChatContext(question: string) {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();
  const failedSections: string[] = [];
  let contractError = false;
  const parts: string[] = [];
  const trace: ChatTrace = { digest: [], retrieval: null, eventMatch: { matches: [], candidates: [] } };
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  //contract profile: the load-bearing one 
  try {
    //get project data, and throw error if unable
    const { data: row } = await supabase
      .from("project_contracts")
      .select("commencement_date, data")   // the date lives here
      .eq("project_id", projectId)
      .maybeSingle();

    const data = asProjectContractData(row?.data);
    if (!data?.contractProfile) throw new Error("No contract profile on this project.");
    //get assembled context from contract
const digest = await loadChatDigest();
const assembled = await assembleContext({
  question, //for tier 2 
  projectId,
  identity: buildIdentity({
    projectName: data.name ?? "This project",
    data,
    commencementDate: row?.commencement_date ?? null,
  }),
  profile: data.contractProfile,
  digest,
  retrievalDeps: { supabase, openai },
});

    parts.push(...assembled.blocks);
    trace.digest = digest;
    trace.retrieval = assembled.retrieval;
  } catch (e) {
    console.error("[chat/context] contract load failed:", e);
    contractError = true;
  }
    // Focus: full records for the event(s) this question is about
  const focus = await buildFocus(question, projectId, supabase, openai);
  trace.eventMatch = { matches: focus.matches, candidates: focus.candidates };
  if (focus.block) parts.push(focus.block);

  // Events (with linked evidence) 
  try {
    const events = await listEventsWithEvidence();
    const lines = events.map((ev: any) => {
      const ev2 = (ev.evidence ?? []).map((x: any) => x.title).filter(Boolean).join(", ");
      return `- ${ev.title ?? "(untitled)"} [${ev.type ?? "—"}] occurred ${ev.occurred_on ?? "—"}` +
             (ev2 ? `; evidence: ${ev2}` : "");
    });
    parts.push(`EVENTS (${events.length})\n${capList(lines) || "(none)"}`);
  } catch (e) { parts.push(sectionFailed(failedSections, "EVENTS", e)); }

  // Deadlines awaiting the other party (system-computed) 
  try {
    const awaiting = await listAwaitingEvents();
    const lines = awaiting.map(
      (a) => `- ${a.title}: waiting on ${a.actionParty ?? "?"} for ${a.actionLabel ?? "?"}` +
             (a.clauseRef ? ` (SC ${a.clauseRef})` : "") +
             ` — due ${a.actionDueDate ?? "—"} — urgency ${a.urgency}` +
             (a.outstandingAmount != null ? ` — outstanding ${a.outstandingAmount}` : ""),
    );
    parts.push(
      `DEADLINES AWAITING OTHER PARTY (system-computed — AUTHORITATIVE for these dates) (${awaiting.length})\n` +
      (capList(lines) || "(none)"),
    );
  } catch (e) { parts.push(sectionFailed(failedSections, "DEADLINES", e)); }

  //  Claims 
  try {
    const claims = await listClaims();
    const lines = claims.map((c: any) => {
      const evs = (c.claim_events ?? []).map((ce: any) => ce.event?.title).filter(Boolean).join(", ");
      const money = c.amount != null ? ` amount ${c.amount} ${c.currency ?? ""}`.trim() : "";
      const time = c.time_days != null ? ` ${c.time_days} days` : "";
      return `- ${c.title ?? "(untitled)"} [${c.kind ?? "—"}/${c.type ?? "—"}] status=${c.status ?? "—"}` +
             (c.relief_sought ? ` relief=${c.relief_sought}` : "") + money + time +
             (evs ? `; events: ${evs}` : "");
    });
    parts.push(`CLAIMS (${claims.length})\n${capList(lines) || "(none)"}`);
  } catch (e) { parts.push(sectionFailed(failedSections, "CLAIMS", e)); }

  //  RFIs 
  try {
    const { data, error } = await supabase
      .from("rfis")
      .select("reference, subject, status, date_sent, response_summary")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    const lines = (data ?? []).map(
      (r: any) => `- ${r.reference ?? "(no ref)"}: ${trunc(r.subject, 100) || "—"} [${r.status ?? "—"}]` +
                  (r.date_sent ? ` sent ${r.date_sent}` : "") +
                  (r.response_summary ? `; response: ${trunc(r.response_summary, 120)}` : ""),
    );
    parts.push(`RFIs (${(data ?? []).length})\n${capList(lines) || "(none)"}`);
  }  catch (e) { parts.push(sectionFailed(failedSections, "RFIs", e)); }


  // Follow-ups 
  try {
    const fus = await listSavedFollowUps();
    const lines = fus.map(
      (f) => `- ${f.eventTitle ?? "(event)"} → ${f.recipient ?? "?"} [${f.status}]` +
             (f.sentAt ? ` sent ${f.sentAt}` : "") +
             (f.subject ? `: ${trunc(f.subject, 80)}` : ""),
    );
    parts.push(`FOLLOW-UPS (${fus.length})\n${capList(lines) || "(none)"}`);
  } catch (e) { parts.push(sectionFailed(failedSections, "FOLLOWUPs", e)); }

  // Evidence / inbox (metadata + flags only, not full content) 
  try {
    const cards = await listInboxCards();
    const lines = cards.map(
      (c) => `- ${c.title ?? "(untitled)"} (${c.source_type})` +
             ` alignment=${c.alignment ?? "—"} clarity=${c.clarity ?? "—"}` +
             (c.event ? `; event: ${c.event.title}` : "") +
             (c.ai_notes ? `; notes: ${trunc(c.ai_notes, 120)}` : ""),
    );
    parts.push(`EVIDENCE / INBOX (${cards.length})\n${capList(lines) || "(none)"}`);
  } catch (e) { parts.push(sectionFailed(failedSections, "EVIDENCE", e)); }
    return { context: parts.join("\n\n"), contractError, failedSections, trace };
}
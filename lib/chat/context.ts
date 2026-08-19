// Assembles the read-only "PROVIDED MATERIAL" the chatbot answers from — the
// single source of everything the assistant knows about this project.

// Pulls the contract (extracted key terms + full-text sidecar from storage) and
// a system-computed project digest: events + evidence, awaiting-party deadlines,
// claims, RFIs, follow-ups, and inbox flags. 

// Deadlines from the obligation engine are labelled AUTHORITATIVE so the model 
// relays them rather than recomputing.

// Every section is independently try/caught: a failure logs and degrades that one
// section to "(unavailable)" instead of breaking the whole context. 

// Lists and the contract text are capped to keep prompt size (cost/latency) bounded.

import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { listClaims } from "@/lib/queries/claims";
import { listEventsWithEvidence } from "@/lib/queries/events";
import { listAwaitingEvents, listSavedFollowUps } from "@/lib/queries/follow-ups";
import { listInboxCards } from "@/lib/queries/inbox";

const CONTRACT_TEXT_CHAR_CAP = 30000;
const MAX_ITEMS = 60;

function trunc(s: string | null | undefined, n: number): string {
  if (!s) return "";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

function sectionFailed(failed: string[], label: string, e: unknown): string {
  console.error(`[chat context] ${label} failed:`, e);
  failed.push(label);
  return `${label}\n(⚠ COULD NOT BE LOADED this session — a loading/technical error, NOT a sign there are none)`;
}

function capList(lines: string[]): string {
  if (lines.length <= MAX_ITEMS) return lines.join("\n");
  return lines.slice(0, MAX_ITEMS).join("\n") + `\n…and ${lines.length - MAX_ITEMS} more`;
}

function contractTerms(data: Record<string, any>): string {
  const p = data.parties ?? {};
  const ov = data.dayOverrides ?? {};
  const periodLine = Object.keys(ov).length
    ? Object.entries(ov).map(([k, v]) => `${k}=${v}`).join(", ")
    : "(FIDIC GC defaults)";
  return [
    "CONTRACT KEY TERMS (extracted values — authoritative for figures)",
    `- Project: ${data.name ?? "—"}`,
    `- Employer: ${p.employer ?? "—"} | Contractor: ${p.contractor ?? "—"} | Engineer: ${p.engineer ?? "—"}`,
    `- Accepted Contract Amount: ${data.acceptedContractAmount ?? "—"} ${data.currency ?? ""}`.trim(),
    `- Commencement: ${data.commencementDate ?? "—"}`,
    `- Time for Completion: ${data.timeForCompletionDays ?? "—"} days`,
    `- Defects Notification Period: ${data.defectsNotificationPeriodDays ?? "—"} days`,
    `- Governing law: ${data.governingLaw ?? "—"}`,
    `- Contractual periods (days): ${periodLine}`,
  ].join("\n");
}

export async function buildChatContext(): Promise<{
  context: string;
  contractError: boolean;
  failedSections: string[];
}> {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();
  const parts: string[] = [];
  const failedSections: string[] = [];
  let contractError = false;

  // --- Contract: key terms + full text sidecar ---
  // --- Contract: key terms + full text sidecar ---
  try {
    const { data: contract, error: cErr } = await supabase
      .from("project_contracts").select("data").eq("project_id", projectId).maybeSingle();
    if (cErr) throw cErr; // a query error must NOT masquerade as "no contract uploaded"
    const data = (contract?.data as Record<string, any>) ?? null;
    if (!data) {
      // Normal state for a new project — NOT an error. Bot explains, doesn't alarm.
      parts.push("CONTRACT\n(no contract uploaded yet)");
    } else {
      parts.push(contractTerms(data));
      const textPath = data.text_path as string | undefined;
      if (textPath) {
        try {
          const { data: blob, error } = await supabase.storage.from("contracts").download(textPath);
          if (error) throw error;
          let text = (await blob.text()).trim();
          if (text.length > CONTRACT_TEXT_CHAR_CAP)
            text = text.slice(0, CONTRACT_TEXT_CHAR_CAP) + "\n…[contract text truncated]";
          if (text) parts.push("CONTRACT TEXT (reference)\n" + text);
        } catch (e) {
          // Text sidecar is reference prose; the authoritative TERMS above still loaded,
          // so this is a per-section note, NOT a hard stop.
          console.error("[chat context] contract text download failed:", e);
          parts.push("CONTRACT TEXT\n(⚠ could not be loaded this session — the key terms above are still usable)");
        }
      } else {
        parts.push("CONTRACT TEXT\n(this contract predates full-text storage — only extracted key terms above are usable)");
      }
    }
  } catch (e) {
    console.error("[chat context] contract load failed:", e);
    contractError = true; // load-bearing failure → route refuses project answers
    parts.push("CONTRACT\n(⚠ COULD NOT BE LOADED this session — a loading/technical error)");
  }

  // --- Events (with linked evidence) ---
  try {
    const events = await listEventsWithEvidence();
    const lines = events.map((ev: any) => {
      const ev2 = (ev.evidence ?? []).map((x: any) => x.title).filter(Boolean).join(", ");
      return `- ${ev.title ?? "(untitled)"} [${ev.type ?? "—"}] occurred ${ev.occurred_on ?? "—"}` +
             (ev2 ? `; evidence: ${ev2}` : "");
    });
    parts.push(`EVENTS (${events.length})\n${capList(lines) || "(none)"}`);
  } catch (e) { parts.push(sectionFailed(failedSections, "EVENTS", e)); }

  // --- Deadlines awaiting the other party (system-computed) ---
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

  // --- Claims ---
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

  // --- RFIs (queried directly; assumes table `rfis`) ---
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


  // --- Follow-ups ---
  try {
    const fus = await listSavedFollowUps();
    const lines = fus.map(
      (f) => `- ${f.eventTitle ?? "(event)"} → ${f.recipient ?? "?"} [${f.status}]` +
             (f.sentAt ? ` sent ${f.sentAt}` : "") +
             (f.subject ? `: ${trunc(f.subject, 80)}` : ""),
    );
    parts.push(`FOLLOW-UPS (${fus.length})\n${capList(lines) || "(none)"}`);
  } catch (e) { parts.push(sectionFailed(failedSections, "FOLLOWUPs", e)); }

  // --- Evidence / inbox (metadata + flags only, not full content) ---
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
  return { context: parts.join("\n\n"), contractError, failedSections };
}
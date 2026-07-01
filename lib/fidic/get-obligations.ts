// lib/fidic/get-obligations.ts
// ---------------------------------------------------------------------------
// Wires the engine to the pages. Computes each event's obligation at render
// time (the engine is pure + deterministic), so flags appear for existing
// events without having run the AI route first.
//
// NOTE: the event category column in this DB is `type` (not `category`). The
// value is normalised (trimmed, lowercased, spaces -> underscores) so values
// like "Variation" or "Site Issue" still match the engine's routes.
// ---------------------------------------------------------------------------

import { createClient } from "@/lib/supabase/server";
import {
  resolveObligation,
  type ContractContext,
  type EventStatus,
} from "@/lib/fidic/engine";
import type { EventFlag } from "@/components/events/event-status-flag";
import type { WhatsNextItem } from "@/components/whats-next/obligation-item";

// If you ran migration 0005, change this to "project_contracts".
const CONTRACT_TABLE = "project_contracts";

type EventRow = {
  id: string;
  project_id: string;
  title: string | null;
  type: string | null; // <-- the category column in this schema
  event_date: string | null;
  created_at: string | null;
  awareness_date: string | null;
  notice_date: string | null;
  submission_date: string | null;
  engineer_receipt_date: string | null;
  last_completed_step_id: string | null;
  closed: boolean | null;
  // persisted AI snapshot (optional)
  action_description: string | null;
  fidic_clause_ref: string | null;
  fidic_basis_clauses: string[] | null;
  obligation_synced_at: string | null;
};

/** Map "Variation" / "Site Issue" / " payment " -> "variation" / "site_issue" / "payment". */
function normalizeCategory(raw: string | null | undefined): string {
  return (raw ?? "").toString().trim().toLowerCase().replace(/\s+/g, "_");
}

/** Best-available date for an event (YYYY-MM-DD). */
function eventDate(ev: EventRow): string {
  const d = ev.event_date ?? ev.created_at ?? new Date().toISOString();
  return d.slice(0, 10);
}

function contextFor(
  projectId: string,
  contracts: Map<string, { commencement_date: string | null; data: any }>,
  fallbackDate: string,
): ContractContext {
  const c = contracts.get(projectId);
  return {
    commencementDate: c?.commencement_date ?? fallbackDate,
    dayOverrides: c?.data?.dayOverrides ?? {},
  };
}

/** Map one event row -> the EventFlag the flag component renders. */
export function eventFlag(
  ev: EventRow,
  contracts: Map<string, { commencement_date: string | null; data: any }>,
): EventFlag {
  const date = eventDate(ev);
  const ctx = contextFor(ev.project_id, contracts, date);
  const ob = resolveObligation(
    {
      type: normalizeCategory(ev.type),
      awarenessDate: ev.awareness_date ?? date,
      noticeDate: ev.notice_date,
      submissionDate: ev.submission_date,
      engineerReceiptDate: ev.engineer_receipt_date,
      lastCompletedStepId: ev.last_completed_step_id,
      closed: ev.closed ?? false,
    },
    ctx,
  );

  if (!ob) return { status: "no_action" };

  const usePersisted = !!ev.obligation_synced_at;
  return {
    status: ob.status,
    actionLabel: ob.label,
    actionDescription: usePersisted ? ev.action_description ?? ob.description : ob.description,
    actionDueDate: ob.dueDate || null,
    actionParty: ob.party,
    clauseRef: usePersisted ? ev.fidic_clause_ref ?? ob.clauseRef : ob.clauseRef,
    basisClauses:
      usePersisted && ev.fidic_basis_clauses?.length ? ev.fidic_basis_clauses : ob.basisClauses,
    timeBarred: ob.timeBarred,
  };
}

/** Load all visible events + contracts and return per-event flags keyed by id. */
export async function loadEventFlags(): Promise<Record<string, EventFlag>> {
  const supabase = await createClient();
  const [{ data: events }, { data: contractRows }] = await Promise.all([
    supabase.from("events").select("*"),
    supabase.from(CONTRACT_TABLE).select("project_id, commencement_date, data"),
  ]);

  const contracts = new Map<string, any>();
  (contractRows ?? []).forEach((c: any) => contracts.set(c.project_id, c));

  const out: Record<string, EventFlag> = {};
  (events ?? []).forEach((ev: any) => (out[ev.id] = eventFlag(ev as EventRow, contracts)));
  return out;
}

const OPEN: EventStatus[] = ["overdue", "action_needed", "awaiting"];
const RANK: Record<string, number> = { overdue: 0, action_needed: 1, awaiting: 2 };

/** Build the What's Next list: open obligations, overdue first, then by deadline. */
export async function loadWhatsNext(): Promise<WhatsNextItem[]> {
  const supabase = await createClient();
  const [{ data: events }, { data: contractRows }] = await Promise.all([
    supabase.from("events").select("*"),
    supabase.from(CONTRACT_TABLE).select("project_id, commencement_date, data"),
  ]);

  const contracts = new Map<string, any>();
  (contractRows ?? []).forEach((c: any) => contracts.set(c.project_id, c));

  const items: WhatsNextItem[] = [];
  (events ?? []).forEach((ev: any) => {
    const row = ev as EventRow;
    const flag = eventFlag(row, contracts);
    if (!OPEN.includes(flag.status)) return;
    items.push({
      eventId: row.id,
      eventTitle: row.title ?? "(untitled event)",
      status: flag.status as WhatsNextItem["status"],
      actionLabel: flag.actionLabel ?? "",
      actionDescription: flag.actionDescription ?? "",
      actionDueDate: flag.actionDueDate ?? null,
      clauseRef: flag.clauseRef ?? null,
      basisClauses: flag.basisClauses ?? [],
      timeBarred: flag.timeBarred ?? false,
    });
  });

  items.sort((a, b) => {
    if (RANK[a.status] !== RANK[b.status]) return RANK[a.status] - RANK[b.status];
    if (!a.actionDueDate) return 1;
    if (!b.actionDueDate) return -1;
    return a.actionDueDate.localeCompare(b.actionDueDate);
  });
  return items;
}
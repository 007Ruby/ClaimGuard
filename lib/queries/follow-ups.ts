// lib/queries/follow-ups.ts
// Events whose CURRENT step is one we're waiting on the other party to complete.
// The engine already marks exactly those as `awaiting` (party = engineer/employer):
//   20.1-response, 3.5-determination, 14.6-ipc, 14.7-payment.
// So filtering flag.status === "awaiting" gives precisely the follow-up-able set.
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { eventFlag } from "@/lib/fidic/get-obligations";
import type { Remedy, Urgency } from "@/lib/fidic/engine";

export interface AwaitingEvent {
  id: string;
  title: string;
  type: string | null;
  occurred_on: string | null;
  stepId: string | null;
  actionLabel: string | null;
  actionParty: string | null; // "engineer" | "employer"
  actionDueDate: string | null;
  clauseRef: string | null;
  basisClauses: string[];
  urgency: Urgency;
  nominal: boolean;
  remedies: Remedy[];
  outstandingAmount: number | null;
}

export async function listAwaitingEvents(): Promise<AwaitingEvent[]> {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();

  const [{ data: events }, { data: contractRows }] = await Promise.all([
    supabase.from("events").select("*").eq("project_id", projectId),
    supabase
      .from("project_contracts")
      .select("project_id, commencement_date, data"),
  ]);

  const contracts = new Map<string, any>();
  (contractRows ?? []).forEach((c: any) => contracts.set(c.project_id, c));

  const out: AwaitingEvent[] = [];
  (events ?? []).forEach((ev: any) => {
    const flag = eventFlag(ev, contracts);
    if (flag.status !== "awaiting") return;
    out.push({
      id: ev.id,
      title: ev.title ?? "(untitled event)",
      type: ev.type ?? null,
      occurred_on: ev.occurred_on ?? null,
      stepId: flag.stepId ?? null,
      actionLabel: flag.actionLabel ?? null,
      actionParty: flag.actionParty ?? null,
      actionDueDate: flag.actionDueDate ?? null,
      clauseRef: flag.clauseRef ?? null,
      basisClauses: flag.basisClauses ?? [],
      urgency: flag.urgency ?? "ok",
      nominal: flag.nominal ?? false,
      remedies: flag.remedies ?? [],
      outstandingAmount: flag.outstandingAmount ?? null,
    });
  });

  // Soonest due first; the most overdue chases float to the top.
  out.sort((a, b) => {
    if (!a.actionDueDate) return 1;
    if (!b.actionDueDate) return -1;
    return a.actionDueDate.localeCompare(b.actionDueDate);
  });
  return out;
}

export type SavedFollowUp = {
  id: string;
  eventId: string;
  eventTitle: string | null;
  stepId: string;
  recipient: string | null;
  subject: string | null;
  keyPoints: string | null;
  body: string | null;
  status: "draft" | "sent";
  sentAt: string | null;
  updatedAt: string | null;
};

export async function listSavedFollowUps(): Promise<SavedFollowUp[]> {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("follow_ups")
    .select(
      "id, event_id, step_id, recipient, subject, key_points, body, status, sent_at, updated_at, event:events(title)",
    )
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false });
  if (error) {
    console.error(error);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    id: r.id,
    eventId: r.event_id,
    eventTitle: r.event?.title ?? null,
    stepId: r.step_id,
    recipient: r.recipient,
    subject: r.subject,
    keyPoints: r.key_points,
    body: r.body,
    status: r.status,
    sentAt: r.sent_at,
    updatedAt: r.updated_at,
  }));
}
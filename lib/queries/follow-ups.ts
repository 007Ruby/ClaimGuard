// lib/queries/follow-ups.ts
// Events whose CURRENT step is one we're waiting on the other party to complete.
// The engine already marks exactly those as `awaiting` (party = engineer/employer):
//   20.1-response, 3.5-determination, 14.6-ipc, 14.7-payment.
// So filtering flag.status === "awaiting" gives precisely the follow-up-able set.
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { eventFlag } from "@/lib/fidic/get-obligations";

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
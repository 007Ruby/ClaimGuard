"use server";
/**
 * lib/actions/claim-context.ts
 * ---------------------------------------------------------------------------
 * The single source of truth for the Claims-page guard popups.
 *
 * - The engine (via eventFlag → resolveObligation) tells us the CURRENT open
 *   step and whether it is overdue. That is what drives the *time-bar* and
 *   *particulars-overdue* popups — we consume the engine rather than re-deriving
 *   the 28/42-day maths, so the two pages can never disagree.
 * - The RAW `notice_date` / `submission_date` columns tell us whether the
 *   contractor has toggled each step done — that is what drives the
 *   *already-submitted* popups. We read them raw (NOT through eventFlag, which
 *   applies a `submission_date ?? occurred_on` fallback that would misreport).
 * ---------------------------------------------------------------------------
 */
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { eventFlag } from "@/lib/fidic/get-obligations";
import type { EventFlag } from "@/components/events/event-status-flag";

export interface EventClaimContext {
  eventId: string;
  flag: EventFlag; // carries stepId, status, timeBarred, actionDueDate
  noticeSubmitted: boolean; // notice_date set (20.1-notice toggled done)
  detailedSubmitted: boolean; // submission_date set (20.1-particulars toggled done)
  occurredOn: string | null;
}

export async function getEventClaimContext(
  eventId: string,
): Promise<EventClaimContext | null> {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();

  const [{ data: ev }, { data: contractRows }] = await Promise.all([
    supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .eq("project_id", projectId)
      .single(),
    supabase
      .from("project_contracts")
      .select("project_id, commencement_date, data"),
  ]);

  if (!ev) return null;

  const contracts = new Map<string, any>();
  (contractRows ?? []).forEach((c: any) => contracts.set(c.project_id, c));

  return {
    eventId,
    flag: eventFlag(ev as any, contracts),
    noticeSubmitted: (ev as any).notice_date != null,
    detailedSubmitted: (ev as any).submission_date != null,
    occurredOn: (ev as any).occurred_on ?? null,
  };
}
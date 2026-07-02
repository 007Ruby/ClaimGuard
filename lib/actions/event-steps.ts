"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { STEP_DATE_FIELD, CLOSING_STEPS } from "@/lib/fidic/clauses";

function touch() {
  revalidatePath("/events"); revalidatePath("/"); revalidatePath("/whats-next");
}

/**
 * Records that a step was completed on `date`, writes the mapped date column,
 * advances the chain (last_completed_step_id), and closes the event if the step
 * is terminal. The engine reads these fields on next render and moves to the
 * next step automatically.
 */
export async function advanceEventStep(eventId: string, stepId: string, date: string) {
  await getSessionContext();
  const supabase = await createClient();
  if (!eventId || !stepId) return { ok: false as const, error: "missing eventId/stepId" };

  const update: Record<string, any> = { last_completed_step_id: stepId };
  const dateField = STEP_DATE_FIELD[stepId];
  if (dateField) update[dateField] = date || null;
  if (CLOSING_STEPS.has(stepId)) update.closed = true;

  const { error } = await supabase.from("events").update(update).eq("id", eventId);
  if (error) return { ok: false as const, error: error.message };
  touch();
  return { ok: true as const };
}

/** Undo: clear all step progress on an event back to the start. */
export async function resetEventSteps(eventId: string) {
  await getSessionContext();
  const supabase = await createClient();
  if (!eventId) return { ok: false as const, error: "missing eventId" };
  const { error } = await supabase.from("events").update({
    last_completed_step_id: null,
    notice_date: null,
    submission_date: null,
    engineer_receipt_date: null,
    ipc_issued_date: null,
    suspension_notice_date: null,
    closed: false,
  }).eq("id", eventId);
  if (error) return { ok: false as const, error: error.message };
  touch();
  return { ok: true as const };
}
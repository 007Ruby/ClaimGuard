"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import {
  STEP_DATE_FIELD,
  STEP_RECEIPT_FIELD,
  STEP_AMOUNT_FIELD,
} from "@/lib/fidic/clauses";

function touch() {
  revalidatePath("/events"); revalidatePath("/"); revalidatePath("/whats-next");
  revalidatePath("/follow-ups");
}

export interface StepCompletion {
  /** The date the step was performed. */
  date: string;
  /**
   * For steps that transmit something to the Engineer: the date they received
   * it. Defaults to `date` (same-day for digital transmission). This is the
   * anchor SC 14.6, 14.7 and the 20.1 response all run from, so it matters
   * whenever despatch and receipt diverge.
   */
  receiptDate?: string | null;
  /** For 14.6-ipc (sum certified) and 14.7-payment (sum received). */
  amount?: number | null;
}

/**
 * Records that a step was completed, writing the mapped columns.
 *
 * Step position is DERIVED by the engine from these columns — there is no
 * pointer to advance, and no step writes `closed`. The engine closes an event
 * when its terminal step is satisfied; `closed` is a manual user override
 * only (withdrawn / superseded / settled).
 */
/** Older call sites pass a bare date string; both shapes are accepted. */
export type StepCompletionInput = string | StepCompletion;

function normalizeCompletion(input: StepCompletionInput): StepCompletion {
  return typeof input === "string" ? { date: input } : input;
} 
export async function advanceEventStep(
  eventId: string,
  stepId: string,
  input: StepCompletionInput,
) {
  const completion = normalizeCompletion(input);
  await getSessionContext();
  const supabase = await createClient();
  if (!eventId || !stepId) return { ok: false as const, error: "missing eventId/stepId" };

  const update: Record<string, any> = {};

  const dateField = STEP_DATE_FIELD[stepId];
  if (dateField) update[dateField] = completion.date || null;
  if (dateField && !update[dateField]) {
    return { ok: false as const, error: `no date supplied for ${stepId}` };
  }
  const receiptField = STEP_RECEIPT_FIELD[stepId];
  if (receiptField) {
    // Never leave the anchor null when we know the despatch date — an
    // unrecorded receipt would silently stop the counterparty's clock.
    update[receiptField] = completion.receiptDate || completion.date || null;
  }

  const amountField = STEP_AMOUNT_FIELD[stepId];
  if (amountField && completion.amount != null) update[amountField] = completion.amount;

  if (Object.keys(update).length === 0) {
    return { ok: false as const, error: `unknown step: ${stepId}` };
  }

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
    notice_date: null,
    submission_date: null,
    engineer_receipt_date: null,
    engineer_response_date: null,
    determination_date: null,
    ipc_issued_date: null,
    certified_amount: null,
    payment_received_date: null,
    amount_received: null,
    suspension_notice_date: null,
    closed: false,
  }).eq("id", eventId);
  if (error) return { ok: false as const, error: error.message };
  touch();
  return { ok: true as const };
}
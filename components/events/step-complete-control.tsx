"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advanceEventStep } from "@/lib/actions/event-steps";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * "Mark done" for the current step. Reveals a date picker, records the completion
 * via advanceEventStep, then refreshes so the engine moves to the next step.
 *
 * onCompleted: optional. Runs AFTER the step write succeeds, receiving the chosen
 *   date. Return { error } to surface a problem and keep the picker open. Used by
 *   the claim flow to flip the claim's status in the same action.
 * initialDate: optional. Pre-fills the picker (e.g. when correcting an existing
 *   served date) instead of defaulting to today.
 */
export function StepCompleteControl({
  eventId, stepId, label, size = "sm", onCompleted, initialDate,
}: {
  eventId: string;
  stepId: string;
  label: string;
  size?: "sm" | "default";
  onCompleted?: (date: string) => Promise<{ error?: string } | void> | { error?: string } | void;
  initialDate?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(initialDate ?? today());
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function confirm() {
    start(async () => {
      const res = await advanceEventStep(eventId, stepId, date);
      if (!res.ok) { setErr(res.error ?? "Failed"); return; }
      if (onCompleted) {
        const r = await onCompleted(date);
        if (r && "error" in r && r.error) { setErr(r.error); return; }
      }
      setErr(null); setOpen(false); router.refresh();
    });
  }

  if (!open) {
    return (
      <Button type="button" size={size} className="w-full" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <div className="flex gap-2">
        <Button type="button" size={size} onClick={confirm} disabled={pending}>
          {pending ? "Saving…" : "Confirm"}
        </Button>
        <Button type="button" size={size} variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {err && <p className="text-xs text-amber-600">{err}</p>}
    </div>
  );
}
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
 * "Mark done" for the current step. Reveals a date picker (defaulting to today),
 * records the completion via advanceEventStep, and refreshes so the engine moves
 * the event to the next step.
 */
export function StepCompleteControl({
  eventId, stepId, label, size = "sm",
}: { eventId: string; stepId: string; label: string; size?: "sm" | "default" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(today());
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function confirm() {
    start(async () => {
      const res = await advanceEventStep(eventId, stepId, date);
      if (!res.ok) { setErr(res.error ?? "Failed"); return; }
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
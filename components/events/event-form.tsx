"use client";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";import { createEvent } from "@/lib/actions/events";
import { usePersistentState } from "@/lib/use-persistent-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORIES = [["variation","Variation"],["delay","Delay"],["payment","Payment"],["instruction","Instruction"],["site_issue","Site issue"],["other","Other"]] as const;
const VALID = CATEGORIES.map(([v]) => v) as string[];
function normType(t?: string) {
  const v = (t ?? "").toLowerCase().trim();
  return VALID.includes(v) ? v : "other";
}

type Draft = { title: string; description: string; type: string; occurred_on: string };
const EMPTY: Draft = { title: "", description: "", type: "other", occurred_on: "" };
type Initial = { title?: string; type?: string; occurred_on?: string; description?: string };

export function EventForm({ initial }: { initial?: Initial }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("return_to");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fromAI = !!initial;

  // AI prefill is the form's initial state (deterministic from URL → no hydration issue,
  // and no restore/persist so it can't be clobbered by a saved manual draft).
  const seed: Draft = fromAI
    ? {
        title: initial!.title ?? "",
        description: initial!.description ?? "",
        type: normType(initial!.type),
        occurred_on: initial!.occurred_on ?? "",
      }
    : EMPTY;

  const [draft, setDraft, clearDraft] = usePersistentState<Draft>(
    "event-draft", seed, { restore: !fromAI, persist: !fromAI }
  );

  function patch(p: Partial<Draft>) { setDraft((d) => ({ ...d, ...p })); }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("title", draft.title);
    fd.set("description", draft.description);
    fd.set("type", draft.type);
    fd.set("occurred_on", draft.occurred_on);
    start(async () => {
      const res = await createEvent(fd);
       if (res?.error) { setError(res.error); return; }
      setError(null);
      if (fromAI) {
        if (returnTo === "inbox" && res.id) router.replace(`/inbox?linked_event=${res.id}`);
        else router.replace("/events");                // drop ?new params, back to the plain form
      } else { clearDraft(); setDraft(EMPTY); }
    });
  }

  return (
    <Card className={fromAI ? "border-primary" : undefined}>
      <CardHeader>
        <CardTitle>{fromAI ? "New event — from AI suggestion (review & save)" : "New event"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="title">Title</Label>
            <Input id="title" value={draft.title} onChange={(e) => patch({ title: e.target.value })} required /></div>
          <div className="space-y-1.5"><Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={3} value={draft.description} onChange={(e) => patch({ description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label htmlFor="occurred_on">Event date</Label>
              <Input id="occurred_on" type="date" value={draft.occurred_on} onChange={(e) => patch({ occurred_on: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Category</Label>
              <Select value={draft.type} onValueChange={(v) => patch({ type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select></div>
          </div>
          {error && <p className="text-sm text-amber-600">{error}</p>}
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save event"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
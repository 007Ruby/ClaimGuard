"use client";
import { useRef, useState, useTransition } from "react";
import { createClaim } from "@/lib/actions/claims";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TYPES = [
  ["variation_change", "Variation / Change"], ["delay_eot", "Delay / EOT"],
  ["payment_dispute", "Payment dispute"], ["disruption", "Disruption"],
  ["acceleration", "Acceleration"], ["backcharge", "Backcharge"],
] as const;

export function ClaimForm({ events }: { events: { id: string; title: string }[] }) {
  const [pending, start] = useTransition();
  const [type, setType] = useState("variation_change");
  const [selected, setSelected] = useState<string[]>([]);
  const ref = useRef<HTMLFormElement>(null);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("type", type);
    selected.forEach((id) => fd.append("event_ids", id));
    start(async () => {
      await createClaim(fd);
      ref.current?.reset();
      setType("variation_change");
      setSelected([]);
    });
  }

  return (
    <Card>
      <CardHeader><CardTitle>New claim</CardTitle></CardHeader>
      <CardContent>
        <form ref={ref} onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required />
          </div>
          <div className="space-y-1.5">
            <Label>Claim type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="body">Description</Label>
            <Textarea id="body" name="body" rows={4} />
          </div>
          <div className="space-y-2">
            <Label>Related events</Label>
            {events.length === 0 && <p className="text-sm text-muted-foreground">No events to link yet.</p>}
            <div className="space-y-2">
              {events.map((ev) => (
                <label key={ev.id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={selected.includes(ev.id)} onCheckedChange={() => toggle(ev.id)} />
                  {ev.title}
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save claim"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
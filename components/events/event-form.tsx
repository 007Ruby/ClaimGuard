"use client";
import { useRef, useState, useTransition } from "react";
import { createEvent } from "@/lib/actions/events";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORIES = [["variation","Variation"],["delay","Delay"],["payment","Payment"],["instruction","Instruction"],["site_issue","Site issue"],["other","Other"]] as const;

type Initial = { title?: string; type?: string; occurred_on?: string; description?: string };

export function EventForm({ initial }: { initial?: Initial }) {
  const [pending, start] = useTransition();
  const [type, setType] = useState(initial?.type ?? "other");
  const ref = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("type", type);
    start(async () => { await createEvent(fd); ref.current?.reset(); setType("other"); });
  }

  return (
    <Card className={initial ? "border-primary" : undefined}>
      <CardHeader>
        <CardTitle>{initial ? "New event — from AI suggestion (review & save)" : "New event"}</CardTitle>
      </CardHeader>
      <CardContent>
        <form ref={ref} onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="title">Title</Label>
            <Input id="title" name="title" defaultValue={initial?.title ?? ""} required /></div>
          <div className="space-y-1.5"><Label htmlFor="description">Description</Label>
            <Textarea id="description" name="description" rows={3} defaultValue={initial?.description ?? ""} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label htmlFor="occurred_on">Event date</Label>
              <Input id="occurred_on" name="occurred_on" type="date" defaultValue={initial?.occurred_on ?? ""} /></div>
            <div className="space-y-1.5"><Label>Category</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select></div>
          </div>
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save event"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
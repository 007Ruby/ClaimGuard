"use client";
import { useRef, useState, useTransition } from "react";
import { createInboxItem } from "@/lib/actions/evidence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SOURCES = [["pasted_email", "Pasted email"], ["note", "Note"], ["file", "File upload"]] as const;

export function InboxForm({ events }: { events: { id: string; title: string }[] }) {
  const [pending, start] = useTransition();
  const [source, setSource] = useState("note");
  const [eventId, setEventId] = useState("none");
  const ref = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("source_type", source);
    fd.set("event_id", eventId);
    start(async () => {
      await createInboxItem(fd);
      ref.current?.reset();
      setSource("note");
      setEventId("none");
    });
  }

  return (
    <Card>
      <CardHeader><CardTitle>New inbox item</CardTitle></CardHeader>
      <CardContent>
        <form ref={ref} onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Source type</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="event_date">Event date</Label>
              <Input id="event_date" name="event_date" type="date" />
            </div>
          </div>

          {source === "file" ? (
            <div className="space-y-1.5">
              <Label htmlFor="file">File</Label>
              <Input id="file" name="file" type="file" />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="content">{source === "pasted_email" ? "Pasted email" : "Note"}</Label>
              <Textarea
                id="content" name="content" rows={5}
                placeholder={source === "pasted_email" ? "Paste the email here…" : "e.g. Delay on site on 14 May due to…"}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Linked event</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {events.map((ev) => <SelectItem key={ev.id} value={ev.id}>{ev.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
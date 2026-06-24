"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateEvent, deleteEvent } from "@/lib/actions/events";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EventStatusFlag, type EventFlag } from "@/components/events/event-status-flag";

const CATEGORIES = [["variation","Variation"],["delay","Delay"],["payment","Payment"],["instruction","Instruction"],["site_issue","Site issue"],["other","Other"]] as const;
const LABEL: Record<string,string> = Object.fromEntries(CATEGORIES);

type EventItem = {
  id: string; title: string; type: string; description: string | null; occurred_on: string | null;
  evidence?: { id: string; title: string | null; source_type: string }[];
};

export function EventsList({ events, openId, flags }: { events: EventItem[]; openId?: string; flags?: Record<string, EventFlag> }) {
  const [active, setActive] = useState<string | null>(openId ?? null);
  const current = events.find((e) => e.id === active) ?? null;

  return (
    <>
      <div className="space-y-4">
        {events.length === 0 && <p className="text-sm text-muted-foreground">No events yet.</p>}
        {events.map((e) => (
          <Card key={e.id} className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => setActive(e.id)}>
            <CardHeader>
              <CardTitle className="text-base">{e.title}</CardTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{e.occurred_on ?? "No date"}</span>
                <Badge variant="secondary">{LABEL[e.type] ?? e.type}</Badge>
                {/* FIDIC obligation flag — stopPropagation so its popover opens
                    instead of the card's edit dialog. */}
                {flags?.[e.id] && (
                  <span onClick={(c) => c.stopPropagation()}>
                    <EventStatusFlag flag={flags[e.id]} />
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {e.description && <p className="text-sm">{e.description}</p>}
              <div>
                <p className="text-xs font-medium text-muted-foreground">{e.evidence?.length ?? 0} linked inbox item(s)</p>
                <ul className="mt-1 space-y-1">
                  {(e.evidence ?? []).slice(0, 5).map((ev) => (
                    <li key={ev.id} className="text-sm">
                      <Link href={`/inbox?open=${ev.id}`} onClick={(c) => c.stopPropagation()} className="hover:underline">
                        • {ev.title || "(untitled)"} <span className="text-muted-foreground">({ev.source_type})</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!current} onOpenChange={(o) => { if (!o) setActive(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit event</DialogTitle></DialogHeader>
          {current && <EventEditForm key={current.id} event={current} onClose={() => setActive(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function EventEditForm({ event, onClose }: { event: EventItem; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [type, setType] = useState(event.type);
  const [confirmDel, setConfirmDel] = useState(false);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("id", event.id); fd.set("type", type);
    start(async () => { await updateEvent(fd); router.refresh(); onClose(); });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5"><Label htmlFor="e-title">Title</Label>
        <Input id="e-title" name="title" defaultValue={event.title} required /></div>
      <div className="space-y-1.5"><Label htmlFor="e-desc">Description</Label>
        <Textarea id="e-desc" name="description" rows={3} defaultValue={event.description ?? ""} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label htmlFor="e-date">Event date</Label>
          <Input id="e-date" name="occurred_on" type="date" defaultValue={event.occurred_on ?? ""} /></div>
        <div className="space-y-1.5"><Label>Category</Label>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{CATEGORIES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select></div>
      </div>
      <div className="flex items-center justify-between pt-2">
        {confirmDel ? (
          <div className="flex items-center gap-2">
            <Button type="button" variant="destructive" disabled={pending}
              onClick={() => start(async () => { await deleteEvent(event.id); router.refresh(); onClose(); })}>Confirm delete</Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmDel(false)}>Cancel</Button>
          </div>
        ) : (
          <Button type="button" variant="outline" onClick={() => setConfirmDel(true)}>Delete</Button>
        )}
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  );
}
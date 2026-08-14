"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updateInboxItem, deleteInboxItem } from "@/lib/actions/evidence";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { FlagChips } from "@/components/inbox/flag-chips";

const SOURCES = [["pasted_email","Pasted email"],["note","Note"],["file","File upload"]] as const;
const SOURCE_LABEL: Record<string,string> = Object.fromEntries(SOURCES);

type InboxItem = {
  id: string; title: string | null; content: string | null; source_type: string;
  event_date: string | null; file_path: string | null; created_at: string;
  ai_notes: string | null; alignment: string | null;
  clarity: string | null; suggested_query: string | null;
  event: { id: string; title: string } | null;
};

export function InboxList({ items, events, openId }: { items: InboxItem[]; events: { id: string; title: string }[]; openId?: string }) {
  const [active, setActive] = useState<string | null>(openId ?? null);
  const current = items.find((i) => i.id === active) ?? null;

  return (
    <>
      <div className="space-y-4">
        {items.length === 0 && <p className="text-sm text-muted-foreground">No inbox items yet.</p>}
        {items.map((it) => (
          <Card key={it.id} className="cursor-pointer transition-colors hover:bg-muted/40" onClick={() => setActive(it.id)}>
            <CardHeader className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">{it.title || "(untitled)"}</CardTitle>
                <div className="flex items-center gap-2">
                  <FlagChips
                    alignment={it.alignment}
                    clarity={it.clarity}
                    why={it.ai_notes}
                    suggestedQuery={it.suggested_query}
                    evidenceId={it.id}
                  />
                  <Badge variant={it.event ? "default" : "secondary"}>{it.event ? "Linked" : "Unlinked"}</Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {SOURCE_LABEL[it.source_type] ?? it.source_type}
                {it.event_date ? ` · event ${it.event_date}` : ""}
                {` · added ${formatDate(it.created_at)}`}
              </p>
              {it.event && (
                <p className="text-xs">
                  <Link href={`/events?open=${it.event.id}`} onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:underline">
                    → {it.event.title}
                  </Link>
                </p>
              )}
            </CardHeader>
            <CardContent className="space-y-2">
              {it.content && <p className="line-clamp-3 text-sm">{it.content}</p>}
              {it.file_path && <p className="text-sm text-muted-foreground">Attachment: {it.file_path.split("/").pop()}</p>}
              {it.ai_notes && (
                <div className="rounded-md border border-dashed p-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Further info</span>
                  <p className="mt-1 line-clamp-3">{it.ai_notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!current} onOpenChange={(o) => { if (!o) setActive(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit inbox item</DialogTitle></DialogHeader>
          {current && <InboxEditForm key={current.id} item={current} events={events} onClose={() => setActive(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function InboxEditForm({ item, events, onClose }: { item: InboxItem; events: { id: string; title: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [source, setSource] = useState(item.source_type);
  const [eventId, setEventId] = useState(item.event?.id ?? "none");
  const [alignment, setAlignment] = useState(item.alignment ?? "");
  const [clarity, setClarity] = useState(item.clarity ?? "");
  const [confirmDel, setConfirmDel] = useState(false);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("id", item.id); fd.set("source_type", source); fd.set("event_id", eventId);
    // These come from shadcn Selects (not native inputs) so they must be set
    // explicitly — previously `alignment` was never written and got wiped on
    // every edit. suggested_query has no editor here, so preserve it as-is.
    fd.set("alignment", alignment);
    fd.set("clarity", clarity);
    fd.set("suggested_query", item.suggested_query ?? "");
    start(async () => { await updateInboxItem(fd); router.refresh(); onClose(); });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5"><Label htmlFor="i-title">Title</Label>
        <Input id="i-title" name="title" defaultValue={item.title ?? ""} required /></div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Source type</Label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{SOURCES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="space-y-1.5"><Label htmlFor="i-date">Event date</Label>
          <Input id="i-date" name="event_date" type="date" defaultValue={item.event_date ?? ""} /></div>
      </div>
      {source === "file" ? (
        <p className="text-sm text-muted-foreground">
          {item.file_path ? `Attachment: ${item.file_path.split("/").pop()}` : "No file attached."} (re-upload coming later)
        </p>
      ) : (
        <div className="space-y-1.5"><Label htmlFor="i-content">{source === "pasted_email" ? "Pasted email" : "Note"}</Label>
          <Textarea id="i-content" name="content" rows={5} defaultValue={item.content ?? ""} /></div>
      )}
      <div className="space-y-1.5"><Label>Linked event</Label>
        <Select value={eventId} onValueChange={setEventId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {events.map((ev) => <SelectItem key={ev.id} value={ev.id}>{ev.title}</SelectItem>)}
          </SelectContent>
        </Select></div>
      <div className="space-y-1.5">
        <Label htmlFor="i-ai_notes">Further info</Label>
        <Textarea id="i-ai_notes" name="ai_notes" rows={4} defaultValue={item.ai_notes ?? ""} />
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Alignment</Label>
            <Select value={alignment || "unset"} onValueChange={(v) => setAlignment(v === "unset" ? "" : v)}>
              <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder="— none —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">— none —</SelectItem>
                <SelectItem value="aligned">Aligned</SelectItem>
                <SelectItem value="contentious">Contentious</SelectItem>
                <SelectItem value="against_contract">Against contract</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Clarity</Label>
            <Select value={clarity || "unset"} onValueChange={(v) => setClarity(v === "unset" ? "" : v)}>
              <SelectTrigger className="h-8 w-[140px]"><SelectValue placeholder="— none —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">— none —</SelectItem>
                <SelectItem value="clear">Clear</SelectItem>
                <SelectItem value="unclear">Unclear</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between pt-2">
        {confirmDel ? (
          <div className="flex items-center gap-2">
            <Button type="button" variant="destructive" disabled={pending}
              onClick={() => start(async () => { await deleteInboxItem(item.id); router.refresh(); onClose(); })}>Confirm delete</Button>
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
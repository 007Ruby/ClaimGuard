"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createInboxItem } from "@/lib/actions/evidence";
import { resolveSuggestion } from "@/lib/actions/suggestions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles } from "lucide-react";

const SOURCES = [["pasted_email","Pasted email"],["note","Note"],["file","File upload"]] as const;

type Suggestion = {
  title?: string; event_date?: string | null; summary?: string; confidence?: string;
  event_decision?: {
    action: "link" | "create" | "ask"; event_id?: string | null; reason?: string;
    new_event?: { title?: string; type?: string; occurred_on?: string | null; description?: string } | null;
  };
};

export function InboxForm({ events }: { events: { id: string; title: string }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [source, setSource] = useState("note");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventId, setEventId] = useState("none");

  const [analyzing, setAnalyzing] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggestionId, setSuggestionId] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  function reset() {
    setSource("note"); setTitle(""); setContent(""); setEventDate(""); setEventId("none");
    setSuggestion(null); setSuggestionId(null); setAiError(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("source_type", source); fd.set("event_id", eventId);
    fd.set("title", title); fd.set("content", content); fd.set("event_date", eventDate);
    start(async () => { await createInboxItem(fd); reset(); router.refresh(); });
  }

  async function analyze() {
    setAnalyzing(true); setAiError(null); setSuggestion(null);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_type: source, content }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSuggestion(data.suggestion); setSuggestionId(data.suggestionId);
    } catch {
      setAiError("Couldn't get a suggestion. You can still enter the details manually.");
    } finally { setAnalyzing(false); }
  }

  function accept() {
    if (!suggestion) return;
    if (suggestion.title) setTitle(suggestion.title);
    if (suggestion.event_date) setEventDate(suggestion.event_date);
    const dec = suggestion.event_decision;
    if (dec?.action === "link" && dec.event_id) setEventId(dec.event_id);
    if (suggestionId) resolveSuggestion(suggestionId, true);
    // For 'create' / 'ask' we keep the panel so its CTA / note stays visible.
    if (dec?.action !== "create" && dec?.action !== "ask") setSuggestion(null);
  }

  function reject() {
    if (suggestionId) resolveSuggestion(suggestionId, false);
    setSuggestion(null);
  }

  function goCreateEvent() {
    const ne = suggestion?.event_decision?.new_event;
    const params = new URLSearchParams({ new: "1" });
    if (ne?.title) params.set("title", ne.title);
    if (ne?.type) params.set("type", ne.type);
    if (ne?.occurred_on) params.set("occurred_on", ne.occurred_on);
    if (ne?.description) params.set("description", ne.description);
    router.push(`/events?${params.toString()}`);
  }

  const canAnalyze = source !== "file" && content.trim().length > 0 && !analyzing;

  return (
    <Card>
      <CardHeader><CardTitle>New inbox item</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Source type</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SOURCES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label htmlFor="event_date">Event date</Label>
              <Input id="event_date" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} /></div>
          </div>

          {source === "file" ? (
            <div className="space-y-1.5"><Label htmlFor="file">File</Label>
              <Input id="file" name="file" type="file" /></div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="content">{source === "pasted_email" ? "Pasted email" : "Note"}</Label>
                <Button type="button" size="sm" variant="secondary" onClick={analyze} disabled={!canAnalyze}>
                  <Sparkles className="mr-1 h-4 w-4" />{analyzing ? "Analyzing…" : "Analyze with AI"}
                </Button>
              </div>
              <Textarea id="content" value={content} onChange={(e) => setContent(e.target.value)} rows={5}
                placeholder={source === "pasted_email" ? "Paste the email here…" : "e.g. Delay on site on 14 May due to…"} />
            </div>
          )}

          <div className="space-y-1.5"><Label>Linked event</Label>
            <Select value={eventId} onValueChange={setEventId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {events.map((ev) => <SelectItem key={ev.id} value={ev.id}>{ev.title}</SelectItem>)}
              </SelectContent>
            </Select></div>

          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
        </form>

        {aiError && <p className="mt-4 text-sm text-amber-600">{aiError}</p>}

        {suggestion && (
          <div className="mt-4 rounded-lg border border-dashed p-4">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">AI suggestion</span>
              {suggestion.confidence && <span className="text-xs text-muted-foreground">({suggestion.confidence} confidence)</span>}
            </div>
            {suggestion.summary && <p className="text-sm">{suggestion.summary}</p>}
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {suggestion.title && <li>Title: {suggestion.title}</li>}
              {suggestion.event_date && <li>Event date: {suggestion.event_date}</li>}
              {suggestion.event_decision?.reason && <li>Event: {suggestion.event_decision.reason}</li>}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={accept}>Accept</Button>
              <Button type="button" size="sm" variant="ghost" onClick={reject}>Reject</Button>
              {suggestion.event_decision?.action === "create" && (
                <Button type="button" size="sm" variant="outline" onClick={goCreateEvent}>Create suggested event</Button>
              )}
            </div>
            {suggestion.event_decision?.action === "ask" && (
              <p className="mt-2 text-xs text-amber-600">No clear matching event — pick one above, or create your own.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
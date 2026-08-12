"use client";
import { useState, useTransition, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createInboxItem } from "@/lib/actions/evidence";
import { resolveSuggestion } from "@/lib/actions/suggestions";
import { usePersistentState } from "@/lib/use-persistent-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";

const SOURCES = [["pasted_email","Pasted email"],["note","Note"],["file","File upload"]] as const;

const ALIGN = {
  aligned: { label: "Aligned", className: "bg-emerald-100 text-emerald-800 border-emerald-200", Icon: ShieldCheck },
  contentious: { label: "Contentious", className: "bg-amber-100 text-amber-900 border-amber-200", Icon: ShieldAlert },
  against_contract: { label: "Against contract", className: "bg-red-100 text-red-800 border-red-200", Icon: ShieldX },
} as const;
type Alignment = keyof typeof ALIGN;

type Suggestion = {
  title?: string;
  event_date?: string | null;
  summary?: string;
  confidence?: string;
  category?: string;
  event_decision?: {
    action: "link" | "create" | "ask";
    event_id?: string | null;
    match_score?: number;
    reason?: string;
    new_event?: { title?: string; type?: string; occurred_on?: string | null; description?: string } | null;
  };
};

type Draft = {
  source: string; title: string; content: string;
  eventDate: string; eventId: string; filePath: string;
  aiNotes: string; alignment: string;
  suggestion: Suggestion | null; suggestionId: string | null;
};
const EMPTY: Draft = {
  source: "note", title: "", content: "",
  eventDate: "", eventId: "none", filePath: "", aiNotes: "", alignment: "",
  suggestion: null, suggestionId: null,
};

function looksLikeEmail(text: string): boolean {
  const t = text.trim();
  if (t.length < 20) return false;
  const greeting = /^(dear|hi|hello|good\s+(morning|afternoon|evening)|to\s+whom)\b/i.test(t);
  const tail = t.slice(-140);
  const signoff = /(kind regards|best regards|warm regards|regards|sincerely|yours (faithfully|sincerely|truly)|many thanks|thank you|thanks|cheers|best wishes)/i.test(tail);
  return greeting || signoff;
}

// The clean event name for the "Event: …" line — new event's title on a create,
// or the matched event's title (looked up from the events list) on a link.
function eventName(s: Suggestion, events: { id: string; title: string }[]): string | null {
  const dec = s.event_decision;
  if (!dec) return null;
  if (dec.action === "create") return dec.new_event?.title || s.title || null;
  if (dec.event_id) return events.find((e) => e.id === dec.event_id)?.title ?? null;
  return null;
}

function AlignmentBadge({ value }: { value: Alignment }) {
  const { label, className, Icon } = ALIGN[value];
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold ${className}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

export function InboxForm({ events }: { events: { id: string; title: string }[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const [draft, setDraft, clearDraft] = usePersistentState<Draft>("inbox-draft", EMPTY);

  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // PDF extraction state
  const [extracting, setExtracting] = useState(false);
  const [extractMsg, setExtractMsg] = useState<string | null>(null);

  function patch(p: Partial<Draft>) { setDraft((d) => ({ ...d, ...p })); }

  // On return from creating a suggested event, stamp the new event onto the draft
  // and flip the suggestion to "linked". setTimeout(0) lets the persisted-state
  // restore land first, so this write isn't clobbered by hydration.
  const linkedParam = searchParams.get("linked_event");
  useEffect(() => {
    if (!linkedParam) return;
    const t = setTimeout(() => {
      setDraft((d) => ({
        ...d,
        eventId: linkedParam,
        suggestion: d.suggestion?.event_decision
          ? { ...d.suggestion, event_decision: { ...d.suggestion.event_decision, action: "link", event_id: linkedParam } }
          : d.suggestion,
      }));
      router.replace("/inbox");
    }, 0);
    return () => clearTimeout(t);
  }, [linkedParam]); // eslint-disable-line react-hooks/exhaustive-deps

  function onContent(v: string) { patch({ content: v }); }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf") { setExtractMsg("PDF only for now."); return; }
    setExtracting(true); setExtractMsg(null); patch({ suggestion: null, suggestionId: null });
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/inbox/extract-pdf", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Extraction failed");
      setDraft((d) => ({
        ...d,
        filePath: data.file_path,
        content: data.text || d.content,
        title: d.title || file.name.replace(/\.pdf$/i, ""),
      }));
      setExtractMsg(
        data.chars > 0
          ? `Uploaded and extracted ${data.chars.toLocaleString()} characters — you can Analyze it now.`
          : "Uploaded, but no text found (scanned PDF?). Add a note describing it.",
      );
    } catch (e: any) {
      setExtractMsg(e?.message ?? "Couldn't process the PDF.");
    } finally { setExtracting(false); }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("source_type", draft.source);
    fd.set("event_id", draft.eventId);
    fd.set("title", draft.title);
    fd.set("content", draft.content);
    fd.set("event_date", draft.eventDate);
    fd.set("ai_notes", draft.aiNotes);
    fd.set("alignment", draft.alignment);
    if (draft.filePath) fd.set("file_path", draft.filePath); // already uploaded by the route
    const usedSuggestionId = draft.suggestionId;
    start(async () => {
      await createInboxItem(fd);
      if (usedSuggestionId) resolveSuggestion(usedSuggestionId, true);
      clearDraft(); setDraft(EMPTY); setExtractMsg(null);
      router.refresh();
    });
  }

  // One press runs both analyses in parallel: the classify+link suggestion AND the
  // contract-alignment "further info". Independent — one failing doesn't sink the other.
  // The suggestion now fills the actual form fields (title, date, source, linked event).
  async function analyze() {
    setAnalyzing(true); setAiError(null); patch({ suggestion: null });
    const payload = JSON.stringify({ source_type: draft.source, content: draft.content });
    const [main, further] = await Promise.allSettled([
      fetch("/api/ai/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload }),
      fetch("/api/ai/inbox/further-info", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload }),
    ]);

    if (main.status === "fulfilled" && main.value.ok) {
      const data = await main.value.json();
      const s: Suggestion = data.suggestion ?? {};
      const dec = s.event_decision;
      // Source type is decided here now (not on paste): keep "file", else infer email vs note.
      const derivedSource = draft.source === "file" ? "file" : (looksLikeEmail(draft.content) ? "pasted_email" : "note");
      patch({
        suggestion: s,
        suggestionId: data.suggestionId ?? null,
        source: derivedSource,
        title: s.title ?? draft.title,
        eventDate: s.event_date ?? draft.eventDate,
        eventId: dec?.action === "link" && dec.event_id ? dec.event_id : draft.eventId,
      });
    } else {
      setAiError("Couldn't get a suggestion. You can still enter the details manually.");
    }

    if (further.status === "fulfilled" && further.value.ok) {
      const f = await further.value.json();
      patch({ aiNotes: f.ai_notes ?? "", alignment: f.alignment ?? "" });
    }

    setAnalyzing(false);
  }

  function dismiss() {
    if (draft.suggestionId) resolveSuggestion(draft.suggestionId, false);
    patch({ suggestion: null, suggestionId: null });
  }

  function goCreateEvent() {
    const ne = draft.suggestion?.event_decision?.new_event;
    const params = new URLSearchParams({ new: "1", ts: Date.now().toString(), return_to: "inbox" });
    if (ne?.title) params.set("title", ne.title);
    if (ne?.type) params.set("type", ne.type);
    if (ne?.occurred_on) params.set("occurred_on", ne.occurred_on);
    if (ne?.description) params.set("description", ne.description);
    router.push(`/events?${params.toString()}`);
  }

  const suggestion = draft.suggestion;
  const canAnalyze = draft.content.trim().length > 0 && !analyzing && !extracting;
  const showContentBlock = draft.source !== "file" || draft.content.trim().length > 0;
  const alignment = (draft.alignment || "") as Alignment | "";
  const evName = suggestion ? eventName(suggestion, events) : null;

  return (
    <Card>
      <CardHeader><CardTitle>New inbox item</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="title">Title</Label>
            <Input id="title" name="title" value={draft.title} onChange={(e) => patch({ title: e.target.value })} required /></div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Source type</Label>
              <Select value={draft.source} onValueChange={(v) => patch({ source: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SOURCES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label htmlFor="event_date">Event date</Label>
              <Input id="event_date" type="date" value={draft.eventDate} onChange={(e) => patch({ eventDate: e.target.value })} /></div>
          </div>

          {draft.source === "file" && (
            <div className="space-y-1.5">
              <Label htmlFor="file">PDF file</Label>
              <Input id="file" name="file" type="file" accept="application/pdf"
                     onChange={(e) => onFile(e.target.files?.[0])} disabled={extracting} />
              {extracting && <p className="text-xs text-muted-foreground">Uploading and extracting text…</p>}
              {extractMsg && <p className="text-xs text-muted-foreground">{extractMsg}</p>}
            </div>
          )}

          {showContentBlock && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="content">
                  {draft.source === "file" ? "Extracted text" : draft.source === "pasted_email" ? "Pasted email" : "Note"}
                </Label>
                <Button type="button" size="sm" variant="secondary" onClick={analyze} disabled={!canAnalyze}>
                  <Sparkles className="mr-1 h-4 w-4" />{analyzing ? "Analyzing…" : "Analyze with AI"}
                </Button>
              </div>
              <Textarea id="content" value={draft.content} onChange={(e) => onContent(e.target.value)} rows={5}
                placeholder={draft.source === "pasted_email" ? "Paste the email here…" : "e.g. Delay on site on 14 May due to…"} />
            </div>
          )}

          {/* Further info — AI contract-alignment notes; fills on Analyze, editable, saved on Save. */}
          <div className="space-y-1.5 rounded-md border border-dashed p-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="ai_notes">
                Further info <span className="font-normal text-muted-foreground">— how this sits against the contract</span>
              </Label>
              {alignment && <AlignmentBadge value={alignment} />}
            </div>
            <Textarea id="ai_notes" value={draft.aiNotes ?? ""} onChange={(e) => patch({ aiNotes: e.target.value })} rows={4}
              placeholder="Filled by Analyze with AI — contract-grounded notes and a flag. You can edit or write your own." />
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Flag</Label>
              <Select value={draft.alignment || "unset"} onValueChange={(v) => patch({ alignment: v === "unset" ? "" : v })}>
                <SelectTrigger className="h-8 w-[190px]"><SelectValue placeholder="— none —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unset">— none —</SelectItem>
                  <SelectItem value="aligned">Aligned</SelectItem>
                  <SelectItem value="contentious">Contentious</SelectItem>
                  <SelectItem value="against_contract">Against contract</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5"><Label>Linked event</Label>
            <Select value={draft.eventId} onValueChange={(v) => patch({ eventId: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {events.map((ev) => <SelectItem key={ev.id} value={ev.id}>{ev.title}</SelectItem>)}
              </SelectContent>
            </Select></div>

          <Button type="submit" disabled={pending || extracting}>{pending ? "Saving…" : "Save"}</Button>
        </form>

        {aiError && <p className="mt-4 text-sm text-amber-600">{aiError}</p>}

        {suggestion && (
          <div className="mt-4 rounded-lg border border-dashed p-4">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">AI suggestion</span>
              {suggestion.confidence && <span className="text-xs text-muted-foreground">({suggestion.confidence} confidence)</span>}
            </div>
            {evName && (
              <p className="text-sm font-medium">
                Event: “{evName}”
                {suggestion.event_decision?.action === "create" && <span className="ml-1 font-normal text-muted-foreground">(new)</span>}
              </p>
            )}
            {suggestion.summary && <p className="mt-1 text-sm text-muted-foreground">{suggestion.summary}</p>}
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {suggestion.title && <li>Title: {suggestion.title}</li>}
              {suggestion.event_date && <li>Event date: {suggestion.event_date}</li>}
              {suggestion.event_decision?.reason && <li>Why: {suggestion.event_decision.reason}</li>}
              {typeof suggestion.event_decision?.match_score === "number" &&
                <li>Match score: {suggestion.event_decision.match_score.toFixed(2)}</li>}
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={dismiss}>Dismiss</Button>
              {suggestion.event_decision?.action === "create" && (
                <Button type="button" size="sm" variant="outline" onClick={goCreateEvent}>Create suggested event</Button>
              )}
            </div>
            {suggestion.event_decision?.action === "ask" && (
              <p className="mt-2 text-xs text-amber-600">No clear matching event — pick one in the dropdown above, or create your own.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
"use client";
import { useEffect, useRef, useState } from "react";
import { usePersistentState } from "@/lib/use-persistent-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Sparkles, Wand2, Copy, Check, AlertTriangle } from "lucide-react";

type AwaitingEvent = {
  id: string; title: string; type: string | null; occurred_on: string | null;
  stepId: string | null; actionLabel: string | null; actionParty: string | null;
  actionDueDate: string | null; clauseRef: string | null; basisClauses: string[];
};

type Draft = {
  eventId: string | null;
  recipient: string;
  subject: string;
  keyPointsText: string;
  emailText: string;
};
const EMPTY: Draft = { eventId: null, recipient: "", subject: "", keyPointsText: "", emailText: "" };

function daysRemaining(iso: string | null): number | null {
  if (!iso) return null;
  const due = new Date(iso + "T00:00:00.000Z").getTime();
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((due - today) / 86_400_000);
}

function partyLabel(p: string | null | undefined) {
  return p === "employer" ? "Employer" : "Engineer";
}

export function FollowUpBuilder({
  events,
  initialEventId,
}: {
  events: AwaitingEvent[];
  initialEventId?: string | null;
}) {
  const [draft, setDraft, clearDraft] = usePersistentState<Draft>("followup-draft", EMPTY);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [guard, setGuard] = useState<{ message: string; onProceed: () => void } | null>(null);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const selected = events.find((e) => e.id === draft.eventId) ?? null;
  const party = partyLabel(selected?.actionParty);
  const rem = selected ? daysRemaining(selected.actionDueDate) : null;
  const overdue = rem !== null && rem < 0;

  const arrivedViaAction = !!initialEventId;
  const analyzePrimed = !!draft.eventId && !analyzed && !draft.emailText;

  // Apply the deep-link (?event=) once.
  const appliedLink = useRef<string | null>(null);
  useEffect(() => {
    if (!initialEventId) return;
    if (appliedLink.current === initialEventId) return;
    appliedLink.current = initialEventId;
    setAnalyzed(false);
    setDraft((d) => ({ ...d, eventId: initialEventId }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEventId]);

  // Default the recipient placeholder from the responsible party when empty.
  useEffect(() => {
    if (selected && !draft.recipient.trim()) {
      patch({ recipient: `[${partyLabel(selected.actionParty)}]` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.eventId]);

  function selectEvent(id: string) {
    setAnalyzed(false);
    patch({ eventId: id, recipient: `[${partyLabel(events.find((e) => e.id === id)?.actionParty)}]` });
  }

  async function analyze() {
    if (!selected) { setErr("Select the event you're following up on first."); return; }
    setAnalyzing(true); setErr(null);
    try {
      const res = await fetch("/api/ai/followup/outline", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: selected.id, party: selected.actionParty,
          action_label: selected.actionLabel, clause_ref: selected.clauseRef,
          due_date: selected.actionDueDate, days: rem,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      patch({
        subject: data.subject || draft.subject,
        keyPointsText: (data.key_points ?? []).join("\n"),
      });
      setAnalyzed(true);
    } catch {
      setErr("Couldn’t analyze. You can fill the fields in manually.");
    } finally { setAnalyzing(false); }
  }

  function onDraftClick() {
    setErr(null);
    if (!selected) { setErr("Select the event you're following up on."); return; }
    if (!overdue) {
      const due = selected.actionDueDate ?? "the due date";
      const inN = rem !== null ? ` — due in ${rem} day${rem === 1 ? "" : "s"} (on ${due})` : "";
      setGuard({
        message: `This isn't overdue yet${inN}. The ${party} still has time to respond, but you can send a follow-up now to prompt them.`,
        onProceed: runDraft,
      });
      return;
    }
    runDraft();
  }

  async function runDraft() {
    if (!selected) return;
    setDrafting(true); setErr(null); setCopied(false);
    try {
      const res = await fetch("/api/ai/followup/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: selected.id, party: selected.actionParty, recipient: draft.recipient,
          action_label: selected.actionLabel, clause_ref: selected.clauseRef,
          due_date: selected.actionDueDate, days: rem,
          subject: draft.subject,
          key_points: draft.keyPointsText.split("\n").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      patch({ emailText: data.email ?? "" });
    } catch {
      setErr("Couldn’t draft the email. You can still write it manually below.");
    } finally { setDrafting(false); }
  }

  async function copy() {
    if (!draft.emailText.trim()) return;
    try {
      await navigator.clipboard.writeText(draft.emailText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setErr("Couldn’t copy — select the text and copy manually.");
    }
  }

  function startAnother() {
    clearDraft(); setDraft(EMPTY); setAnalyzed(false); appliedLink.current = null;
  }

  return (
    <Card>
      <CardHeader><CardTitle>Draft a follow-up</CardTitle></CardHeader>
      <CardContent className="space-y-6">

        {/* ---- Which outstanding item ---- */}
        <div className="space-y-1.5">
          <Label>What are you following up on?</Label>
          <Select value={draft.eventId ?? ""} onValueChange={selectEvent}>
            <SelectTrigger><SelectValue placeholder="Select an awaited action" /></SelectTrigger>
            <SelectContent>
              {events.map((ev) => (
                <SelectItem key={ev.id} value={ev.id}>
                  {ev.title}{ev.actionLabel ? ` — ${ev.actionLabel}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {events.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing is currently awaiting the Engineer or Employer.</p>
          )}
          {selected && (
            <p className="text-xs text-muted-foreground">
              Waiting on <strong>{party}</strong>
              {selected.clauseRef && <> · SC {selected.clauseRef}</>}
              {selected.actionDueDate && <> · due {selected.actionDueDate}</>}
              {rem !== null && (
                overdue
                  ? <span className="ml-1 font-semibold text-red-600"><AlertTriangle className="mr-0.5 inline h-3 w-3" />{Math.abs(rem)}d overdue</span>
                  : <span className="ml-1">· {rem}d left (not yet overdue)</span>
              )}
            </p>
          )}
        </div>

        {/* ---- Primed hint ---- */}
        {analyzePrimed && (
          <div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/40 p-3 text-sm">
            <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              {arrivedViaAction ? "This event is ready. " : ""}
              Click <strong>Analyze with AI</strong> to fill in the email from the event and its evidence, then edit and draft.
            </span>
          </div>
        )}

        {/* ---- Email skeleton ---- */}
        <div className="grid grid-cols-[120px_1fr] gap-4">
          <div className="space-y-1.5"><Label htmlFor="f-to">To</Label>
            <Input id="f-to" value={draft.recipient} onChange={(e) => patch({ recipient: e.target.value })} placeholder="[Engineer]" /></div>
          <div className="space-y-1.5"><Label htmlFor="f-subject">Subject</Label>
            <Input id="f-subject" value={draft.subject} onChange={(e) => patch({ subject: e.target.value })} placeholder="Filled in by Analyze, or write your own" /></div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="f-points">Key points <span className="text-muted-foreground">(one per line — edit before drafting)</span></Label>
          <Textarea id="f-points" rows={5} value={draft.keyPointsText}
            onChange={(e) => patch({ keyPointsText: e.target.value })}
            placeholder="Filled in by Analyze, or write your own." />
        </div>

        {/* ---- Analyze + Draft ---- */}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant={analyzePrimed ? "default" : "secondary"}
            onClick={analyze} disabled={analyzing || drafting}>
            <Sparkles className="mr-1 h-4 w-4" />{analyzing ? "Analyzing…" : "Analyze with AI"}
          </Button>
          <Button type="button" onClick={onDraftClick} disabled={!selected || drafting}>
            {drafting ? "Drafting…" : "Draft email"}
          </Button>
        </div>

        {/* ---- The email ---- */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="f-body">Email</Label>
            {draft.emailText.trim() && (
              <Button type="button" size="sm" variant="ghost" onClick={copy}>
                {copied ? <><Check className="mr-1 h-4 w-4" />Copied</> : <><Copy className="mr-1 h-4 w-4" />Copy</>}
              </Button>
            )}
          </div>
          <Textarea id="f-body" rows={16} value={draft.emailText}
            onChange={(e) => patch({ emailText: e.target.value })}
            placeholder="The drafted email appears here for you to review, edit and copy — or write it yourself." />
        </div>

        {err && <p className="text-sm text-amber-600">{err}</p>}

        {draft.emailText.trim() && (
          <Button variant="ghost" size="sm" onClick={startAnother}>Start another follow-up</Button>
        )}
      </CardContent>

      {/* ---- Not-yet-overdue popup ---- */}
      <Dialog open={!!guard} onOpenChange={(o) => { if (!o) setGuard(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Not overdue yet</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{guard?.message}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGuard(null)}>Cancel</Button>
            <Button onClick={() => { const g = guard; setGuard(null); g?.onProceed(); }}>Proceed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
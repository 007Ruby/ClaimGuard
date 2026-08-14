"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveRfiDraft, markRfiSent } from "@/lib/actions/rfi";
import { linesToQueries, queriesToText, type RfiQuery } from "@/lib/rfi/types";
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
import { Sparkles, CheckCircle2 } from "lucide-react";
import type { InboxItemOption } from "@/lib/queries/inbox";

export interface EventOption {
  id: string;
  title: string | null;
  type: string | null;
  occurred_on: string | null;
}

type Draft = {
  evidenceId: string | null;
  eventId: string | null;
  recipient: string;
  subject: string;
  background: string;
  queriesText: string;
  draftBody: string;
};
const EMPTY: Draft = {
  evidenceId: null, eventId: null, recipient: "",
  subject: "", background: "", queriesText: "", draftBody: "",
};

/**
 * The RFI page's inline builder — the FollowUpBuilder equivalent. Plain useState
 * (the saved-RFI card list is the persistence layer); a row only exists once you
 * Save. Anchor is an inbox item (evidence) + an optional event link. Arriving via
 * ?evidence= pre-fills from what the inbox AI already found — no auto-Analyze.
 */
export function RfiBuilder({
  inboxItems,
  events,
  initialEvidenceId,
}: {
  inboxItems: InboxItemOption[];
  events: EventOption[];
  initialEvidenceId?: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(EMPTY);

  // AI-supplied queries (with contract refs) from the last Analyze — used only
  // to recover refs positionally on save; the textarea is the edit surface.
  const [analyzedQueries, setAnalyzedQueries] = useState<RfiQuery[]>([]);
  const [aiTouched, setAiTouched] = useState(false);

  const [analyzing, setAnalyzing] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [saving, startSave] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [guard, setGuard] = useState<{ title: string; message: string; onProceed: () => void } | null>(null);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));

  // Pick an inbox item → fresh draft pre-filled from what AI already found in the
  // inbox (title → subject, ai_notes → background, suggested_query → queries, and
  // its linked event). suggested_query is plain text, so no refs yet — press
  // Analyze to have the AI supply per-query clause refs.
  function loadInbox(id: string) {
    setErr(null); setFlash(null); setAiTouched(false); setAnalyzedQueries([]);
    const it = inboxItems.find((i) => i.id === id);
    setDraft({
      ...EMPTY,
      evidenceId: id,
      eventId: it?.eventId ?? null,
      recipient: "The Engineer",
      subject: it?.title ?? "",
      background: it?.aiNotes ?? "",
      queriesText: it?.suggestedQuery ?? "",
    });
  }

  // Apply ?evidence= once on mount (the page also re-keys the builder on it).
  const appliedLink = useRef<string | null>(null);
  useEffect(() => {
    if (!initialEvidenceId) return;
    if (appliedLink.current === initialEvidenceId) return;
    appliedLink.current = initialEvidenceId;
    loadInbox(initialEvidenceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEvidenceId]);

  async function analyze() {
    setAnalyzing(true); setErr(null);
    try {
      const res = await fetch("/api/ai/rfi/outline", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: draft.eventId, evidence_id: draft.evidenceId }),
      });
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      const qs: RfiQuery[] = Array.isArray(data.queries)
        ? data.queries.map((q: any) => ({ question: q.question ?? "", contractRef: q.contract_ref ?? null }))
        : [];
      setAnalyzedQueries(qs);
      setAiTouched(true);
      patch({
        subject: data.subject || draft.subject,
        background: data.background || draft.background,
        queriesText: qs.length ? queriesToText(qs) : draft.queriesText,
      });
    } catch (e: any) {
      setErr(e?.message ?? "Couldn't analyze. You can fill the fields in manually.");
    } finally { setAnalyzing(false); }
  }

  async function runDraft() {
    setDrafting(true); setErr(null);
    try {
      const queries = linesToQueries(draft.queriesText, analyzedQueries);
      const res = await fetch("/api/ai/rfi/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: draft.eventId, evidence_id: draft.evidenceId,
          recipient: draft.recipient, subject: draft.subject, background: draft.background,
          queries: queries.map((q) => ({ question: q.question, contract_ref: q.contractRef ?? null })),
        }),
      });
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      setAiTouched(true);
      patch({ draftBody: data.rfi ?? "" });
    } catch (e: any) {
      setErr(e?.message ?? "Couldn't draft the RFI. You can still write it manually below.");
    } finally { setDrafting(false); }
  }

  function persist(then?: "sent") {
    startSave(async () => {
      const res = await saveRfiDraft({
        evidence_id: draft.evidenceId,
        event_id: draft.eventId,
        recipient: draft.recipient,
        subject: draft.subject,
        background: draft.background,
        queries: linesToQueries(draft.queriesText, analyzedQueries),
        draft_body: draft.draftBody,
        ai_generated: aiTouched,
      });
      if (res.error) { setErr(res.error); return; }
      if (then === "sent") {
        const r = await markRfiSent(res.id!);
        if (r.error) { setErr(r.error); return; }
      }
      setDraft(EMPTY); setAnalyzedQueries([]); setAiTouched(false);
      appliedLink.current = null;
      setFlash(then === "sent"
        ? "Saved and marked as sent — see it in Saved RFIs below."
        : "Saved as draft — see it in Saved RFIs below.");
      setTimeout(() => setFlash(null), 4000);
      router.refresh();
    });
  }

  function save(then?: "sent") {
    setErr(null); setFlash(null);
    const anything =
      draft.subject.trim() || draft.background.trim() ||
      draft.queriesText.trim() || draft.draftBody.trim();
    if (!anything) { setErr("Nothing to save yet — analyze or write the RFI first."); return; }
    const bodyEmpty = !draft.draftBody.trim();
    if (then === "sent" && bodyEmpty) { setErr("Draft the RFI letter before marking this as sent."); return; }
    if (then !== "sent" && bodyEmpty) {
      setGuard({
        title: "RFI letter is empty",
        message: "The drafted RFI is empty. Save this as a draft anyway?",
        onProceed: () => persist(then),
      });
      return;
    }
    persist(then);
  }

  const canAnalyze = (!!draft.evidenceId || !!draft.eventId) && !analyzing && !drafting;

  return (
    <Card>
      <CardHeader><CardTitle>Raise an RFI</CardTitle></CardHeader>
      <CardContent className="space-y-6">

        <div className="space-y-1.5">
          <Label>What is this RFI about?</Label>
          <Select value={draft.evidenceId ?? ""} onValueChange={loadInbox}>
            <SelectTrigger><SelectValue placeholder="Select an inbox item (or leave blank for a manual RFI)" /></SelectTrigger>
            <SelectContent>
              {inboxItems.map((it) => (
                <SelectItem key={it.id} value={it.id}>
                  {it.title || "(untitled)"}
                  {it.clarity === "unclear" ? " · unclear" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {inboxItems.length === 0 && (
            <p className="text-sm text-muted-foreground">No inbox items yet — you can still raise a manual RFI below.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Linked event <span className="text-muted-foreground">(optional)</span></Label>
          <Select value={draft.eventId ?? "none"} onValueChange={(v) => patch({ eventId: v === "none" ? null : v })}>
            <SelectTrigger><SelectValue placeholder="No event linked" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No event linked</SelectItem>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {(e.title ?? "(untitled)") + (e.occurred_on ? ` · ${e.occurred_on}` : "")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-[160px_1fr] gap-4">
          <div className="space-y-1.5"><Label htmlFor="r-to">To</Label>
            <Input id="r-to" value={draft.recipient} onChange={(e) => patch({ recipient: e.target.value })} placeholder="The Engineer" /></div>
          <div className="space-y-1.5"><Label htmlFor="r-subject">Subject</Label>
            <Input id="r-subject" value={draft.subject} onChange={(e) => patch({ subject: e.target.value })} placeholder="Filled by Analyze, or write your own" /></div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="r-background">Background</Label>
          <Textarea id="r-background" rows={3} value={draft.background} onChange={(e) => patch({ background: e.target.value })}
            placeholder="Context for the request — filled by Analyze, or write your own." />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="r-queries">Queries <span className="text-muted-foreground">(one per line)</span></Label>
          <Textarea id="r-queries" rows={5} value={draft.queriesText} onChange={(e) => patch({ queriesText: e.target.value })}
            placeholder="e.g. Please clarify the specified finish for the lobby soffit so we can proceed." />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={analyze} disabled={!canAnalyze}>
            <Sparkles className="mr-1 h-4 w-4" />{analyzing ? "Analyzing…" : "Analyze with AI"}
          </Button>
          <Button type="button" onClick={runDraft} disabled={drafting || analyzing}>
            {drafting ? "Drafting…" : "Draft RFI"}
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="r-body">Drafted RFI</Label>
          <Textarea id="r-body" rows={14} value={draft.draftBody} onChange={(e) => patch({ draftBody: e.target.value })}
            placeholder="The drafted RFI letter appears here to review, edit and save — or write it yourself."
            className="font-mono text-sm" />
        </div>

        {err && <p className="text-sm text-amber-600">{err}</p>}
        {flash && <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> {flash}</p>}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => save()} disabled={saving}>
            {saving ? "Saving…" : "Save as draft"}
          </Button>
          <Button onClick={() => save("sent")} disabled={saving}>
            {saving ? "Saving…" : "Save & mark as sent"}
          </Button>
        </div>
      </CardContent>

      <Dialog open={!!guard} onOpenChange={(o) => { if (!o) setGuard(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{guard?.title ?? "Please confirm"}</DialogTitle></DialogHeader>
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
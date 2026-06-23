"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClaim } from "@/lib/actions/claims";
import { usePersistentState } from "@/lib/use-persistent-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles } from "lucide-react";

const TYPES = [
  ["variation_change", "Variation / Change"], ["delay_eot", "Delay / EOT"],
  ["payment_dispute", "Payment dispute"], ["disruption", "Disruption"],
  ["acceleration", "Acceleration"], ["backcharge", "Backcharge"],
] as const;
const RELIEF = [["money", "Money"], ["time", "Time"], ["both", "Both"]] as const;

type EventLite = { id: string; title: string; type: string; occurred_on: string | null };
type Draft = {
  title: string; type: string; relief: string; amount: string; description: string;
  selected: string[]; keyPointsText: string; claimText: string;
};
const EMPTY: Draft = {
  title: "", type: "variation_change", relief: "money", amount: "", description: "",
  selected: [], keyPointsText: "", claimText: "",
};

export function ClaimBuilder({ events }: { events: EventLite[] }) {
  const router = useRouter();
  const [draft, setDraft, clearDraft] = usePersistentState<Draft>("claim-draft", EMPTY);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, startSave] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const amountNum = () => (draft.amount.trim() ? Number(draft.amount) : null);
  const placeholders = (draft.claimText.match(/\[INSERT/gi) ?? []).length;

  function toggle(id: string) {
    setDraft((d) => ({ ...d, selected: d.selected.includes(id) ? d.selected.filter((x) => x !== id) : [...d.selected, id] }));
  }

  async function analyze() {
    setAnalyzing(true); setErr(null);
    try {
      const res = await fetch("/api/ai/claim/outline", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: draft.description, claim_type: draft.type, relief_sought: draft.relief, amount: amountNum() }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      patch({ selected: data.relevant_event_ids ?? [], keyPointsText: (data.key_points ?? []).join("\n") });
    } catch { setErr("Couldn't analyze. You can select events and write key points manually."); }
    finally { setAnalyzing(false); }
  }

  async function generate() {
    setGenerating(true); setErr(null);
    try {
      const res = await fetch("/api/ai/claim/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title, claim_type: draft.type, relief_sought: draft.relief, amount: amountNum(),
          description: draft.description, event_ids: draft.selected,
          key_points: draft.keyPointsText.split("\n").map((s) => s.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      patch({ claimText: data.claim ?? "" });
    } catch { setErr("Couldn't generate the claim. Try again, or write it manually."); }
    finally { setGenerating(false); }
  }

  function save() {
    if (!draft.title.trim()) { setErr("Give the claim a title before saving."); return; }
    startSave(async () => {
      const res = await createClaim({
        title: draft.title, type: draft.type, relief_sought: draft.relief, amount: amountNum(),
        description: draft.description, body: draft.claimText, ai_generated: !!draft.claimText,
        event_ids: draft.selected,
      });
      if (res?.error) { setErr(res.error); return; }
      clearDraft(); setDraft(EMPTY); router.refresh();
    });
  }

  const canAnalyze = draft.description.trim().length > 0 && !analyzing;
  const canGenerate = draft.selected.length > 0 && !generating;

  return (
    <Card>
      <CardHeader><CardTitle>New claim</CardTitle></CardHeader>
      <CardContent className="space-y-6">

        {/* ---- Stage 1: inputs ---- */}
        <div className="space-y-4">
          <div className="space-y-1.5"><Label htmlFor="c-title">Title</Label>
            <Input id="c-title" value={draft.title} onChange={(e) => patch({ title: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5"><Label>Claim type</Label>
              <Select value={draft.type} onValueChange={(v) => patch({ type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label>Relief sought</Label>
              <Select value={draft.relief} onValueChange={(v) => patch({ relief: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RELIEF.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label htmlFor="c-amount">Amount (AED, optional)</Label>
              <Input id="c-amount" type="number" value={draft.amount} onChange={(e) => patch({ amount: e.target.value })} placeholder="leave blank if unknown" /></div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="c-desc">Description — what is this claim about?</Label>
              <Button type="button" size="sm" variant="secondary" onClick={analyze} disabled={!canAnalyze}>
                <Sparkles className="mr-1 h-4 w-4" />{analyzing ? "Analyzing…" : "Analyze with AI"}
              </Button>
            </div>
            <Textarea id="c-desc" rows={4} value={draft.description} onChange={(e) => patch({ description: e.target.value })}
              placeholder="e.g. The main contractor deducted AED 18,500 from PC07 for cleaning that was not our waste…" />
          </div>
        </div>

        {/* ---- Related events (AI preselects, you edit) ---- */}
        <div className="space-y-2">
          <Label>Related events {draft.selected.length > 0 && <span className="text-muted-foreground">({draft.selected.length} selected)</span>}</Label>
          {events.length === 0 && <p className="text-sm text-muted-foreground">No events to link yet.</p>}
          <div className="space-y-2">
            {events.map((ev) => (
              <label key={ev.id} className="flex items-start gap-2 text-sm">
                <Checkbox checked={draft.selected.includes(ev.id)} onCheckedChange={() => toggle(ev.id)} className="mt-0.5" />
                <span>{ev.title} <span className="text-muted-foreground">· {ev.type}{ev.occurred_on ? ` · ${ev.occurred_on}` : ""}</span></span>
              </label>
            ))}
          </div>
        </div>

        {/* ---- Key points (the spine — edit freely) ---- */}
        <div className="space-y-1.5">
          <Label htmlFor="c-points">Key points <span className="text-muted-foreground">(one per line — edit before generating)</span></Label>
          <Textarea id="c-points" rows={6} value={draft.keyPointsText} onChange={(e) => patch({ keyPointsText: e.target.value })}
            placeholder="Run Analyze to fill these from the selected events, or write your own." />
          <Button type="button" onClick={generate} disabled={!canGenerate}>
            <Sparkles className="mr-1 h-4 w-4" />{generating ? "Generating…" : "Generate claim"}
          </Button>
        </div>

        {/* ---- The claim itself ---- */}
        <div className="space-y-1.5">
          <Label htmlFor="c-body">Claim</Label>
          {placeholders > 0 && (
            <p className="text-xs text-amber-600">{placeholders} missing figure{placeholders === 1 ? "" : "s"} flagged with [INSERT …] — fill these in before issuing.</p>
          )}
          <Textarea id="c-body" rows={14} value={draft.claimText} onChange={(e) => patch({ claimText: e.target.value })}
            placeholder="The generated claim appears here for you to review and edit, or write it yourself." />
        </div>

        {err && <p className="text-sm text-amber-600">{err}</p>}
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save claim"}</Button>
      </CardContent>
    </Card>
  );
}
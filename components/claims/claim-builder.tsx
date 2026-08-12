"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClaim, markClaimSubmitted } from "@/lib/actions/claims";
import {
  getEventClaimContext,
  type EventClaimContext,
} from "@/lib/actions/claim-context";
import { usePersistentState } from "@/lib/use-persistent-state";
import { StepCompleteControl } from "@/components/events/step-complete-control";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Sparkles, AlertTriangle, CheckCircle2, Wand2 } from "lucide-react";

const TYPES = [
  ["variation_change", "Variation / Change"], ["delay_eot", "Delay / EOT"],
  ["payment_dispute", "Payment dispute"], ["disruption", "Disruption"],
  ["acceleration", "Acceleration"], ["backcharge", "Backcharge"],
] as const;
const RELIEF = [["money", "Money"], ["time", "Time"], ["both", "Both"]] as const;

type EventLite = { id: string; title: string; type: string; occurred_on: string | null };

type Draft = {
  modeNotice: boolean;
  modeDetailed: boolean;
  primaryEventId: string | null;
  title: string;
  type: string;
  relief: string;
  amount: string;      // money (AED)
  daysAmount: string;  // NEW — time (days)
  description: string;
  extraEventIds: string[];
  keyPointsText: string;
  generatedText: string;
};

const EMPTY: Draft = {
  modeNotice: false, modeDetailed: false, primaryEventId: null,
  title: "", type: "variation_change", relief: "money",
  amount: "", daysAmount: "", description: "",
  extraEventIds: [], keyPointsText: "", generatedText: "",
};


// Popup precedence — higher wins when several conditions apply at once.
type GuardKind = "timebar" | "particulars" | "already" | "nudge";
const SEVERITY: Record<GuardKind, number> = { timebar: 4, particulars: 3, already: 2, nudge: 1 };

type GuardHit = { kind: GuardKind; which: "notice" | "detailed" };
type GuardModal = { title: string; message: string; onProceed: () => void };

function popupContent(hit: GuardHit): { title: string; message: string } {
  switch (hit.kind) {
    case "timebar":
      return {
        title: "Notice deadline exceeded",
        message:
          "Under Clause 20.1 (FIDIC 1999), notice must be submitted within 28 days of becoming aware of the event. This deadline has been exceeded, so the claim may be time-barred and potentially ineligible.",
      };
    case "particulars":
      return {
        title: "Particulars deadline exceeded",
        message:
          "Under Clause 20.1 (FIDIC 1999), detailed particulars should be submitted within 42 days of the notice of claim. This deadline has been exceeded, which may affect entitlement and the Engineer’s assessment of the claim.",
      };
    case "already":
      return hit.which === "notice"
        ? {
            title: "Notice already submitted",
            message:
              "A notice of claim has already been marked as sent for this event. You can still generate another version.",
          }
        : {
            title: "Detailed claim already submitted",
            message:
              "A detailed claim has already been marked as submitted for this event. You can still generate another version.",
          };
    case "nudge":
      return {
        title: "No notice recorded yet",
        message:
          "No notice of claim is recorded for this event. Under Clause 20.1, a notice normally precedes the detailed particulars. You can still proceed.",
      };
  }
}

export function ClaimBuilder({
  events,
  initialEventId,
  initialIntent,
}: {
  events: EventLite[];
  initialEventId?: string | null;
  initialIntent?: "notice" | "detailed" | null;
}) {
  const router = useRouter();
  const [draft, setDraft, clearDraft] = usePersistentState<Draft>("claim-draft", EMPTY);
  const showQuantum = draft.modeDetailed;                                   // notice-only ⇒ no figures
const showMoney = showQuantum && (draft.relief === "money" || draft.relief === "both");
const showDays  = showQuantum && (draft.relief === "time"  || draft.relief === "both");
  const [context, setContext] = useState<EventClaimContext | null>(null);
  const [loadingCtx, setLoadingCtx] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, startSave] = useTransition();
  const [saved, setSaved] = useState(false);
  const [savedIds, setSavedIds] = useState<{ notice?: string; detailed?: string }>({});
  const [submittedKinds, setSubmittedKinds] = useState<{ notice?: boolean; detailed?: boolean }>({});
  const [savedMode, setSavedMode] = useState<"draft" | "submit" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [guard, setGuard] = useState<GuardModal | null>(null);

  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const amountNum = () => (draft.amount.trim() ? Number(draft.amount) : null);
  const placeholders = (draft.generatedText.match(/\[INSERT/gi) ?? []).length;

  const arrivedViaAction = !!initialEventId;



  // Apply the deep-link (?event=&intent=) once it's known. Authoritative over
  // the persisted draft so "Action" from What's Next lands on the right event.
  const appliedLink = useRef<string | null>(null);
  useEffect(() => {
    if (!initialEventId) return;
    const key = `${initialEventId}:${initialIntent ?? ""}`;
    if (appliedLink.current === key) return;
    appliedLink.current = key;
    setAnalyzed(false);
    setDraft((d) => ({
      ...d,
      primaryEventId: initialEventId,
      extraEventIds: d.extraEventIds.filter((x) => x !== initialEventId),
      modeNotice: initialIntent === "notice" ? true : d.modeNotice,
      modeDetailed: initialIntent === "detailed" ? true : d.modeDetailed,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEventId, initialIntent]);

  // Pull the engine's view + raw toggle state for the selected primary event.
  useEffect(() => {
    if (!draft.primaryEventId) { setContext(null); return; }
    let cancelled = false;
    setLoadingCtx(true);
    getEventClaimContext(draft.primaryEventId)
      .then((ctx) => { if (!cancelled) setContext(ctx); })
      .finally(() => { if (!cancelled) setLoadingCtx(false); });
    return () => { cancelled = true; };
  }, [draft.primaryEventId]);

  function setRelief(relief: string) {
  setDraft((d) => ({
    ...d,
    relief,
    amount: relief === "time" ? "" : d.amount,
    daysAmount: relief === "money" ? "" : d.daysAmount,
  }));
}

  function setModeDetailed(on: boolean) {
    setDraft((d) => ({
      ...d,
      modeDetailed: on,
      amount: on ? d.amount : "",
      daysAmount: on ? d.daysAmount : "",
    }));
  }

  function selectPrimary(id: string) {
    setAnalyzed(false);
    patch({ primaryEventId: id, extraEventIds: draft.extraEventIds.filter((x) => x !== id) });
  }

  function modeString(): "notice" | "detailed" | "both" | null {
    if (draft.modeNotice && draft.modeDetailed) return "both";
    if (draft.modeNotice) return "notice";
    if (draft.modeDetailed) return "detailed";
    return null;
  }

  // Evaluate the guards for whichever modes are selected; return the single
  // highest-severity popup (or null to generate straight away).
  function evaluateGuard(): GuardHit | null {
    if (!context) return null;
    const stepId = context.flag.stepId;
    const overdue = context.flag.status === "overdue";
    const hits: GuardHit[] = [];

    if (draft.modeNotice) {
      if (context.noticeSubmitted) hits.push({ kind: "already", which: "notice" });
      else if (stepId === "20.1-notice" && overdue) hits.push({ kind: "timebar", which: "notice" });
    }
    if (draft.modeDetailed) {
      if (context.detailedSubmitted) hits.push({ kind: "already", which: "detailed" });
      else if (!context.noticeSubmitted && stepId === "20.1-notice" && overdue)
        hits.push({ kind: "timebar", which: "detailed" });
      else if (context.noticeSubmitted && stepId === "20.1-particulars" && overdue)
        hits.push({ kind: "particulars", which: "detailed" });
      // Only nudge about a missing notice if we're NOT also creating it now.
      else if (!context.noticeSubmitted && !draft.modeNotice)
        hits.push({ kind: "nudge", which: "detailed" });
    }
    if (hits.length === 0) return null;
    return hits.sort((a, b) => SEVERITY[b.kind] - SEVERITY[a.kind])[0];
  }

  // The single chain behind both the "Analyze with AI" button and the "Action"
  // deep-link: event in, filled form out. Requires an event.
  async function analyze() {
    if (!draft.primaryEventId) {
      setErr("Select the event this claim relates to before analyzing.");
      return;
    }
    setAnalyzing(true); setErr(null);
    try {
      const res = await fetch("/api/ai/claim/outline", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: draft.primaryEventId,
          extra_event_ids: draft.extraEventIds,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const suggested: string[] = (data.relevant_event_ids ?? []).filter(
        (id: string) => id !== draft.primaryEventId,
      );
      patch({
        title: data.title || draft.title,
        type: TYPES.some(([v]) => v === data.claim_type) ? data.claim_type : draft.type,
        relief: RELIEF.some(([v]) => v === data.relief_sought) ? data.relief_sought : draft.relief,
        description: data.description || draft.description,
        keyPointsText: (data.key_points ?? []).join("\n"),
        extraEventIds: suggested,
      });
      setAnalyzed(true);
    } catch {
      setErr("Couldn’t analyze. You can fill the fields in manually.");
    } finally { setAnalyzing(false); }
  }

  function onGenerateClick() {
    setErr(null);
    const mode = modeString();
    if (!mode) { setErr("Choose notice of claim, detailed claim, or both."); return; }
    if (!draft.primaryEventId) { setErr("Select the event this claim relates to."); return; }
    const hit = evaluateGuard();
    if (hit) {
      const { title, message } = popupContent(hit);
      setGuard({ title, message, onProceed: runGenerate });
      return;
    }
    runGenerate();
  }

  async function runGenerate() {
    const mode = modeString();
    if (!mode || !draft.primaryEventId) return;
    setGenerating(true); setErr(null); setSaved(false);
    try {
      const res = await fetch("/api/ai/claim/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          primary_event_id: draft.primaryEventId,
          title: draft.title, claim_type: draft.type,
          relief_sought: draft.relief, amount: amountNum(),
          description: draft.description,
          key_points: draft.keyPointsText.split("\n").map((s) => s.trim()).filter(Boolean),
          extra_event_ids: draft.extraEventIds,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      patch({ generatedText: data.claim ?? "" });
    } catch {
      setErr("Couldn’t generate. You can still write the claim manually below.");
    } finally { setGenerating(false); }
  }

  function save(intent: "draft" | "submit") {
    setErr(null);
    const mode = modeString();
    if (!mode) { setErr("Choose notice, detailed, or both."); return; }
    if (!draft.title.trim()) { setErr("Give the claim a title before saving."); return; }
    if (!draft.primaryEventId) { setErr("Select the event this claim relates to."); return; }

    startSave(async () => {
      const base = {
        title: draft.title, type: draft.type, relief_sought: draft.relief,
        amount: amountNum(), description: draft.description,
        body: draft.generatedText, ai_generated: !!draft.generatedText,
        primary_event_id: draft.primaryEventId, event_ids: draft.extraEventIds,
      };
      const kinds: ("notice" | "detailed")[] =
        mode === "both" ? ["notice", "detailed"] : [mode];
      const ids: { notice?: string; detailed?: string } = {};
      for (const kind of kinds) {
        const money = showMoney && draft.amount.trim() !== "" ? Number(draft.amount) : null;
        const days  = showDays  && draft.daysAmount.trim() !== "" ? Number(draft.daysAmount) : null;

        const res = await createClaim({ ...base, kind, amount: money, time_days: days });
        if (res?.error) { setErr(res.error); return; }
        if (res?.id) ids[kind] = res.id;
      }
      setSavedIds(ids);
      setSavedMode(intent);
      setSaved(true);
      router.refresh();
    });
  }

function startAnother() {
    clearDraft(); setDraft(EMPTY); setSaved(false); setContext(null);
    setAnalyzed(false); appliedLink.current = null;
    setSavedIds({}); setSubmittedKinds({}); setSavedMode(null);
  }

  const mode = modeString();
  const showDetailedTools = draft.modeDetailed; // further evidence + key points
  const genLabel =
    mode === "both" ? "Generate notice + claim"
    : mode === "notice" ? "Generate notice"
    : "Generate claim";
  // Analyze is "primed" until it has been run for the current event.
  const analyzePrimed = !!draft.primaryEventId && !analyzed && !draft.generatedText;

  return (
    <Card>
      <CardHeader><CardTitle>Build a claim</CardTitle></CardHeader>
      <CardContent className="space-y-6">

        {/* ---- What are we creating? ---- */}
        <div className="space-y-2">
          <Label>What do you want to create?</Label>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.modeNotice}
                onCheckedChange={(v) => patch({ modeNotice: !!v })}
              />
              Notice of claim
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.modeDetailed}
                onCheckedChange={(v) => patch({ modeDetailed: !!v })}
              />
              Detailed claim
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            Within the 28-day window you can create both at once — a full notice and detailed claim in one document.
          </p>
        </div>

        {/* ---- Primary event (guards + Analyze evaluate against this one) ---- */}
        <div className="space-y-1.5">
          <Label>Event this claim relates to</Label>
          <Select value={draft.primaryEventId ?? ""} onValueChange={selectPrimary}>
            <SelectTrigger><SelectValue placeholder="Select an event" /></SelectTrigger>
            <SelectContent>
              {events.map((ev) => (
                <SelectItem key={ev.id} value={ev.id}>
                  {ev.title}
                  {ev.occurred_on ? ` · ${ev.occurred_on}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {draft.primaryEventId && (
            <p className="text-xs text-muted-foreground">
              {loadingCtx && "Checking status…"}
              {!loadingCtx && context && (
                <>
                  Notice: <strong>{context.noticeSubmitted ? "sent" : "not sent"}</strong>
                  {" · "}Particulars: <strong>{context.detailedSubmitted ? "submitted" : "not submitted"}</strong>
                  {context.flag.actionDueDate && <> {" · "}current step due {context.flag.actionDueDate}</>}
                  {context.flag.status === "overdue" && (
                    <span className="ml-1 font-semibold text-red-600">
                      <AlertTriangle className="mr-0.5 inline h-3 w-3" />overdue
                    </span>
                  )}
                </>
              )}
            </p>
          )}
        </div>

        {/* ---- Primed hint: arrived here ready to analyze ---- */}
        {analyzePrimed && (
          <div className="flex items-start gap-2 rounded-md border border-dashed bg-muted/40 p-3 text-sm">
            <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span>
              {arrivedViaAction ? "This event is ready. " : ""}
              Click <strong>Analyze with AI</strong> to fill in the claim from the event and its evidence, then edit and generate.
            </span>
          </div>
        )}

        {/* ---- Claim metadata ---- */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="c-title">Title</Label>
            <Input id="c-title" value={draft.title} onChange={(e) => patch({ title: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5"><Label>Claim type</Label>
              <Select value={draft.type} onValueChange={(v) => patch({ type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label>Relief sought</Label>
              <Select value={draft.relief} onValueChange={setRelief}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{RELIEF.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select></div>
            
 {showMoney && (
  <div className="space-y-1.5">
    <Label htmlFor="amount">Amount sought (AED)</Label>
    <Input id="amount" inputMode="decimal" placeholder="e.g. 250000"
      value={draft.amount}
      onChange={(e) => setDraft((d) => ({ ...d, amount: e.target.value }))} />
  </div>
)}

{showDays && (
  <div className="space-y-1.5">
    <Label htmlFor="daysAmount">Time sought (days)</Label>
    <Input id="daysAmount" inputMode="numeric" placeholder="e.g. 21"
      value={draft.daysAmount}
      onChange={(e) => setDraft((d) => ({ ...d, daysAmount: e.target.value }))} />
  </div>
)}

          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-desc">Description — what is this claim about?</Label>
            <Textarea id="c-desc" rows={4} value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="Filled in by Analyze, or write your own — e.g. The main contractor deducted AED 18,500 from PC07 for cleaning that was not our waste…" />
          </div>
        </div>

        {/* ---- Detailed-only tooling: further evidence + key points ---- */}
        {showDetailedTools && (
          <>
            <div className="space-y-2">
              <Label>
                Further evidence — link other events
                {draft.extraEventIds.length > 0 && (
                  <span className="text-muted-foreground"> ({draft.extraEventIds.length} linked)</span>
                )}
              </Label>
              {events.filter((e) => e.id !== draft.primaryEventId).length === 0 && (
                <p className="text-sm text-muted-foreground">No other events to link.</p>
              )}
              <div className="space-y-2">
                {events.filter((e) => e.id !== draft.primaryEventId).map((ev) => (
                  <label key={ev.id} className="flex items-start gap-2 text-sm">
                    <Checkbox
                      checked={draft.extraEventIds.includes(ev.id)}
                      onCheckedChange={() =>
                        setDraft((d) => ({
                          ...d,
                          extraEventIds: d.extraEventIds.includes(ev.id)
                            ? d.extraEventIds.filter((x) => x !== ev.id)
                            : [...d.extraEventIds, ev.id],
                        }))
                      }
                      className="mt-0.5"
                    />
                    <span>{ev.title}
                      <span className="text-muted-foreground"> · {ev.type}{ev.occurred_on ? ` · ${ev.occurred_on}` : ""}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="c-points">Key points <span className="text-muted-foreground">(one per line — edit before generating)</span></Label>
              <Textarea id="c-points" rows={5} value={draft.keyPointsText}
                onChange={(e) => patch({ keyPointsText: e.target.value })}
                placeholder="Filled in by Analyze, or write your own." />
            </div>
          </>
        )}

        {/* ---- Analyze + Generate ---- */}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={analyzePrimed ? "default" : "secondary"}
            onClick={analyze}
            disabled={analyzing || generating}
          >
            <Sparkles className="mr-1 h-4 w-4" />{analyzing ? "Analyzing…" : "Analyze with AI"}
          </Button>
          <Button type="button" onClick={onGenerateClick} disabled={!mode || generating}>
            {generating ? "Generating…" : genLabel}
          </Button>
        </div>

        {/* ---- The document ---- */}
        <div className="space-y-1.5">
          <Label htmlFor="c-body">{mode === "notice" ? "Notice" : "Claim"}</Label>
          {placeholders > 0 && (
            <p className="text-xs text-amber-600">
              {placeholders} missing figure{placeholders === 1 ? "" : "s"} flagged with [INSERT …] — fill these in before issuing.
            </p>
          )}
          <Textarea id="c-body" rows={14} value={draft.generatedText}
            onChange={(e) => patch({ generatedText: e.target.value })}
            placeholder="The generated document appears here for you to review and edit, or write it yourself." />
        </div>

        {err && <p className="text-sm text-amber-600">{err}</p>}

        {/* ---- Save: two explicit outcomes ---- */}
        {!saved && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => save("draft")} disabled={saving}>
              {saving ? "Saving…" : "Save as draft"}
            </Button>
            <Button onClick={() => save("submit")} disabled={saving}>
              {saving ? "Saving…" : "Save & mark as submitted"}
            </Button>
          </div>
        )}

        {/* ---- Post-save ---- */}
        {saved && draft.primaryEventId && (
          <div className="space-y-3 rounded-md border border-dashed p-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {savedMode === "submit" ? "Saved." : "Saved as draft."}
            </div>

            {savedMode === "draft" && (
              <p className="text-muted-foreground">
                It stays editable — open it from the list below to change details, or mark it submitted later.
              </p>
            )}

            {savedMode === "submit" && (
              <>
                <p className="text-muted-foreground">
                  Once you’ve actually sent it, record the date so ClaimGuard can track the next deadline. (Generating doesn’t send it.)
                </p>

                {draft.modeNotice && (submittedKinds.notice ? (
                  <p className="flex items-center gap-2 font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" /> Notice of claim marked as submitted.
                  </p>
                ) : (
                  <StepCompleteControl
                    eventId={draft.primaryEventId}
                    stepId="20.1-notice"
                    label="Mark notice of claim as sent"
                    onCompleted={async () => {
                      if (!savedIds.notice) return;
                      const r = await markClaimSubmitted(savedIds.notice);
                      if (r?.error) return { error: r.error };
                      setSubmittedKinds((s) => ({ ...s, notice: true }));
                    }}
                  />
                ))}

                {draft.modeDetailed && (submittedKinds.detailed ? (
                  <p className="flex items-center gap-2 font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" /> Detailed claim marked as submitted.
                  </p>
                ) : (
                  <StepCompleteControl
                    eventId={draft.primaryEventId}
                    stepId="20.1-particulars"
                    label="Mark detailed claim as submitted"
                    onCompleted={async () => {
                      if (!savedIds.detailed) return;
                      const r = await markClaimSubmitted(savedIds.detailed);
                      if (r?.error) return { error: r.error };
                      setSubmittedKinds((s) => ({ ...s, detailed: true }));
                    }}
                  />
                ))}
              </>
            )}

            <Button variant="ghost" size="sm" onClick={startAnother}>Start another claim</Button>
          </div>
        )}
      </CardContent>

      {/* ---- Guard popup ---- */}
      <Dialog open={!!guard} onOpenChange={(o) => { if (!o) setGuard(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{guard?.title}</DialogTitle></DialogHeader>
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
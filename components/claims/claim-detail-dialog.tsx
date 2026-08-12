"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateClaim, markClaimSubmitted, getClaimEventDates } from "@/lib/actions/claims";
import { StepCompleteControl } from "@/components/events/step-complete-control";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";

const TYPES = [
  ["variation_change", "Variation / Change"], ["delay_eot", "Delay / EOT"],
  ["payment_dispute", "Payment dispute"], ["disruption", "Disruption"],
  ["acceleration", "Acceleration"], ["backcharge", "Backcharge"],
] as const;
const RELIEF = [["money", "Money"], ["time", "Time"], ["both", "Both"]] as const;
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES);

export function ClaimDetailDialog({
  claim, onClose,
}: { claim: any; onClose: () => void }) {
  const router = useRouter();
  const isDraft = claim.status === "draft";
  const stepId = claim.kind === "notice" ? "20.1-notice" : "20.1-particulars";
  const servedField: "notice_date" | "submission_date" =
    claim.kind === "notice" ? "notice_date" : "submission_date";

  const [title, setTitle] = useState(claim.title ?? "");
  const [type, setType] = useState(claim.type ?? "variation_change");
  const [relief, setRelief] = useState(claim.relief_sought ?? "money");
  const [amount, setAmount] = useState(claim.amount != null ? String(claim.amount) : "");
  const [days, setDays] = useState(claim.time_days != null ? String(claim.time_days) : "");
  const [description, setDescription] = useState(claim.description ?? "");
  const [body, setBody] = useState(claim.body ?? "");
  const [servedDate, setServedDate] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);

  const showMoney = relief === "money" || relief === "both";
  const showDays = relief === "time" || relief === "both";

  // Read the served date off the event so we can show it, and pre-fill a correction.
  useEffect(() => {
    if (!claim.primary_event_id) return;
    getClaimEventDates(claim.primary_event_id).then((d) => {
      if (d) setServedDate(d[servedField] ?? null);
    });
  }, [claim.primary_event_id, servedField]);

  function saveEdits() {
    setErr(null);
    startSave(async () => {
      const r = await updateClaim(claim.id, {
        title,
        type,
        relief_sought: relief,
        amount: showMoney && amount.trim() ? Number(amount) : null,
        time_days: showDays && days.trim() ? Number(days) : null,
        description,
        body,
      });
      if (r?.error) { setErr(r.error); return; }
      setSavedNote(true);
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {isDraft ? "Edit claim" : claim.title}
            <Badge variant={isDraft ? "secondary" : "default"}>{claim.status}</Badge>
            {claim.kind && (
              <Badge variant="outline">{claim.kind === "notice" ? "Notice of claim" : "Detailed claim"}</Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isDraft ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="d-title">Title</Label>
              <Input id="d-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Claim type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Relief sought</Label>
                <Select value={relief} onValueChange={setRelief}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RELIEF.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {showMoney && (
                <div className="space-y-1.5">
                  <Label htmlFor="d-amount">Amount (AED)</Label>
                  <Input id="d-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
              )}
              {showDays && (
                <div className="space-y-1.5">
                  <Label htmlFor="d-days">Time (days)</Label>
                  <Input id="d-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-desc">Description</Label>
              <Textarea id="d-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-body">Claim</Label>
              <Textarea id="d-body" rows={14} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {claim.type ? (TYPE_LABEL[claim.type] ?? claim.type) : "No type"}
              {claim.relief_sought ? ` · ${claim.relief_sought}` : ""}
              {claim.amount ? ` · ${claim.currency} ${Number(claim.amount).toLocaleString()}` : ""}
              {claim.time_days ? ` · ${claim.time_days} days` : ""}
            </p>
            <div className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
              {claim.body || "No document text."}
            </div>
          </div>
        )}

        {/* Served date — correctable in every tier */}
        {claim.primary_event_id && (
          <div className="space-y-2 rounded-md border border-dashed p-3 text-sm">
            {claim.status === "submitted" ? (
              <>
                <p className="flex items-center gap-2 font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Submitted{servedDate ? ` on ${servedDate}` : ""}.
                </p>
                <p className="text-muted-foreground">
                  Correct the served date if it was recorded wrong — this recomputes the deadline.
                </p>
                <StepCompleteControl
                  eventId={claim.primary_event_id}
                  stepId={stepId}
                  label="Correct served date"
                  initialDate={servedDate ?? undefined}
                  onCompleted={async (d) => { setServedDate(d); }}
                />
              </>
            ) : (
              <>
                <p className="text-muted-foreground">
                  When you’ve actually sent this, record the date so ClaimGuard tracks the next deadline.
                </p>
                <StepCompleteControl
                  eventId={claim.primary_event_id}
                  stepId={stepId}
                  label={claim.kind === "notice" ? "Mark notice as sent" : "Mark detailed claim as submitted"}
                  onCompleted={async (d) => {
                    const r = await markClaimSubmitted(claim.id);
                    if (r?.error) return { error: r.error };
                    setServedDate(d);
                    router.refresh();
                  }}
                />
              </>
            )}
          </div>
        )}

        {err && <p className="text-sm text-amber-600">{err}</p>}

        <DialogFooter>
          {isDraft && (
            <Button onClick={saveEdits} disabled={saving}>
              {saving ? "Saving…" : savedNote ? "Saved ✓" : "Save changes"}
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
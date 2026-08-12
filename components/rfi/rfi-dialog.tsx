"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateRfi } from "@/lib/actions/rfi";
import type { Rfi, RfiQuery, RfiStatus } from "@/lib/rfi/types";
import { RFI_STATUSES } from "@/lib/rfi/types";

export interface EventOption {
  id: string;
  title: string | null;
  type: string | null;
  occurred_on: string | null;
}

/**
 * Mirrors the claims builder: pick/confirm the event, "Analyze with AI"
 * prefills the boxes, edit freely, then "Draft RFI" renders the letter.
 * Editable state is seeded from the row. If you want the localStorage draft
 * persistence you use elsewhere, wrap the field state in usePersistentState
 * keyed by `rfi-draft:${rfi.id}`.
 */
export function RfiDialog({
  rfi,
  events,
  open,
  onOpenChange,
}: {
  rfi: Rfi;
  events: EventOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  const [eventId, setEventId] = React.useState<string | null>(rfi.eventId);
  const [recipient, setRecipient] = React.useState(rfi.recipient ?? "The Engineer");
  const [subject, setSubject] = React.useState(rfi.subject ?? "");
  const [background, setBackground] = React.useState(rfi.background ?? "");
  const [queries, setQueries] = React.useState<RfiQuery[]>(
    rfi.queries.length ? rfi.queries : [{ question: "", contractRef: "" }],
  );
  const [contractRefs, setContractRefs] = React.useState<string>(
    rfi.contractReferences.join(", "),
  );
  const [responseBy, setResponseBy] = React.useState(rfi.responseRequiredBy ?? "");
  const [draftBody, setDraftBody] = React.useState(rfi.draftBody ?? "");
  const [status, setStatus] = React.useState<RfiStatus>(rfi.status);

  const [analyzing, setAnalyzing] = React.useState(false);
  const [drafting, setDrafting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refsArray = () =>
    contractRefs
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  function updateQuery(i: number, patch: Partial<RfiQuery>) {
    setQueries((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function addQuery() {
    setQueries((qs) => [...qs, { question: "", contractRef: "" }]);
  }
  function removeQuery(i: number) {
    setQueries((qs) => (qs.length > 1 ? qs.filter((_, idx) => idx !== i) : qs));
  }

  async function analyze() {
    if (!eventId) {
      setError("Choose an event to analyze.");
      return;
    }
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/rfi/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: eventId, evidence_id: rfi.evidenceId }),
      });
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      if (data.subject) setSubject(data.subject);
      if (data.background) setBackground(data.background);
      if (Array.isArray(data.queries) && data.queries.length) {
        setQueries(
          data.queries.map((q: any) => ({
            question: q.question ?? "",
            contractRef: q.contract_ref ?? "",
          })),
        );
      }
      if (Array.isArray(data.contract_references)) {
        setContractRefs(data.contract_references.join(", "));
      }
    } catch (e: any) {
      setError(e?.message ?? "Analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function draft() {
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/rfi/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: eventId,
          recipient,
          subject,
          background,
          queries: queries
            .filter((q) => q.question.trim())
            .map((q) => ({ question: q.question, contract_ref: q.contractRef || null })),
          contract_references: refsArray(),
        }),
      });
      const data = await res.json();
      if (data?.error) throw new Error(data.error);
      setDraftBody(data.rfi ?? "");
    } catch (e: any) {
      setError(e?.message ?? "Draft failed.");
    } finally {
      setDrafting(false);
    }
  }

  async function save(close: boolean) {
    setSaving(true);
    setError(null);
    const res = await updateRfi(rfi.id, {
      eventId,
      recipient,
      subject,
      background,
      queries: queries.filter((q) => q.question.trim()),
      contractReferences: refsArray(),
      responseRequiredBy: responseBy || null,
      draftBody,
      status,
      aiGenerated: rfi.aiGenerated || !!draftBody,
    });
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
    if (close) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {rfi.reference}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {status}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Event</Label>
              <Select
                value={eventId ?? "none"}
                onValueChange={(v) => setEventId(v === "none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No event linked" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No event linked</SelectItem>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {(e.title ?? "(untitled)") +
                        (e.occurred_on ? ` · ${e.occurred_on}` : "")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as RfiStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RFI_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Button
              variant="secondary"
              size="sm"
              onClick={analyze}
              disabled={analyzing || !eventId}
            >
              {analyzing ? "Analyzing…" : "Analyze with AI"}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Recipient</Label>
              <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Response required by</Label>
              <Input
                type="date"
                value={responseBy}
                onChange={(e) => setResponseBy(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Background</Label>
            <Textarea
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Queries</Label>
            {queries.map((q, i) => (
              <div key={i} className="flex gap-2">
                <Textarea
                  value={q.question}
                  onChange={(e) => updateQuery(i, { question: e.target.value })}
                  placeholder="Question…"
                  rows={2}
                  className="flex-1"
                />
                <Input
                  value={q.contractRef ?? ""}
                  onChange={(e) => updateQuery(i, { contractRef: e.target.value })}
                  placeholder="SC ref"
                  className="w-24"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeQuery(i)}
                  disabled={queries.length <= 1}
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addQuery}>
              Add query
            </Button>
          </div>

          <div className="space-y-1">
            <Label>Contract references (comma-separated)</Label>
            <Input
              value={contractRefs}
              onChange={(e) => setContractRefs(e.target.value)}
              placeholder="1.9, 3.3"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>Drafted RFI</Label>
              <Button size="sm" onClick={draft} disabled={drafting}>
                {drafting ? "Drafting…" : "Draft RFI"}
              </Button>
            </div>
            <Textarea
              value={draftBody}
              onChange={(e) => setDraftBody(e.target.value)}
              rows={12}
              placeholder="The drafted RFI letter will appear here. You can edit it before saving."
              className="font-mono text-sm"
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => save(false)} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button onClick={() => save(true)} disabled={saving}>
            Save &amp; close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
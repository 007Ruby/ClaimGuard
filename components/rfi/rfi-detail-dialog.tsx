"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateRfi, markRfiSent } from "@/lib/actions/rfi";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { linesToQueries, queriesToText, type Rfi } from "@/lib/rfi/types";

/**
 * Reworked from the old RfiDialog to match FollowUpDetailDialog's lifecycle:
 *   draft → fully editable (recipient/subject/background/queries/letter) with
 *           Save changes + Mark as sent;
 *   sent / responded / closed → read-only view of the letter.
 * Queries edit as plain one-per-line text; AI-supplied contract refs survive
 * positionally via linesToQueries(prev = the row's stored queries).
 */
export function RfiDetailDialog({ rfi, onClose }: { rfi: Rfi; onClose: () => void }) {
  const router = useRouter();
  const isDraft = rfi.status === "draft";

  const [recipient, setRecipient] = useState(rfi.recipient ?? "The Engineer");
  const [subject, setSubject] = useState(rfi.subject ?? "");
  const [background, setBackground] = useState(rfi.background ?? "");
  const [queriesText, setQueriesText] = useState(queriesToText(rfi.queries));
  const [body, setBody] = useState(rfi.draftBody ?? "");
  const [saving, startSave] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);

  function saveEdits(then?: "sent") {
    setErr(null);
    if (then === "sent" && !body.trim()) {
      setErr("Draft the RFI letter before marking this as sent.");
      return;
    }
    startSave(async () => {
      const r = await updateRfi(rfi.id, {
        recipient, subject, background,
        queries: linesToQueries(queriesText, rfi.queries),
        draftBody: body,
      });
      if (r?.error) { setErr(r.error); return; }
      if (then === "sent") {
        const s = await markRfiSent(rfi.id);
        if (s?.error) { setErr(s.error); return; }
      }
      setSavedNote(true);
      router.refresh();
      if (then === "sent") onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{rfi.reference}</span>
            {isDraft ? (subject.trim() || "Edit RFI") : (rfi.subject?.trim() || "RFI")}
            <Badge variant={isDraft ? "secondary" : "default"}>{rfi.status}</Badge>
          </DialogTitle>
        </DialogHeader>

        {isDraft ? (
          <div className="space-y-4">
            <div className="grid grid-cols-[160px_1fr] gap-4">
              <div className="space-y-1.5"><Label htmlFor="rd-to">To</Label>
                <Input id="rd-to" value={recipient} onChange={(e) => setRecipient(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="rd-subject">Subject</Label>
                <Input id="rd-subject" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="rd-background">Background</Label>
              <Textarea id="rd-background" rows={3} value={background} onChange={(e) => setBackground(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="rd-queries">Queries <span className="text-muted-foreground">(one per line)</span></Label>
              <Textarea id="rd-queries" rows={5} value={queriesText} onChange={(e) => setQueriesText(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="rd-body">Drafted RFI</Label>
              <Textarea id="rd-body" rows={14} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-sm" /></div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {rfi.recipient ? `to ${rfi.recipient}` : "to The Engineer"}
              {rfi.dateSent ? ` · sent ${rfi.dateSent.slice(0, 10)}` : ""}
            </p>
            {rfi.background && <p className="text-sm">{rfi.background}</p>}
            <div className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
              {rfi.draftBody
                || (rfi.queries.length ? rfi.queries.map((q) => `• ${q.question}`).join("\n") : "No RFI text.")}
            </div>
          </div>
        )}

        {err && <p className="text-sm text-amber-600">{err}</p>}

        <DialogFooter>
          {isDraft && (
            <>
              <Button variant="outline" onClick={() => saveEdits()} disabled={saving}>
                {saving ? "Saving…" : savedNote ? "Saved ✓" : "Save changes"}
              </Button>
              <Button onClick={() => saveEdits("sent")} disabled={saving}>
                {saving ? "Saving…" : "Mark as sent"}
              </Button>
            </>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
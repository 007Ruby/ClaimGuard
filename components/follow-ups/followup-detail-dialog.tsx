"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateFollowUp, markFollowUpSent } from "@/lib/actions/follow-ups";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { SavedFollowUp } from "@/lib/queries/follow-ups";

export function FollowUpDetailDialog({
  followUp, onClose,
}: { followUp: SavedFollowUp; onClose: () => void }) {
  const router = useRouter();
  const isDraft = followUp.status === "draft";

  const [recipient, setRecipient] = useState(followUp.recipient ?? "");
  const [subject, setSubject] = useState(followUp.subject ?? "");
  const [keyPoints, setKeyPoints] = useState(followUp.keyPoints ?? "");
  const [body, setBody] = useState(followUp.body ?? "");
  const [saving, startSave] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);

  function saveEdits(then?: "sent") {
    setErr(null);
    startSave(async () => {
      const r = await updateFollowUp(followUp.id, {
        recipient, subject, key_points: keyPoints, body,
      });
      if (r?.error) { setErr(r.error); return; }
      if (then === "sent") {
        const s = await markFollowUpSent(followUp.id);
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
            {isDraft ? "Edit follow-up" : (followUp.subject?.trim() || "Follow-up")}
            <Badge variant={isDraft ? "secondary" : "default"}>{followUp.status}</Badge>
          </DialogTitle>
        </DialogHeader>

        {isDraft ? (
          <div className="space-y-4">
            <div className="grid grid-cols-[120px_1fr] gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="fd-to">To</Label>
                <Input id="fd-to" value={recipient} onChange={(e) => setRecipient(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fd-subject">Subject</Label>
                <Input id="fd-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fd-points">Key points</Label>
              <Textarea id="fd-points" rows={5} value={keyPoints} onChange={(e) => setKeyPoints(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fd-body">Email</Label>
              <Textarea id="fd-body" rows={14} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {followUp.eventTitle ?? ""}
              {followUp.recipient ? ` · to ${followUp.recipient}` : ""}
              {followUp.sentAt ? ` · sent ${followUp.sentAt.slice(0, 10)}` : ""}
            </p>
            <div className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
              {followUp.body || "No email text."}
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
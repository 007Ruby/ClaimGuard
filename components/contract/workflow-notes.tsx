"use client";

// components/contract/profile-notes.tsx
//
// Free-text edge cases that do not fit a parameter — "the 28 days is calendar days but the
// Engineer's office closes for Eid" sort of thing.
//
// This is read by the BOT and never by the engine. That split is deliberate and is the reason
// this field exists at all: without it, a user with a genuine edge case would try to encode it
// by fudging a number, which would silently corrupt every computed date. Giving prose somewhere
// legitimate to live keeps the parameters honest.

import { useState, useTransition } from "react";
import { updateProfileNotes } from "@/app/actions/contract-profile";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ProfileNotes({ initial }: { initial: string | null }) {
  const [notes, setNotes] = useState(initial ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = notes !== (initial ?? "");

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateProfileNotes(notes);
      if (result.ok) setSaved(true);
      else setError(result.error);
    });
  }

  return (
    <section className="space-y-3 border-t pt-6">
      <div>
        <Label htmlFor="profile-notes" className="text-base">Anything else about this contract</Label>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          Quirks that do not fit a period — unusual definitions, agreed practices, anything you
          would tell a new engineer joining the project. This does not change any deadline, but
          the assistant reads it when answering your questions.
        </p>
      </div>

      <Textarea
        id="profile-notes"
        value={notes}
        onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
        rows={5}
        placeholder="For example: the Engineer accepts statements by email, but insists on hard copy for claims."
      />

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending || !dirty}>
          {pending ? "Saving" : "Save notes"}
        </Button>
        {saved && <span className="text-sm text-muted-foreground">Saved.</span>}
        {error && <span className="text-sm text-destructive">{error}</span>}
      </div>
    </section>
  );
}
"use client";

// components/contract/contract-type-fork.tsx
//
// The choice the user makes before uploading anything.
//
// It cannot be inferred from the document. A UAE developer's conformed Conditions of Contract
// prints FIDIC's General Conditions with the amendments already worked in, and reads exactly
// like a bespoke form to any classifier. So this is asked plainly, once, and it determines what
// happens to every provision extraction does not find:
//
//   FIDIC  — extraction runs as a DIFF. Anything not found stays at the General Conditions
//            value, which is correct, and the Workflows page can show what the contract
//            changed.
//   Other  — extraction runs a FULL READ. Anything not found is UNRESOLVED: no deadline is
//            computed and the page asks the user to fill it in.
//
// The asymmetry is deliberate. Choosing "other" for a FIDIC contract costs some data entry.
// Choosing "FIDIC" for a bespoke one seeds ten periods the contract never adopted, and the
// system then computes real deadlines from them.

import { useState, useTransition } from "react";
import { initialiseContractProfile } from "@/app/actions/contract-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Choice = "fidic" | "custom";

export function ContractTypeFork() {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (!choice) return;
    setError(null);
    startTransition(async () => {
      const result = await initialiseContractProfile(
        choice,
        label.trim() === "" ? undefined : label.trim(),
      );
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <section className="space-y-4 rounded-md border p-5">
      <div>
        <h2 className="font-medium">What kind of contract is this?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This decides how your document is read. You can only set it once per project, so it is
          worth getting right.
        </p>
      </div>

      <div className="space-y-3">
        <Option
          selected={choice === "fidic"}
          onSelect={() => setChoice("fidic")}
          title="FIDIC Red Book 1999, with Particular Conditions"
          body="Your Conditions of Contract are FIDIC's, with amendments. We already know the standard periods, so we only look for what your contract changed — and we can show you exactly what was changed."
        />
        <Option
          selected={choice === "custom"}
          onSelect={() => setChoice("custom")}
          title="A different contract form"
          body="Everything is read from your document. Anything we cannot find is left blank for you to fill in rather than assumed, so no deadline is ever based on a period your contract does not contain."
        />
      </div>

      {choice && (
        <div className="space-y-1.5">
          <Label htmlFor="base-label">What do you call this contract? (optional)</Label>
          <Input
            id="base-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={
              choice === "fidic" ? "FIDIC Red Book 1999" : "e.g. Marina Bay Developments form"
            }
          />
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button onClick={confirm} disabled={!choice || pending}>
        {pending ? "Setting up" : "Continue"}
      </Button>
    </section>
  );
}

function Option({
  selected,
  onSelect,
  title,
  body,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full rounded-md border p-4 text-left transition-colors ${
        selected ? "border-foreground bg-accent" : "hover:bg-accent/50"
      }`}
    >
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </button>
  );
}
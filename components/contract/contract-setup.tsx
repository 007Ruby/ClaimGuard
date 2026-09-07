"use client";

// components/contract/contract-setup.tsx
//
// Choose the contract type, upload, review, commit — in one place, in that order.
//
// The type is asked BEFORE the upload because it changes what a gap in the document means, and
// asking afterwards would mean re-reading the file. It is asked again on replacement rather
// than inherited, because a new document may be a different form and "still FIDIC" is exactly
// the assumption this fork exists to refuse to make.
//
// The review step is not decoration. It is the only moment the user sees WHICH clauses were
// found before those clauses start driving legal deadlines, and it names what was missed —
// because a gap the user does not know about is a deadline nobody is watching.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Sparkles } from "lucide-react";
import { commitContract } from "@/app/actions/contract-profile";
import type { ExtractedConcept } from "@/lib/contract/extract-profile";
import { CONCEPTS } from "@/lib/contract/concepts";
import type { ConceptKey } from "@/lib/contract/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Choice = "fidic" | "custom";

const GUIDANCE: Record<Choice, string> = {
  fidic:
    "Upload your conformed Conditions of Contract as one PDF — General Conditions, Particular " +
    "Conditions and the Appendix to Tender together. We know the standard periods already, so " +
    "we look for what your contract changed and show you exactly what that was.",
  custom:
    "Upload the full Conditions of Contract for your form, together with the Contract Data. " +
    "Everything is read from your document. Anything we cannot find is left blank for you to " +
    "fill in rather than assumed, so no deadline is ever based on a period your contract does " +
    "not contain.",
};

const WARNING =
  "Every deadline on this project will be recalculated from the new document, and every period " +
  "you have set or confirmed by hand will be discarded. Your claims and events stay, but the " +
  "dates behind them will move.";

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

export function ContractSetup({ mode }: { mode: "initial" | "replace" }) {
  const router = useRouter();
  const replacing = mode === "replace";

  const [choice, setChoice] = useState<Choice | "">("");
  const [label, setLabel] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [result, setResult] = useState<{
    data: Record<string, any>;
    concepts: ExtractedConcept[];
    missing: ConceptKey[];
  } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [warnUpload, setWarnUpload] = useState(false);
  const [warnSave, setWarnSave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startTransition] = useTransition();

  function pick(file: File | undefined) {
    setError(null);
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("PDF only.");
      return;
    }
    setResult(null);
    setPendingFile(file);
    if (replacing) setWarnUpload(true);
    else void extract(file);
  }

  async function extract(file: File) {
    setWarnUpload(false);
    setExtracting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/contract/extract", { method: "POST", body: fd });
      const raw = await res.text();
      let json: any;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new Error(
          `The extract route didn't return JSON (HTTP ${res.status}). Check the dev-server ` +
            `terminal. Response started: ${raw.slice(0, 40)}`,
        );
      }
      if (!res.ok) throw new Error(json?.error ?? "Extraction failed");
      setResult({
        data: json.data ?? {},
        concepts: json.concepts ?? [],
        missing: json.missing ?? [],
      });
    } catch (e: any) {
      console.error("[contract-setup] extract:", e);
      setError(e?.message ?? "Couldn't read that PDF.");
    } finally {
      setExtracting(false);
    }
  }

  function commit() {
    if (!result || choice === "") return;
    setWarnSave(false);
    startTransition(async () => {
      const res = await commitContract({
        profileType: choice,
        ...(label.trim() ? { baseLabel: label.trim() } : {}),
        extracted: result.data,
        concepts: result.concepts,
        replace: replacing,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(null);
      setPendingFile(null);
      setChoice("");
      router.refresh();
    });
  }

  return (
    <section className="rounded-md border">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <h2 className={replacing ? "font-medium" : "text-lg font-semibold"}>
          {replacing ? "Replace this contract" : "Set up your contract"}
        </h2>
        <select
          className={selectClass}
          value={choice}
          onChange={(e) => {
            setChoice(e.target.value as Choice | "");
            setResult(null);
            setError(null);
          }}
        >
          <option value="">Contract type…</option>
          <option value="fidic">FIDIC Red Book 1999</option>
          <option value="custom">A different contract form</option>
        </select>
      </div>

      {choice !== "" && (
        <div className="space-y-4 border-t px-4 py-4">
          <p className="max-w-prose text-sm text-muted-foreground">{GUIDANCE[choice]}</p>

          {!replacing && (
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

          <Input
            type="file"
            accept="application/pdf"
            disabled={extracting || saving}
            onChange={(e) => pick(e.target.files?.[0])}
          />

          {extracting && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4 animate-pulse" /> Reading your contract — the clauses
              take a minute.
            </p>
          )}

          {result && !extracting && (
            <Review
              result={result}
              saving={saving}
              replacing={replacing}
              onCommit={() => (replacing ? setWarnSave(true) : commit())}
            />
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}

      <ConfirmDialog
        open={warnUpload}
        title="Replace the contract for this project?"
        body={WARNING}
        confirmLabel="Read the new contract"
        onConfirm={() => pendingFile && void extract(pendingFile)}
        onCancel={() => {
          setWarnUpload(false);
          setPendingFile(null);
        }}
      />

      <ConfirmDialog
        open={warnSave}
        title="This cannot be undone"
        body={WARNING}
        confirmLabel="Replace contract"
        destructive
        onConfirm={commit}
        onCancel={() => setWarnSave(false)}
      />
    </section>
  );
}

function Review({
  result,
  saving,
  replacing,
  onCommit,
}: {
  result: { data: Record<string, any>; concepts: ExtractedConcept[]; missing: ConceptKey[] };
  saving: boolean;
  replacing: boolean;
  onCommit: () => void;
}) {
  const { data, concepts, missing } = result;

  return (
    <div className="space-y-4 rounded-md border p-4">
      <div className="space-y-2">
        <p className="text-sm font-medium">The project</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
          <Row label="Project" value={data.name} />
          <Row label="Employer" value={data.parties?.employer} />
          <Row label="Contractor" value={data.parties?.contractor} />
          <Row label="Engineer" value={data.parties?.engineer} />
          <Row label="Commencement" value={data.commencementDate} />
          <Row
            label="Contract amount"
            value={
              data.acceptedContractAmount
                ? `${data.currency ?? ""} ${Number(data.acceptedContractAmount).toLocaleString()}`.trim()
                : null
            }
          />
        </dl>
      </div>

      <div className="space-y-2 border-t pt-4">
        <p className="text-sm font-medium">
          Clauses found — {concepts.length} of {concepts.length + missing.length}
        </p>
        {concepts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No contractual periods were matched in this document. You can still save it and set
            the periods by hand afterwards.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {concepts.map((c) => (
              <li key={c.key} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">
                  {CONCEPTS[c.key].canonicalName}
                  {c.sourceClauseRef && (
                    <span className="ml-2 text-xs text-muted-foreground">{c.sourceClauseRef}</span>
                  )}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {c.durationDays === null ? "no fixed period" : `${c.durationDays} days`}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Named, not counted. "3 not found" tells the user nothing they can act on; knowing it
            was the suspension notice tells them precisely which clock is unwatched. */}
        {missing.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
            <p className="text-sm font-medium">Not found in your document</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {missing.map((k) => CONCEPTS[k].canonicalName).join(", ")}.
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Nothing has been assumed for these. Open them on the page afterwards to set them,
              or mark them as not in your contract.
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Every clause found is marked for checking. Open one to read the wording your contract
        uses next to the period we took from it.
      </p>

      <Button onClick={onCommit} disabled={saving}>
        {saving ? "Saving…" : replacing ? "Replace contract" : "Save contract"}
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate">{value || <span className="text-muted-foreground">Not stated</span>}</dd>
    </>
  );
}

function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  destructive,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            {title}
          </DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={destructive ? "destructive" : "default"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
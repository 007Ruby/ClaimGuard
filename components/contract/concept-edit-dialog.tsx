"use client";

// components/contract/concept-edit-dialog.tsx
//
// The editor behind a single step. Lifted out of workflow-chain.tsx unchanged when the
// Workflows page was folded into /settings/contract — there is exactly one place a parameter
// can be edited, and this is it.

import { useState, useTransition } from "react";
import type { WorkflowNode } from "@/lib/contract/workflows";
import { layerLabel } from "@/lib/contract/workflows";
import { CONCEPTS } from "@/lib/contract/concepts";
import { OWNERS, CONSEQUENCE_TYPES } from "@/lib/contract/types";
import type { Anchor, ConceptParametersOverride, ConsequenceType, Owner } from "@/lib/contract/types";
import {
  updateConceptParameters,
  setConceptPresence,
  confirmConcept,
  revertConceptToContract,
} from "@/app/actions/contract-profile";
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

const ANCHOR_LABELS: Record<Anchor, string> = {
  contractor_awareness: "Becoming aware of the event",
  statement_received: "The Engineer receiving the Statement",
  payment_due_date: "The payment due date",
  claim_received: "The Engineer receiving the claim",
  consultation_complete: "The end of consultation",
  suspension_notice_served: "Serving the notice",
  instruction_required: "When the instruction was needed",
};

const CONSEQUENCE_LABELS: Record<ConsequenceType, string> = {
  condition_precedent: "The entitlement is lost",
  soft_support: "The claim is weakened but not lost",
  counterparty_default: "The other party is in default",
  accrues_charges: "Charges start accruing",
  enables_right: "A right unlocks",
};

const OWNER_LABELS: Record<Owner, string> = {
  contractor: "You",
  engineer: "Engineer",
  employer: "Employer",
};

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

export function ConceptEditDialog({
  node,
  baseLabel,
  onClose,
}: {
  node: WorkflowNode;
  baseLabel: string;
  onClose: () => void;
}) {
  const p = node.parameters;
  const [days, setDays] = useState(p.durationDays === null ? "" : String(p.durationDays));
  const [owner, setOwner] = useState<Owner>(p.owner);
  const [anchor, setAnchor] = useState<Anchor | "">(p.anchor ?? "");
  const [consequence, setConsequence] = useState<ConsequenceType | "">(p.consequence ?? "");
  const [showClause, setShowClause] = useState(!p.resolved);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const validAnchors = CONCEPTS[node.key].validAnchors;
  const hasManualEdit = Object.values(p.provenance).includes("manual");

  function run(fn: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) onClose();
      else setError(result.error);
    });
  }

  function save() {
    const patch: ConceptParametersOverride = {
      owner,
      anchor: anchor === "" ? null : anchor,
      durationDays: days.trim() === "" ? null : Number(days),
      consequence: consequence === "" ? null : consequence,
    };
    run(() => updateConceptParameters(node.key, patch));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{node.name}</DialogTitle>
          <DialogDescription>
            {node.sourceClauseRef
              ? `Clause ${node.sourceClauseRef} of your contract.`
              : "Not yet matched to a clause in your contract."}{" "}
            These values decide the deadlines this project runs on.
          </DialogDescription>
        </DialogHeader>

        {!p.resolved && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            Nothing in your contract was matched to this step, so no deadline is being tracked
            for it. Fill it in below, or mark it as not in your contract.
          </p>
        )}

        {node.diverged.length > 0 && (
          <p className="rounded-md border p-3 text-sm">
            These differ from what was read out of the clause: {node.diverged.join(", ")}. That
            may be deliberate — the clause wording is left exactly as it is either way.
          </p>
        )}

        {node.clause?.text && (
          <div className="rounded-md border">
            <button
              type="button"
              onClick={() => setShowClause((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium"
            >
              <span>
                What your contract says
                {node.clause.page ? ` (page ${node.clause.page})` : ""}
              </span>
              <span className="text-xs text-muted-foreground">{showClause ? "Hide" : "Show"}</span>
            </button>

            {showClause && (
              <div className="space-y-3 border-t px-3 py-3">
                <div>
                  {node.clause.contractLabel && (
                    <p className="text-xs font-medium">{node.clause.contractLabel}</p>
                  )}
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                    {node.clause.text}
                  </p>
                </div>

                {node.clause.general && (
                  <div className="border-t pt-3">
                    <p className="text-xs font-medium">
                      {baseLabel}
                      {node.clause.general.sourceClauseRef
                        ? ` ${node.clause.general.sourceClauseRef}`
                        : ""}{" "}
                      — replaced by the above
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                      {node.clause.general.text}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="space-y-4">
          <Field
            label="Period in days"
            hint="Leave blank if the contract gives a reasonable time rather than a counted deadline."
            provenance={layerLabel(p.provenance.durationDays, baseLabel)}
            comparison={
              node.amendsGeneral && node.generalDurationDays !== null
                ? `${baseLabel}: ${node.generalDurationDays} days`
                : null
            }
          >
            <Input
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="No fixed period"
            />
          </Field>

          <Field label="Counted from" provenance={layerLabel(p.provenance.anchor, baseLabel)}>
            <select
              className={selectClass}
              value={anchor}
              onChange={(e) => setAnchor(e.target.value as Anchor | "")}
            >
              <option value="">No starting event</option>
              {validAnchors.map((a) => (
                <option key={a} value={a}>
                  {ANCHOR_LABELS[a]}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Who must act" provenance={layerLabel(p.provenance.owner, baseLabel)}>
            <select
              className={selectClass}
              value={owner}
              onChange={(e) => setOwner(e.target.value as Owner)}
            >
              {OWNERS.map((o) => (
                <option key={o} value={o}>
                  {OWNER_LABELS[o]}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="If the period runs out"
            provenance={layerLabel(p.provenance.consequence, baseLabel)}
          >
            <select
              className={selectClass}
              value={consequence}
              onChange={(e) => setConsequence(e.target.value as ConsequenceType | "")}
            >
              <option value="">Nothing — this is a trigger, not a deadline</option>
              {CONSEQUENCE_TYPES.map((c) => (
                <option key={c} value={c}>
                  {CONSEQUENCE_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>

          <label className="flex items-center gap-2 border-t pt-4 text-sm">
            <input
              type="checkbox"
              checked={!node.present}
              onChange={(e) => run(() => setConceptPresence(node.key, !e.target.checked))}
              className="h-4 w-4 rounded border-input"
            />
            My contract has no equivalent of this step
          </label>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            {hasManualEdit && (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => revertConceptToContract(node.key))}
              >
                Undo my changes
              </Button>
            )}
            {!node.confirmed && node.clause && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => run(() => confirmConcept(node.key))}
              >
                This is right
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending}>
              {pending ? "Saving" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  provenance,
  comparison,
  children,
}: {
  label: string;
  hint?: string;
  provenance: string;
  comparison?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">{provenance}</span>
      </div>
      {children}
      {comparison && <p className="text-xs text-muted-foreground">{comparison}</p>}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
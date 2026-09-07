"use client";

// components/contract/workflow-chain.tsx
//
// One workflow group: the steps in order, and the editor behind each one.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THIS IS A VERTICAL LIST AND NOT A ROW OF BOXES.
//
// The first version drew each step as an equal-width box in a horizontal row with the period on
// the connector. It read badly for a reason worth keeping in mind: the steps are NOT peers. A
// 28-day time bar that extinguishes an entitlement and a nominal determination window with no
// hard clock were getting identical boxes, which flattened the single most important thing on
// the page. Five boxes across also left no room for the clause reference, the owner, and the
// state, so all three got shrunk to unreadable chips.
//
// Vertically, each step gets a full row: the period can be typographically dominant, a time bar
// can be marked without competing for space, and the same layout works on a phone. The rail on
// the left carries the sequence.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from "react";
import type { WorkflowGroup, WorkflowNode } from "@/lib/contract/workflows";
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

export function WorkflowChain({ group, baseLabel }: { group: WorkflowGroup; baseLabel: string }) {
  const [editing, setEditing] = useState<WorkflowNode | null>(null);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{group.title}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">{group.description}</p>
      </div>

      <ol className="relative">
        {/* The rail. Inset to sit under the markers, and stopped short of the last row so the
            sequence reads as ending rather than continuing off the page. */}
        <div className="absolute bottom-8 left-[7px] top-4 w-px bg-border" aria-hidden />

        {group.nodes.map((node) => (
          <li key={node.key} className="relative pl-8">
            <Marker node={node} />
            <StepRow node={node} baseLabel={baseLabel} onEdit={() => setEditing(node)} />
          </li>
        ))}
      </ol>

      {editing && (
        <EditDialog node={editing} baseLabel={baseLabel} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}

/** Filled for a live step, hollow for one that is absent or not yet found. */
function Marker({ node }: { node: WorkflowNode }) {
  const live = node.present && node.parameters.resolved;
  return (
    <span
      aria-hidden
      className={`absolute left-0 top-[18px] h-[15px] w-[15px] rounded-full border-2 ${
        live ? "border-foreground bg-foreground" : "border-muted-foreground/40 bg-background"
      }`}
    />
  );
}

function StepRow({
  node,
  baseLabel,
  onEdit,
}: {
  node: WorkflowNode;
  baseLabel: string;
  onEdit: () => void;
}) {
  const timeBar = node.parameters.consequence === "condition_precedent";

  return (
    <button
      type="button"
      onClick={onEdit}
      className="group -mx-2 flex w-[calc(100%+1rem)] items-start gap-4 rounded-md px-2 py-3 text-left transition-colors hover:bg-accent"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className={`text-sm font-medium ${node.present ? "" : "line-through opacity-60"}`}>
            {node.name}
          </span>
          {node.sourceClauseRef && (
            <span className="text-xs text-muted-foreground">{node.sourceClauseRef}</span>
          )}
        </div>

        <p className="mt-0.5 text-sm text-muted-foreground">
          {node.present
            ? `${OWNER_LABELS[node.parameters.owner]} · ${node.caption}`
            : "Not in this contract"}
        </p>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          {timeBar && node.present && node.parameters.resolved && (
            <span className="font-medium text-destructive">Missing this loses the claim</span>
          )}
          {node.amendsGeneral && node.generalDurationDays !== null && (
            <span className="text-muted-foreground">
              {baseLabel} says {node.generalDurationDays} days
            </span>
          )}
          {!node.confirmed && node.present && node.parameters.resolved && (
            <span className="text-muted-foreground">Needs checking</span>
          )}
          {node.diverged.length > 0 && (
            <span className="text-muted-foreground">Differs from the clause</span>
          )}
        </div>
      </div>

      {/* The period, typographically dominant — it is what the page is for. */}
      <div className="shrink-0 pt-0.5 text-right">
        {!node.present ? null : !node.parameters.resolved ? (
          <span className="text-sm text-muted-foreground">Not set</span>
        ) : node.parameters.durationDays === null ? (
          <span className="text-sm text-muted-foreground">No fixed period</span>
        ) : (
          <>
            <span className="text-2xl font-semibold tabular-nums leading-none">
              {node.parameters.durationDays}
            </span>
            <span className="ml-1 text-xs text-muted-foreground">days</span>
          </>
        )}
      </div>
    </button>
  );
}

function EditDialog({
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

        {/* The clause, in the same view as the values derived from it. This is the whole
            proofreading surface: reading the wording next to the number beats a separate
            clause browser nobody opens. */}
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

                {/* Both layers, when a particular amended the general condition — which is how
                    a contract administrator actually reads: standard clause, then the
                    amendment on top. */}
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

/** A labelled field that also says where its current value came from. Provenance sits next to
 *  the input because "is this the standard period or did my contract change it?" is the
 *  question this page exists to answer. */
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
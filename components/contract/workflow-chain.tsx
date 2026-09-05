"use client";

// components/contract/workflow-chain.tsx
//
// The visual surface for one workflow group, and the editor for the parameters behind it.
//
// One design decision worth naming: the period is drawn as the CONNECTOR between two nodes,
// not as text inside a node. That is what a contractual period actually is — the waiting time
// between two events, owned by whoever must act in it. Putting "28 days" inside a box would
// make it read as an attribute of the notice; putting it on the arrow makes it read as the
// clock the contractor is running against, which is the thing the contractor is worried about.

import { useState, useTransition } from "react";
import type { WorkflowGroup, WorkflowNode } from "@/lib/contract/workflows";
import { CONCEPTS } from "@/lib/contract/concepts";
import { OWNERS, CONSEQUENCE_TYPES } from "@/lib/contract/types";
import type { Anchor, ConceptParametersOverride, ConsequenceType, Owner } from "@/lib/contract/types";
import { updateConceptParameters, setConceptPresence, confirmConcept } from "@/app/actions/contract-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  statement_received: "Engineer receiving the Statement",
  payment_due_date: "The payment due date",
  claim_received: "Engineer receiving the claim",
  consultation_complete: "End of consultation",
  suspension_notice_served: "Serving the notice",
  instruction_required: "When the instruction was needed",
};

const CONSEQUENCE_LABELS: Record<ConsequenceType, string> = {
  condition_precedent: "Entitlement is lost if the period is missed",
  soft_support: "Lateness weakens the claim but does not bar it",
  counterparty_default: "The other party is in default — chase it",
  accrues_charges: "Charges start accruing",
  enables_right: "A right unlocks once the period runs",
};

const OWNER_LABELS: Record<Owner, string> = {
  contractor: "You",
  engineer: "Engineer",
  employer: "Employer",
};

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50";

export function WorkflowChain({ group }: { group: WorkflowGroup }) {
  const [editing, setEditing] = useState<WorkflowNode | null>(null);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{group.title}</h2>
        <p className="max-w-prose text-sm text-muted-foreground">{group.description}</p>
      </div>

      <div className="flex flex-col gap-0 lg:flex-row lg:items-stretch">
        {group.nodes.map((node, i) => (
          <div key={node.key} className="flex flex-col lg:flex-row lg:items-stretch">
            <NodeCard node={node} onEdit={() => setEditing(node)} />
            {i < group.nodes.length - 1 && <Connector node={group.nodes[i + 1]!} />}
          </div>
        ))}
      </div>

      {editing && (
        <EditDialog
          node={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function NodeCard({ node, onEdit }: { node: WorkflowNode; onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className={`w-full rounded-md border p-3 text-left transition-colors hover:bg-accent lg:w-48 ${
        node.present ? "" : "border-dashed opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-tight">{node.name}</span>
        {node.sourceClauseRef && (
          <span className="shrink-0 text-xs text-muted-foreground">{node.sourceClauseRef}</span>
        )}
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        {node.present ? OWNER_LABELS[node.parameters.owner] : "Not in this contract"}
      </p>

      <div className="mt-2 flex flex-wrap gap-1">
        {node.parameters.consequence === "condition_precedent" && (
          <Badge variant="destructive" className="text-[10px]">Time bar</Badge>
        )}
        {!node.confirmed && node.present && (
          <Badge variant="outline" className="text-[10px]">Needs checking</Badge>
        )}
        {node.diverged.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">Differs from clause</Badge>
        )}
      </div>
    </button>
  );
}

/**
 * The connector carries the NEXT node's period — the wait before that step falls due. Rendered
 * as a vertical rule on narrow screens and a horizontal one from lg up, so the chain reads top
 * to bottom on a phone and left to right on a desktop without a second markup tree.
 */
function Connector({ node }: { node: WorkflowNode }) {
  const label =
    node.parameters.durationDays === null ? "no fixed period" : `${node.parameters.durationDays} days`;

  return (
    <div className="flex items-center justify-center px-0 py-2 lg:flex-col lg:px-3 lg:py-0">
      <div className="h-6 w-px bg-border lg:h-px lg:w-6" aria-hidden />
      <span className="px-2 text-xs tabular-nums text-muted-foreground lg:px-0 lg:py-1">
        {label}
      </span>
      <div className="hidden h-6 w-px bg-border lg:block lg:h-px lg:w-6" aria-hidden />
    </div>
  );
}

function EditDialog({ node, onClose }: { node: WorkflowNode; onClose: () => void }) {
  const [days, setDays] = useState<string>(
    node.parameters.durationDays === null ? "" : String(node.parameters.durationDays),
  );
  const [owner, setOwner] = useState<Owner>(node.parameters.owner);
  const [anchor, setAnchor] = useState<Anchor | "">(node.parameters.anchor ?? "");
  const [consequence, setConsequence] = useState<ConsequenceType | "">(
    node.parameters.consequence ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const validAnchors = CONCEPTS[node.key].validAnchors;

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{node.name}</DialogTitle>
          <DialogDescription>
            {node.sourceClauseRef
              ? `Clause ${node.sourceClauseRef} of your contract.`
              : "Not yet mapped to a clause in your contract."}{" "}
            Changing these values changes the deadlines this project runs on.
          </DialogDescription>
        </DialogHeader>

        {node.diverged.length > 0 && (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
            These values differ from what was read out of the clause
            {node.diverged.length === 1 ? "" : "s"}: {node.diverged.join(", ")}. That may be
            deliberate — the clause text is left exactly as it was either way.
          </p>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="days">Period in days</Label>
            <Input
              id="days"
              inputMode="numeric"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="Leave blank for no fixed period"
            />
            <p className="text-xs text-muted-foreground">
              Blank means a reasonable time rather than a counted deadline.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="anchor">Counted from</Label>
            <select
              id="anchor"
              className={selectClass}
              value={anchor}
              onChange={(e) => setAnchor(e.target.value as Anchor | "")}
            >
              <option value="">No starting event</option>
              {validAnchors.map((a) => (
                <option key={a} value={a}>{ANCHOR_LABELS[a]}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="owner">Who must act</Label>
            <select
              id="owner"
              className={selectClass}
              value={owner}
              onChange={(e) => setOwner(e.target.value as Owner)}
            >
              {OWNERS.map((o) => (
                <option key={o} value={o}>{OWNER_LABELS[o]}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="consequence">If the period runs out</Label>
            <select
              id="consequence"
              className={selectClass}
              value={consequence}
              onChange={(e) => setConsequence(e.target.value as ConsequenceType | "")}
            >
              <option value="">Nothing — this is a trigger, not a deadline</option>
              {CONSEQUENCE_TYPES.map((c) => (
                <option key={c} value={c}>{CONSEQUENCE_LABELS[c]}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
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
          {!node.confirmed && node.sourceClauseRef && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => confirmConcept(node.key))}
            >
              These are right
            </Button>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button onClick={save} disabled={pending}>
              {pending ? "Saving" : "Save changes"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
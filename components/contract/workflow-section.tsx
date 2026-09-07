"use client";

// components/contract/workflow-section.tsx
//
// One workflow, collapsed to a strip of steps you can read at a glance, expanded to the full
// rows you can edit.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHY THE CONNECTORS CARRY NO NUMBERS.
//
// The obvious drawing is `Notice --42--> Particulars`, and it is wrong. A number on an arrow
// says "this period counts from the node behind it", and under SC 20.1 the 42-day particulars
// period counts from the same awareness date the 28-day notice does — not from the notice.
// Payment is worse: BOTH the 28-day IPC clock and the 56-day payment clock run from the
// Engineer's receipt of the Statement, so an arrow between IPC and Payment implies an additive
// gap that does not exist and makes every payment deadline look later than it is.
//
// So the connectors mean only "then", and each step carries its own period AND its own origin
// underneath. Two steps that share an origin visibly say so, which no arrow chain can.
// ─────────────────────────────────────────────────────────────────────────────

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { WorkflowGroup, WorkflowNode } from "@/lib/contract/workflows";
import type { Owner } from "@/lib/contract/types";
import { ConceptEditDialog } from "./concept-edit-dialog";

/** Short forms for the chain strip. The long prose forms live in workflows.ts `caption`. */
const SHORT_ANCHOR: Record<string, string> = {
  contractor_awareness: "from awareness",
  statement_received: "from the Statement",
  payment_due_date: "from the due date",
  claim_received: "from claim receipt",
  consultation_complete: "from consultation",
  suspension_notice_served: "from the notice",
  instruction_required: "from when needed",
};

const OWNER_LABELS: Record<Owner, string> = {
  contractor: "You",
  engineer: "Engineer",
  employer: "Employer",
};

function needsAttention(node: WorkflowNode): boolean {
  return node.present && (!node.parameters.resolved || !node.confirmed || node.diverged.length > 0);
}

export function WorkflowSection({
  group,
  baseLabel,
}: {
  group: WorkflowGroup;
  baseLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WorkflowNode | null>(null);

  const attention = group.nodes.filter(needsAttention).length;

  return (
    <section className="rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-4 rounded-t-md px-4 py-3 text-left transition-colors hover:bg-accent/50"
      >
        <div className="min-w-0">
          <h3 className="font-medium">{group.title}</h3>
          <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">{group.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          {attention > 0 && (
            <span className="rounded-full border px-2 py-0.5 text-xs">{attention} to check</span>
          )}
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        </div>
      </button>

      {/* The strip. Horizontally scrollable rather than wrapping — a chain that wraps stops
          reading as a sequence. */}
      <div className="overflow-x-auto border-t px-4 py-4">
        <div className="flex min-w-max items-start">
          {group.nodes.map((node, i) => (
            <Fragment key={node.key}>
              {i > 0 && (
                <ChevronRight
                  className="mt-[3px] h-4 w-4 shrink-0 text-muted-foreground/40"
                  aria-hidden
                />
              )}
              <ChainNode node={node} />
            </Fragment>
          ))}
        </div>
      </div>

      {open && (
        <div className="border-t">
          <ul className="divide-y">
            {group.nodes.map((node) => (
              <li key={node.key}>
                <StepRow node={node} baseLabel={baseLabel} onEdit={() => setEditing(node)} />
              </li>
            ))}
          </ul>
          <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
            Click any step to see the clause it came from and change what this project counts.
          </p>
        </div>
      )}

      {editing && (
        <ConceptEditDialog
          node={editing}
          baseLabel={baseLabel}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

/**
 * Four states, and they are written in words rather than encoded in a dot.
 *
 * The two that must never be confused are "no fixed period" and "not set". The first means the
 * contract gives a reasonable time rather than a counted one — real, tracked, no date. The
 * second means nothing was found — no obligation is being watched at all. They produce the same
 * blank space on a calendar and mean opposite things, and a user who reads one as the other
 * stops watching a clock that is still running.
 */
function stateOf(node: WorkflowNode): { text: string; tone: string } {
  if (!node.present) return { text: "Not in this contract", tone: "text-muted-foreground" };
  if (!node.parameters.resolved) return { text: "Not set", tone: "text-amber-600 font-medium" };
  if (node.parameters.durationDays === null)
    return { text: "No fixed period", tone: "text-muted-foreground" };
  return { text: "", tone: "" };
}

function ChainNode({ node }: { node: WorkflowNode }) {
  const p = node.parameters;
  const counted = node.present && p.resolved && p.durationDays !== null;
  const timeBar = node.present && p.resolved && p.consequence === "condition_precedent";
  const state = stateOf(node);

  return (
    <div className="w-[7.5rem] shrink-0 px-1 text-center">
      <div className="flex justify-center">
        {/* Filled only where a real date is computed. The dot marks the sequence; the words
            below carry the meaning. */}
        <span
          className={`h-[13px] w-[13px] rounded-full border-2 ${
            counted ? "border-foreground bg-foreground" : "border-muted-foreground/50 bg-background"
          }`}
          aria-hidden
        />
      </div>

      <p
        className={`mt-2 text-xs font-medium leading-tight ${
          node.present ? "" : "text-muted-foreground line-through"
        }`}
      >
        {node.name}
      </p>

      {counted ? (
        <>
          <p className="mt-1 text-sm font-semibold leading-tight tabular-nums">
            {p.durationDays} <span className="text-xs font-normal">days</span>
          </p>
          {p.anchor && (
            <p className="text-[11px] leading-tight text-muted-foreground">
              {SHORT_ANCHOR[p.anchor] ?? p.anchor}
            </p>
          )}
          {timeBar && (
            <p className="mt-1 text-[11px] font-medium leading-tight text-destructive">Time bar</p>
          )}
        </>
      ) : (
        <p className={`mt-1 text-[11px] leading-tight ${state.tone}`}>{state.text}</p>
      )}
    </div>
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
      className="flex w-full items-start gap-4 px-4 py-3 text-left transition-colors hover:bg-accent"
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

      <div className="shrink-0 pt-0.5 text-right">
        {!node.present ? null : !node.parameters.resolved ? (
          <span className="text-sm text-muted-foreground">Not set</span>
        ) : node.parameters.durationDays === null ? (
          <span className="text-sm text-muted-foreground">No fixed period</span>
        ) : (
          <>
            <span className="text-2xl font-semibold leading-none tabular-nums">
              {node.parameters.durationDays}
            </span>
            <span className="ml-1 text-xs text-muted-foreground">days</span>
          </>
        )}
      </div>
    </button>
  );
}
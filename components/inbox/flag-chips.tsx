"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  HelpCircle,
  FileQuestion,
} from "lucide-react";

/**
 * Both flag axes on ONE chip. The alignment concern (contentious /
 * against_contract) and the clarity concern (unclear) are merged into a single
 * clickable chip — e.g. "Against contract & Unclear" — opening ONE popover.
 * `aligned` stays a separate quiet, non-clickable badge (nothing to act on);
 * `clear` / null show nothing.
 *
 * The popover shows the `why` (ai_notes) verbatim with line breaks preserved,
 * so when the further-info route writes it as labelled lines
 * ("Contentious — …" / "Unclear — …" / "Overall — …") each concern reads
 * distinctly. Then the suggested query preview, then Request Further Info
 * (saved) or a muted "Save this item…" (unsaved). Re-clicking closes it.
 */

const CHIP =
  "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold";

const ALIGN_META: Record<
  string,
  { label: string; className: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  aligned: {
    label: "Aligned",
    className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    Icon: ShieldCheck,
  },
  contentious: {
    label: "Contentious",
    className: "bg-amber-100 text-amber-900 border-amber-200",
    Icon: ShieldAlert,
  },
  against_contract: {
    label: "Against contract",
    className: "bg-red-100 text-red-800 border-red-200",
    Icon: ShieldX,
  },
};

const UNCLEAR_META = {
  label: "Unclear",
  className: "bg-slate-100 text-slate-700 border-slate-200",
  Icon: HelpCircle,
};

export function FlagChips({
  alignment,
  clarity,
  why,
  suggestedQuery,
  evidenceId,
}: {
  alignment?: string | null;
  clarity?: string | null;
  why?: string | null;
  suggestedQuery?: string | null;
  evidenceId?: string | null; // present ⇒ saved ⇒ can raise an RFI
}) {
  const router = useRouter();

  const alignActionable =
    alignment === "contentious" || alignment === "against_contract";
  const clarityUnclear = clarity === "unclear";
  const hasActionable = alignActionable || clarityUnclear;

  const queryLines = (suggestedQuery ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  // One merged label + leading icon(s) for the single chip.
  const parts: string[] = [];
  if (alignActionable) parts.push(ALIGN_META[alignment as string].label);
  if (clarityUnclear) parts.push(UNCLEAR_META.label);
  const combinedLabel = parts.join(" & ");
  // Colour by the alignment concern when present (the weightier axis), else slate.
  const chipClass = alignActionable
    ? ALIGN_META[alignment as string].className
    : UNCLEAR_META.className;

  function raiseRfi(e: React.MouseEvent) {
    e.stopPropagation();
    if (!evidenceId) return;
    router.push(`/rfi?evidence=${evidenceId}&ts=${Date.now()}`);
  }

  if (alignment !== "aligned" && !hasActionable) return null;

  return (
    <span className="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {/* Quiet, non-interactive badge for the aligned case. */}
      {alignment === "aligned" && (
        <span className={`${CHIP} ${ALIGN_META.aligned.className}`}>
          <ShieldCheck className="h-3 w-3" /> Aligned
        </span>
      )}

      {hasActionable && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className={`${CHIP} ${chipClass} cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring`}
            >
              {alignActionable &&
                React.createElement(ALIGN_META[alignment as string].Icon, { className: "h-3 w-3" })}
              {clarityUnclear && <HelpCircle className="h-3 w-3" />}
              {combinedLabel}
            </button>
          </PopoverTrigger>

          <PopoverContent
            align="end"
            className="w-80 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">
                Why this is flagged{combinedLabel ? ` — ${combinedLabel}` : ""}
              </p>
              <p className="whitespace-pre-wrap text-sm">
                {why?.trim() || "No explanation recorded for this item."}
              </p>
            </div>

            {queryLines.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">
                  Suggested request for information
                </p>
                <ul className="space-y-0.5 text-sm">
                  {queryLines.map((q, i) => (
                    <li key={i} className="text-muted-foreground">• {q}</li>
                  ))}
                </ul>
              </div>
            )}

            {evidenceId ? (
              <Button size="sm" className="w-full" onClick={raiseRfi}>
                <FileQuestion className="mr-1.5 h-4 w-4" /> Request Further Info
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Save this item to raise an RFI.
              </p>
            )}
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}
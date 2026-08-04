// lib/fidic/scl-grounding.ts
// SCL Delay and Disruption Protocol (2nd ed., 2017) guidance for claim drafting.
// Injected into the claim prompt only when the claim is delay/disruption-
// flavoured or seeks time. Paraphrased methodology — not the Protocol's text.

/** Claim categories that are inherently time-related (claim-builder TYPES values). */
const TIME_FLAVOURED = new Set(["delay_eot", "disruption", "acceleration"]);

/** SCL applies when relief includes time, or the category is time-flavoured. */
export function shouldApplySCL(
  type: string | null | undefined,
  relief: string | null | undefined,
): boolean {
  return relief === "time" || relief === "both" || TIME_FLAVOURED.has(type ?? "");
}

export const SCL_GROUNDING = [
  "When the claim concerns delay or disruption, apply the methodology of the SCL Delay and Disruption",
  "Protocol (2nd edition, 2017) as good-practice guidance. The Protocol is not part of the contract and",
  "does not override it; use it to shape the analysis and narrative, while entitlement remains grounded in",
  "the contract sub-clauses. Apply the following where relevant:",
  "- Distinguish extension of time (relief from delay damages, assessed on the critical path to completion)",
  "  from compensation for the time-related cost of prolongation. Only delay to the completion date founds an EOT.",
  "- Assess delay against a logic-linked programme using a method suited to the available records — e.g. time",
  "  impact analysis or a windows / time-slice approach where a contemporaneous programme exists, or an",
  "  as-planned versus as-built comparison where it does not. Do not assert a method or result the records do not support.",
  "- Prefer a prospective assessment made close to the delaying event over a deferred 'wait and see' approach,",
  "  consistent with the notice-driven procedure of the contract.",
  "- On concurrent delay, where an employer-risk and a contractor-risk event each independently delay completion",
  "  over the same period, entitlement to an extension of time is generally not reduced by the concurrent",
  "  contractor delay; recovery of prolongation cost, however, may be limited to periods of employer-caused delay.",
  "- Treat float as a project resource generally not owned by either party; what matters is the effect on the",
  "  completion date, not consumption of float on non-critical paths.",
  "- For disruption (lost productivity, distinct from delay to completion), prefer a measured-mile comparison",
  "  between an un-impacted and an impacted period where the data allows, over a purely theoretical calculation.",
  "- Avoid unparticularised global or total-cost claims; establish cause and effect for each head so far as the",
  "  records permit, and mark clearly where substantiation is still to be supplied.",
  "- Distinguish instructed or agreed acceleration from constructive acceleration, and only advance the latter",
  "  where the facts support it.",
  "Apply the Protocol's reasoning; do not reproduce its text. Never invent the number of days or the analysis",
  "inputs — use only figures the user supplied and mark gaps with placeholders.",
].join("\n");
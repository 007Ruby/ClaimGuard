// lib/contract/profile-adapter.ts
//
// The bridge between the ContractProfile and the frozen deterministic engine.
//
// The engine is already parameterised for durations: stepDue() computes
// `dayOverrides[step.id] ?? step.days`. So this is an ADAPTER, not an engine rewrite — the
// profile is the source of truth and this projects it down to the dayOverrides shape the
// engine eats, at read time, from the query layer.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT REACHES THE ENGINE, AND WHAT DOES NOT.
//
//   Reaches it:  durationDays  →  dayOverrides[engineStepId]
//
//   Does not (carried in the profile for the Workflows page and the bot, but the engine still
//   uses its own hardcoded values in clauses.ts):
//     • consequence     — timeBarred / nominal are hardcoded booleans on each ClauseStep
//     • challengeWindow — no engine node for it
//     • absentConcepts  — the chain is fixed; a step cannot be deleted from the engine's walk
//     • anchor / owner  — the engine uses its own DeadlineAnchor and party per step
//
// ⚠ KNOWN LIMITATION — UNRESOLVED CONCEPTS ON A BESPOKE CONTRACT.
//
// When a concept is unresolved, this adapter correctly emits no override. But the engine then
// falls back to `step.days` in clauses.ts, which holds the FIDIC number — so the engine
// computes a 28-day notice deadline for a bespoke contract that may have no notice provision
// at all. The adapter cannot fix this: expressing "no clock" needs a value the engine's
// override contract has no room for (it accepts only positive day counts).
//
// Until the engine learns step presence, the mitigation is at the query layer: call
// unresolvedConcepts() and skip events whose concept is unresolved, rather than displaying a
// deadline derived from a FIDIC default the contract never adopted. loadChatDigest() and the
// event-flag loaders are the two places that matters.
// ─────────────────────────────────────────────────────────────────────────────

import type { ConceptKey, EngineProfileView } from './types';
import { CONCEPT_KEYS } from './types';
import { CONCEPTS } from './concepts';
import { resolveParameter } from './resolve';

/**
 * projectDayOverrides — derive the engine's dayOverrides map from a profile.
 *
 * Emits only positive day counts from RESOLVED concepts with a matching engineStepId,
 * reproducing the engine's own override semantics (clauses.ts accepts an override only when
 * `> 0`). Nominal and unresolved concepts are omitted.
 *
 * For a FIDIC profile with empty stored layers this returns exactly the six EDITABLE_PERIODS
 * keys at their GC values, so engine output is unchanged from before the profile existed.
 *
 * Parameter type is EngineProfileView: this function is structurally incapable of reading
 * clause prose. Keep it that way.
 */
export function projectDayOverrides(profile: EngineProfileView): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of CONCEPT_KEYS) {
    const stepId = CONCEPTS[key].engineStepId;
    if (!stepId) continue;

    const p = resolveParameter(profile, key);
    if (!p.resolved) continue; // no layer described this concept — say nothing to the engine

    if (typeof p.durationDays === 'number' && p.durationDays > 0) out[stepId] = p.durationDays;
  }
  return out;
}

/**
 * Structurally a ContractContext (lib/fidic/engine.ts). Declared here rather than imported so
 * this lib carries no dependency on the frozen core.
 */
export interface EngineContractContext {
  commencementDate: string;
  dayOverrides: Record<string, number>;
}

export function profileToContractContext(
  profile: EngineProfileView,
  commencementDate: string,
): EngineContractContext {
  return { commencementDate, dayOverrides: projectDayOverrides(profile) };
}

/** Engine step id → concept key. The inverse of CONCEPTS[key].engineStepId, built once. */
const STEP_TO_CONCEPT: Record<string, ConceptKey> = Object.fromEntries(
  CONCEPT_KEYS.map((k) => [CONCEPTS[k].engineStepId, k] as const).filter(
    (e): e is readonly [string, ConceptKey] => e[0] !== null,
  ),
);

/**
 * Map an engine step back to a concept. Returns null for a step the profile does not model.
 *
 * This doubles as a live check on concepts.ts: if this returns null for a step id you know
 * exists in clauses.ts, the engineStepId values are wrong and projectDayOverrides has been
 * silently emitting nothing for that step.
 */
export function conceptForEngineStep(stepId: string): ConceptKey | null {
  return STEP_TO_CONCEPT[stepId] ?? null;
}

/**
 * Runtime guard for the JSONB coming out of project_contracts.data. Supabase types that column
 * as Json, so it is `unknown` in practice; this is the one place the narrowing happens rather
 * than an `as any` at each call site.
 *
 * Checks both stored layers exist, because a profile written before the layering migration has
 * a flat `parameters` map and would otherwise resolve every field to unresolved — failing
 * loudly here is better than a project silently losing all its deadlines.
 */
export function isStoredContractProfile(value: unknown): value is EngineProfileView {
  if (typeof value !== 'object' || value === null) return false;
  const params = (value as { parameters?: unknown }).parameters;
  if (typeof params !== 'object' || params === null) return false;
  const p = params as { contract?: unknown; manual?: unknown };
  const meta = (value as { meta?: unknown }).meta;
  return (
    typeof p.contract === 'object' && p.contract !== null &&
    typeof p.manual === 'object' && p.manual !== null &&
    typeof meta === 'object' && meta !== null
  );
}
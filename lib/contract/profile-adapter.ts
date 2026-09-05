// lib/contract/profile-adapter.ts
//
// PHASE 0 — the bridge between the ContractProfile and the existing deterministic engine.
//
// Key fact from lib/fidic/engine.ts + clauses.ts: the engine is ALREADY parameterised for
// durations. `stepDue()` computes `dayOverrides[step.id] ?? step.days`, and `dayOverrides` is
// a per-contract map keyed by engine step id. So per-contract *periods* are a solved problem
// in the codebase already.
//
// Therefore Phase 0 is an ADAPTER, not an engine rewrite. engine.ts and clauses.ts are NOT
// touched. The ContractProfile becomes the source of truth, and this file projects it down to
// exactly the dayOverrides shape the frozen engine eats — at read time, from the query layer.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT REACHES THE ENGINE IN MVP, AND WHAT DOES NOT — read this before extending.
//
//   Reaches the engine now:   durationDays  →  dayOverrides[engineStepId]
//
//   Does NOT reach the engine yet (carried in the profile for the Workflows tab and the bot,
//   but the engine still uses its own hardcoded values in clauses.ts):
//     • consequence     — timeBarred / nominal are hardcoded booleans on each ClauseStep. A
//                         contract that flips determination into a time bar, or drops the
//                         condition-precedent status of a notice, is NOT honoured today.
//     • challengeWindow — same reason; there is no engine node for it.
//     • absentConcepts  — the chain is fixed in clauses.ts. A contract with no separate IPC
//                         step cannot delete that node from the engine's walk today.
//     • anchor / owner  — the engine uses its own DeadlineAnchor + party per step.
//
// Those are the genuine "not yet parameterised" parts of the engine, and wiring them is a
// deliberate, tested change to the frozen core — deferred until a real custom contract needs
// it. For the overwhelmingly common UAE case (same structure, amended periods) duration
// projection is sufficient and this adapter is the whole of Phase 0.
// ─────────────────────────────────────────────────────────────────────────────

import type { ConceptKey, EngineProfileView } from './types';
import { CONCEPT_KEYS } from './types';
import { CONCEPTS } from './concepts';
import { resolveParameter } from './resolve';

/**
 * projectDayOverrides — derive the engine's dayOverrides map from a profile.
 *
 * Only positive day counts with a matching engineStepId are emitted, reproducing the engine's
 * own override semantics (clauses.ts accepts an override only when `> 0`). Nominal /
 * null-period concepts (statement, financing, determination, delayed instruction) are
 * omitted, so the engine falls back to its own step.days for them — exactly as today.
 *
 * For a pure-FIDIC profile (empty overrides) this returns precisely the six EDITABLE_PERIODS
 * keys with their GC values, i.e. identical to the dayOverrides stored today, so engine
 * output is byte-identical. Verify that with a fixture test against the reference contract's
 * stored dayOverrides before switching the query layer over.
 *
 * The parameter type is EngineProfileView, not StoredContractProfile: this function is
 * structurally incapable of reading clause prose. Keep it that way.
 */
export function projectDayOverrides(profile: EngineProfileView): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of CONCEPT_KEYS as readonly ConceptKey[]) {
    const stepId = CONCEPTS[key].engineStepId;
    if (!stepId) continue;
    const days = resolveParameter(profile, key).durationDays;
    if (typeof days === 'number' && days > 0) out[stepId] = days;
  }
  return out;
}

/**
 * The object the engine's resolveObligation() takes as its `contract` argument. Structurally
 * a ContractContext (lib/fidic/engine.ts: { commencementDate; dayOverrides? }), declared here
 * rather than imported so this lib has no dependency on the frozen core.
 */
export interface EngineContractContext {
  commencementDate: string;
  dayOverrides: Record<string, number>;
}

/** Convenience wrapper: profile + commencement date → the engine's contract context. */
export function profileToContractContext(
  profile: EngineProfileView,
  commencementDate: string,
): EngineContractContext {
  return { commencementDate, dayOverrides: projectDayOverrides(profile) };
}

/**
 * isStoredContractProfile — runtime guard for the JSON coming out of
 * project_contracts.data. Supabase types that column as Json, so it is `unknown` in practice;
 * this is the single place that narrowing happens, rather than an `as any` at each call site.
 *
 * Deliberately shallow: it checks the shape the adapter depends on (a `parameters` object),
 * not every field. A malformed profile degrades to "no overrides", which means GC defaults —
 * a safe failure mode, and one the caller can detect by the guard returning false.
 */
export function isStoredContractProfile(value: unknown): value is EngineProfileView {
  if (typeof value !== 'object' || value === null) return false;
  const params = (value as { parameters?: unknown }).parameters;
  return typeof params === 'object' && params !== null && !Array.isArray(params);
}
/** Engine step id → concept key. The inverse of CONCEPTS[key].engineStepId, built once. */
const STEP_TO_CONCEPT: Record<string, ConceptKey> = Object.fromEntries(
  (Object.keys(CONCEPTS) as ConceptKey[])
    .map((k) => [CONCEPTS[k].engineStepId, k] as const)
    .filter((e): e is readonly [string, ConceptKey] => e[0] !== null),
);

export function conceptForEngineStep(stepId: string): ConceptKey | null {
  return STEP_TO_CONCEPT[stepId] ?? null;
}
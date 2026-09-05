// lib/contract/resolve.ts
//
// THE single resolver for the parameters layer, plus divergence and seed helpers. Every
// consumer — the engine adapter, the Workflows UI, the extraction confirm step — resolves
// through resolveParameter(), so there is exactly one place the sparse-override →
// FIDIC-default merge happens. This is the generalisation of the old resolveDays(): FIDIC is
// no longer a baseline baked into the engine, it is just the fallback record this file reads.
//
// Note the signature of resolveParameter: it takes EngineProfileView, not a full profile. It
// physically cannot read clause prose, and neither can anything downstream of it.

import type {
  ConceptKey,
  ConceptParameters,
  ContractProfileSeedInput,
  EngineProfileView,
  ResolvedConcept,
  ResolvedContractProfile,
  StoredContractProfile,
} from './types';
import { CONCEPT_KEYS } from './types';
import { CONCEPTS } from './concepts';
import { FIDIC_DEFAULTS } from './fidic-defaults';

/**
 * resolveParameter — merge a profile's sparse override over the FIDIC default, field by
 * field, for one concept.
 *
 * `undefined` means "inherit the default"; `null` is a MEANINGFUL override (explicit
 * nominal / not-applicable) and is preserved. That distinction is why the nullable fields
 * use an explicit `!== undefined` test rather than `??`.
 */
export function resolveParameter(
  profile: EngineProfileView,
  key: ConceptKey,
): ConceptParameters {
  const base = FIDIC_DEFAULTS[key];
  const o = profile.parameters[key] ?? {};

  const merged: ConceptParameters = {
    owner: o.owner ?? base.owner,
    anchor: o.anchor !== undefined ? o.anchor : base.anchor,
    durationDays: o.durationDays !== undefined ? o.durationDays : base.durationDays,
    consequence: o.consequence !== undefined ? o.consequence : base.consequence,
  };

  // Optional extensions assigned conditionally so we never write an explicit `undefined`
  // onto an optional property (keeps this valid under exactOptionalPropertyTypes).
  const financingRate = o.financingRate ?? base.financingRate;
  if (financingRate) merged.financingRate = financingRate;

  const challengeWindow = o.challengeWindow ?? base.challengeWindow;
  if (challengeWindow) merged.challengeWindow = challengeWindow;

  return merged;
}

/** Back-compat shim for call sites that only want the day count (the old resolveDays()). */
export function resolveDays(profile: EngineProfileView, key: ConceptKey): number | null {
  return resolveParameter(profile, key).durationDays;
}

/**
 * checkDivergence — has a human edited a live parameter away from what extraction READ from
 * the clause? Returns the fields that differ.
 *
 * This is INFORMATION to surface on the Workflows / clause page ("your value differs from
 * the clause it came from — intentional?"), never auto-reconciled. Editing a parameter must
 * never write back to clause text: the prose is the record of what was agreed, the parameter
 * is the engine's reading of it. Equally, editing a parameter must never rewrite
 * `extractedParameters` — that snapshot is the fixed baseline this compares against.
 */
export function checkDivergence(
  profile: Pick<StoredContractProfile, 'parameters' | 'clauseMap'>,
  key: ConceptKey,
): (keyof ConceptParameters)[] {
  const extracted = profile.clauseMap[key]?.extractedParameters;
  if (!extracted) return [];

  // Compare against the RESOLVED live value, not the raw override: a concept that inherits
  // the FIDIC default still diverges if extraction read something different from the clause.
  const live = resolveParameter(profile, key);

  const diverged: (keyof ConceptParameters)[] = [];
  const primitiveFields = ['owner', 'anchor', 'durationDays', 'consequence'] as const;
  for (const f of primitiveFields) {
    const e = extracted[f];
    if (e !== undefined && e !== live[f]) diverged.push(f);
  }

  // Objects get a shallow structural compare rather than reference identity.
  if (
    extracted.financingRate &&
    JSON.stringify(extracted.financingRate) !== JSON.stringify(live.financingRate)
  ) {
    diverged.push('financingRate');
  }
  if (
    extracted.challengeWindow &&
    JSON.stringify(extracted.challengeWindow) !== JSON.stringify(live.challengeWindow)
  ) {
    diverged.push('challengeWindow');
  }

  return diverged;
}

/**
 * resolveProfile — materialise the full nested view for the Workflows tab and the bot.
 * Never persisted and never handed to the engine (the engine takes EngineProfileView).
 */
export function resolveProfile(profile: StoredContractProfile): ResolvedContractProfile {
  const absent = new Set(profile.absentConcepts);

  const concepts = {} as Record<ConceptKey, ResolvedConcept>;
  for (const key of CONCEPT_KEYS) {
    const clause = profile.clauseMap[key] ?? null;
    concepts[key] = {
      key,
      present: !absent.has(key),
      parameters: resolveParameter(profile, key),
      clause,
      diverged: checkDivergence(profile, key),
    };
  }

  return {
    meta: profile.meta,
    concepts,
    unmappedClauses: profile.unmappedClauses,
    notes: profile.notes,
  };
}

/** Default UI label for a concept, honouring any per-contract alias. */
export function conceptLabel(profile: StoredContractProfile, key: ConceptKey): string {
  return profile.clauseMap[key]?.canonicalName ?? CONCEPTS[key].canonicalName;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed helpers
// ─────────────────────────────────────────────────────────────────────────────

function emptyProfile(
  input: ContractProfileSeedInput,
  baseLabel: string,
  profileType: 'fidic' | 'custom',
): StoredContractProfile {
  const now = input.now ?? new Date().toISOString();
  return {
    meta: { profileType, baseLabel, createdAt: now, updatedAt: now },
    parameters: {},
    clauseMap: {},
    absentConcepts: [],
    unmappedClauses: [],
    notes: null,
  };
}

/**
 * A fresh FIDIC profile: empty overrides, so every concept resolves to pure GC defaults, and
 * an empty clauseMap.
 *
 * clauseMap is deliberately EMPTY here rather than pre-filled: GC clause TEXT comes from
 * ClaimGuard's licensed FIDIC asset and is injected by the seeding routine that has access
 * to it (see the note in fidic-defaults.ts). Until then, conceptLabel() falls back to
 * CONCEPTS[key].canonicalName, so the UI still has names. The Particular-Conditions diff
 * flow later writes entries into `parameters`.
 */
export function createFidicProfile(input: ContractProfileSeedInput = {}): StoredContractProfile {
  return emptyProfile(input, input.baseLabel ?? 'FIDIC Red Book 1999', 'fidic');
}

/**
 * A fresh custom profile: the same shape, seeded empty. Extraction fills `parameters` (as
 * overrides against the FIDIC fallback), `clauseMap` (verbatim text + provenance +
 * extractedParameters), `absentConcepts`, and `unmappedClauses`. Every clause entry stays
 * `confirmed: false` until the user proofreads it.
 */
export function createCustomProfile(input: ContractProfileSeedInput = {}): StoredContractProfile {
  return emptyProfile(input, input.baseLabel ?? 'Custom contract', 'custom');
}

/** Stamp meta.updatedAt. Call from every write path. */
export function touchProfile(profile: StoredContractProfile, now?: string): StoredContractProfile {
  return { ...profile, meta: { ...profile.meta, updatedAt: now ?? new Date().toISOString() } };
}
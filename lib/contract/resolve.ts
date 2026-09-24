// resolves parameter layers
// layers, highest wins:
//   manual    profile.parameters.manual[key]    — the user typed it
//   contract  profile.parameters.contract[key]  — extraction read it from the document
//   general   FIDIC_DEFAULTS[key]               — ONLY when meta.profileType === 'fidic'

import type {
  ConceptKey,
  ConceptParameters,
  ConceptParametersOverride,
  ContractProfileSeedInput,
  EngineProfileView,
  ParameterLayer,
  ParameterProvenance,
  ProfileType,
  ResolvedConcept,
  ResolvedContractProfile,
  ResolvedParameters,
  StoredContractProfile,
} from './types';
import { CONCEPT_KEYS } from './types';
import { CONCEPTS } from './concepts';
import { FIDIC_DEFAULTS } from './fidic-defaults';

type CoreField = keyof ParameterProvenance;
const CORE_FIELDS: readonly CoreField[] = ['owner', 'anchor', 'durationDays', 'consequence'];

/**
 * Fallbacks used when a field is unresolved. The engine must never act on these — they exist
 * so the type stays complete and the UI has something inert to render. `resolved: false` and
 * per-field provenance of 'unresolved' are the real signal; consult those, not these values.
 */
const INERT: Pick<ConceptParameters, CoreField> = {
  owner: 'contractor',
  anchor: null,
  durationDays: null,
  consequence: null,
};

/**
 * pick — walk the layers for one field and report which one supplied it.
 *
 * `undefined` defers to the next layer down. `null` does NOT: an explicit null is a deliberate
 * "nominal / not applicable" and stops the walk. That distinction is why this cannot be a
 * chain of `??`.
 */
function pick<F extends CoreField>(
  key: ConceptKey,
  field: F,
  profile: EngineProfileView,
  general: ConceptParameters | null,
): { value: ConceptParameters[F]; layer: ParameterLayer } {
  const manual = profile.parameters.manual[key]?.[field];
  if (manual !== undefined) return { value: manual, layer: 'manual' };

  const contract = profile.parameters.contract[key]?.[field];
  if (contract !== undefined) return { value: contract, layer: 'contract' };

  if (general) return { value: general[field], layer: 'general' };

  return { value: INERT[field] as ConceptParameters[F], layer: 'unresolved' };
}

/** The general layer for a profile: FIDIC's numbers, or nothing at all. */
export function generalLayer(profileType: ProfileType, key: ConceptKey): ConceptParameters | null {
  return profileType === 'fidic' ? FIDIC_DEFAULTS[key] : null;
}

/**
 * resolveParameter — merge the layers for one concept.
 *
 * Takes EngineProfileView, not a full profile: it cannot read clause prose, and neither can
 * anything downstream of it.
 */
export function resolveParameter(profile: EngineProfileView, key: ConceptKey): ResolvedParameters {
  const general = generalLayer(profile.meta.profileType, key);

  // Resolved field by field rather than in a generic loop: a loop over a union of field names
  // needs a cast to keep TypeScript happy about the value type, and a cast here would be
  // exactly where a wrong value could slip through unnoticed.
  const owner = pick(key, 'owner', profile, general);
  const anchor = pick(key, 'anchor', profile, general);
  const durationDays = pick(key, 'durationDays', profile, general);
  const consequence = pick(key, 'consequence', profile, general);

  const provenance: ParameterProvenance = {
    owner: owner.layer,
    anchor: anchor.layer,
    durationDays: durationDays.layer,
    consequence: consequence.layer,
  };

  // A concept is resolved when SOME layer spoke for it. All four unresolved means nothing
  // anywhere describes this concept.
  const resolved = CORE_FIELDS.some((f) => provenance[f] !== 'unresolved');

  const out: ResolvedParameters = {
    owner: owner.value,
    anchor: anchor.value,
    durationDays: durationDays.value,
    consequence: consequence.value,
    resolved,
    provenance,
  };

  // Optional extensions assigned conditionally so no explicit `undefined` is written onto an
  // optional property — required under exactOptionalPropertyTypes.
  const financingRate =
    profile.parameters.manual[key]?.financingRate ??
    profile.parameters.contract[key]?.financingRate ??
    general?.financingRate;
  if (financingRate) out.financingRate = financingRate;

  const challengeWindow =
    profile.parameters.manual[key]?.challengeWindow ??
    profile.parameters.contract[key]?.challengeWindow ??
    general?.challengeWindow;
  if (challengeWindow) out.challengeWindow = challengeWindow;

  return out;
}

/** Convenience for call sites that only want the day count. Null for unresolved OR nominal —
 *  if you need to tell those apart, use resolveParameter and read `resolved`. */
export function resolveDays(profile: EngineProfileView, key: ConceptKey): number | null {
  return resolveParameter(profile, key).durationDays;
}

/** Concepts no layer describes. The Workflows page and the bot both surface these. */
export function unresolvedConcepts(profile: EngineProfileView): ConceptKey[] {
  const absent = new Set<ConceptKey>();
  return CONCEPT_KEYS.filter((k) => !absent.has(k) && !resolveParameter(profile, k).resolved);
}

/**
 * checkDivergence — has a human edited a live parameter away from what extraction read?
 *
 * Compares the RESOLVED value against the extraction snapshot, so a value inherited from the
 * General Conditions still registers as divergent if extraction read something different from
 * the clause. Surfaced as information on the Workflows page, never auto-reconciled: the prose
 * is the record of what was agreed, the parameter is this system's reading of it.
 */
export function checkDivergence(
  profile: Pick<StoredContractProfile, 'parameters' | 'clauseMap' | 'meta'>,
  key: ConceptKey,
): (keyof ConceptParameters)[] {
  const extracted = profile.clauseMap[key]?.extractedParameters;
  if (!extracted) return [];

  const live = resolveParameter(profile, key);
  const diverged: (keyof ConceptParameters)[] = [];

  for (const f of CORE_FIELDS) {
    const e = extracted[f];
    if (e !== undefined && e !== live[f]) diverged.push(f);
  }

  // Objects get a structural compare rather than reference identity.
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

/** Materialise the nested view for the Workflows page and the bot. Never persisted, never
 *  handed to the engine (which takes EngineProfileView). */
export function resolveProfile(profile: StoredContractProfile): ResolvedContractProfile {
  const absent = new Set(profile.absentConcepts);
  const concepts = {} as Record<ConceptKey, ResolvedConcept>;

  for (const key of CONCEPT_KEYS) {
    concepts[key] = {
      key,
      present: !absent.has(key),
      parameters: resolveParameter(profile, key),
      clause: profile.clauseMap[key] ?? null,
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

/** Display label for a concept, honouring any per-contract alias. */
export function conceptLabel(profile: StoredContractProfile, key: ConceptKey): string {
  return profile.clauseMap[key]?.canonicalName ?? CONCEPTS[key].canonicalName;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed helpers
// ─────────────────────────────────────────────────────────────────────────────

function emptyProfile(
  input: ContractProfileSeedInput,
  baseLabel: string,
  profileType: ProfileType,
): StoredContractProfile {
  const now = input.now ?? new Date().toISOString();
  return {
    meta: { profileType, baseLabel, createdAt: now, updatedAt: now },
    parameters: { contract: {}, manual: {} },
    clauseMap: {},
    absentConcepts: [],
    unmappedClauses: [],
    notes: null,
  };
}

/**
 * A FIDIC profile: both stored layers empty, so every concept resolves to the General
 * Conditions. Extraction later writes the `contract` layer with whatever the Particular
 * Conditions and Appendix amend, and clause text from the same upload.
 */
export function createFidicProfile(input: ContractProfileSeedInput = {}): StoredContractProfile {
  return emptyProfile(input, input.baseLabel ?? 'FIDIC Red Book 1999', 'fidic');
}

/**
 * A bespoke profile: identical shape, but with NO general layer behind it. Until extraction
 * writes the `contract` layer, every concept is unresolved and no deadline is computed — which
 * is the correct state for a contract nobody has read yet.
 */
export function createCustomProfile(input: ContractProfileSeedInput = {}): StoredContractProfile {
  return emptyProfile(input, input.baseLabel ?? 'Custom contract', 'custom');
}

/** Stamp meta.updatedAt. Call from every write path. */
export function touchProfile(profile: StoredContractProfile, now?: string): StoredContractProfile {
  return { ...profile, meta: { ...profile.meta, updatedAt: now ?? new Date().toISOString() } };
}

/** Merge a sparse override into one layer. Used by extraction (`contract`) and the Workflows
 *  page (`manual`); never used to write across layers. */
export function withLayerOverride(
  profile: StoredContractProfile,
  layer: 'contract' | 'manual',
  key: ConceptKey,
  patch: ConceptParametersOverride,
): StoredContractProfile {
  return {
    ...profile,
    parameters: {
      ...profile.parameters,
      [layer]: { ...profile.parameters[layer], [key]: { ...profile.parameters[layer][key], ...patch } },
    },
  };
}
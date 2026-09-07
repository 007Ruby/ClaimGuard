"use server";

// app/actions/contract-profile.ts
//
// The write path for the parameters layer. Mirrors the existing server-action convention:
// getSessionContext() -> await createClient() -> mutate -> revalidatePath.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE INVARIANT THIS FILE ENFORCES: editing a parameter NEVER writes back to clause text.
//
// The prose is the record of what was agreed; the parameter is this system's reading of it.
// If a user changes 28 to 21, the clause still says what it says — and the divergence that
// creates is INFORMATION we surface, not an inconsistency to paper over. So the update below
// touches `parameters` and nothing else, and `extractedParameters` (the baseline divergence is
// measured against) is never rewritten from here.
// ─────────────────────────────────────────────────────────────────────────────
import { toParameters, type ExtractedConcept } from "@/lib/contract/extract-profile";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/queries/session";
import { createClient } from "@/lib/supabase/server";
import { asProjectContractData } from "@/lib/contract/contract-data";
import { createCustomProfile, createFidicProfile, touchProfile, withLayerOverride } from "@/lib/contract/resolve";
import { CONCEPTS } from "@/lib/contract/concepts";
import { ANCHORS, CONSEQUENCE_TYPES, OWNERS } from "@/lib/contract/types";
import type {
  Anchor,
  ConceptKey,
  ConceptParametersOverride,
  ConsequenceType,
  Owner,
  StoredContractProfile,
} from "@/lib/contract/types";

const CONTRACT_TABLE = "project_contracts";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Validate an incoming patch. Client input reaches this as unknown shapes off a form, and the
 * parameters layer is what the deadline engine consumes — a bad enum value here becomes a
 * wrong deadline, not a rendering glitch. Anything not recognised is rejected outright rather
 * than coerced.
 */
function validatePatch(key: ConceptKey, raw: ConceptParametersOverride): ConceptParametersOverride | string {
  const out: ConceptParametersOverride = {};

  if (raw.owner !== undefined) {
    if (!OWNERS.includes(raw.owner as Owner)) return `Unknown owner: ${String(raw.owner)}`;
    out.owner = raw.owner;
  }

  if (raw.anchor !== undefined) {
    if (raw.anchor !== null) {
      if (!ANCHORS.includes(raw.anchor as Anchor)) return `Unknown anchor: ${String(raw.anchor)}`;
      // An anchor outside the concept's validAnchors is not a typo, it is a category error —
      // e.g. anchoring payment on contractor awareness. Reject it.
      const valid = CONCEPTS[key].validAnchors;
      if (!valid.includes(raw.anchor)) {
        return `${raw.anchor} is not a valid anchor for ${CONCEPTS[key].canonicalName}.`;
      }
    }
    out.anchor = raw.anchor;
  }

  if (raw.durationDays !== undefined) {
    if (raw.durationDays !== null) {
      if (!Number.isInteger(raw.durationDays) || raw.durationDays < 0) {
        return "Period must be a whole number of days, or blank for no fixed period.";
      }
      if (raw.durationDays > 3650) return "That period looks wrong — over ten years.";
    }
    out.durationDays = raw.durationDays;
  }

  if (raw.consequence !== undefined) {
    if (raw.consequence !== null && !CONSEQUENCE_TYPES.includes(raw.consequence as ConsequenceType)) {
      return `Unknown consequence: ${String(raw.consequence)}`;
    }
    out.consequence = raw.consequence;
  }

  if (raw.challengeWindow !== undefined) out.challengeWindow = raw.challengeWindow;
  if (raw.financingRate !== undefined) out.financingRate = raw.financingRate;

  return out;
}

async function loadProfile(): Promise<
  | { ok: true; profile: StoredContractProfile; projectId: string }
  | { ok: false; error: string }
> {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from(CONTRACT_TABLE)
    .select("data")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) {
    console.error("[contract-profile] load failed:", error);
    return { ok: false, error: "Could not load the contract." };
  }

  const data = asProjectContractData(row?.data);
  if (!data) return { ok: false, error: "No contract uploaded for this project yet." };

  // A project created before the profile existed gets a FIDIC profile on first edit rather
  // than an error — the GC defaults are what the engine was already using anyway.
  const profile = data.contractProfile ?? createFidicProfile();

  return { ok: true, profile, projectId };
}

async function saveProfile(projectId: string, profile: StoredContractProfile): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: row, error: readError } = await supabase
    .from(CONTRACT_TABLE)
    .select("data")
    .eq("project_id", projectId)
    .maybeSingle();

  if (readError) {
    console.error("[contract-profile] re-read failed:", readError);
    return { ok: false, error: "Could not save." };
  }

  const existing = asProjectContractData(row?.data) ?? {};

  // Merge into the existing `data` rather than replacing it — the descriptive metadata
  // (parties, currency, retention) lives at the same level and must survive this write.
  const { error } = await supabase
    .from(CONTRACT_TABLE)
    .update({ data: { ...existing, contractProfile: touchProfile(profile) } })
    .eq("project_id", projectId);

  if (error) {
    console.error("[contract-profile] save failed:", error);
    return { ok: false, error: "Could not save." };
  }
  revalidatePath("/settings/contract");
  return { ok: true };
}

/** Update one concept's parameters. Sparse: only the fields in `patch` are written. */
export async function updateConceptParameters(
  conceptKey: ConceptKey,
  patch: ConceptParametersOverride,
): Promise<ActionResult> {
  const loaded = await loadProfile();
  if (!loaded.ok) return loaded;

  const validated = validatePatch(conceptKey, patch);
  if (typeof validated === "string") return { ok: false, error: validated };

  // Writes go to the MANUAL layer, never to `contract`. The contract layer is the record of
  // what the document says; overwriting it with a user edit would destroy the very comparison
  // the Workflows page exists to show, and there would be no way back to the document's value.
  const next = withLayerOverride(loaded.profile, "manual", conceptKey, validated);

  return saveProfile(loaded.projectId, next);
}

/**
 * Discard a manual edit and fall back to what the contract (or the General Conditions) says.
 * Possible only because the layers are stored separately.
 */
export async function revertConceptToContract(conceptKey: ConceptKey): Promise<ActionResult> {
  const loaded = await loadProfile();
  if (!loaded.ok) return loaded;

  const manual = { ...loaded.profile.parameters.manual };
  delete manual[conceptKey];

  return saveProfile(loaded.projectId, {
    ...loaded.profile,
    parameters: { ...loaded.profile.parameters, manual },
  });
}

/** Mark a concept as present in / absent from this contract. */
export async function setConceptPresence(
  conceptKey: ConceptKey,
  present: boolean,
): Promise<ActionResult> {
  const loaded = await loadProfile();
  if (!loaded.ok) return loaded;

  const absent = new Set(loaded.profile.absentConcepts);
  if (present) absent.delete(conceptKey);
  else absent.add(conceptKey);

  return saveProfile(loaded.projectId, {
    ...loaded.profile,
    absentConcepts: [...absent],
  });
}

/**
 * Mark an extracted clause entry as proofread. This is the ONLY thing that flips `confirmed`,
 * and it is a deliberate human act — nothing in the extraction pipeline may set it.
 */
export async function confirmConcept(conceptKey: ConceptKey): Promise<ActionResult> {
  const loaded = await loadProfile();
  if (!loaded.ok) return loaded;

  const entry = loaded.profile.clauseMap[conceptKey];
  if (!entry) return { ok: false, error: "No clause mapped to this concept to confirm." };

  return saveProfile(loaded.projectId, {
    ...loaded.profile,
    clauseMap: { ...loaded.profile.clauseMap, [conceptKey]: { ...entry, confirmed: true } },
  });
}

/** Free-text edge cases that do not fit a parameter. Read by the bot, never by the engine. */
export async function updateProfileNotes(notes: string): Promise<ActionResult> {
  const loaded = await loadProfile();
  if (!loaded.ok) return loaded;
  return saveProfile(loaded.projectId, {
    ...loaded.profile,
    notes: notes.trim() === "" ? null : notes,
  });
}

/**
 * Commit an uploaded contract: the document's descriptive data, and the profile built from its
 * clauses. One action for first upload and for replacement, because they differ only in whether
 * something is being destroyed.
 *
 * INSERT-or-UPDATE, not UPDATE. A project that has never had a contract has no row in this
 * table, so a bare `.update()` matched zero rows, returned no error, reported success, and left
 * the user pressing Continue on a page that never changed.
 */
export async function commitContract(input: {
  profileType: "fidic" | "custom";
  baseLabel?: string;
  /** The descriptive extraction — parties, amount, dates. */
  extracted: Record<string, unknown>;
  /** The clause extraction. Empty is legitimate: nothing is invented to fill it. */
  concepts: ExtractedConcept[];
  replace: boolean;
}): Promise<ActionResult> {
  const { orgId, projectId } = await getSessionContext();
  const supabase = await createClient();

  const { data: row, error: readError } = await supabase
    .from(CONTRACT_TABLE)
    .select("id, data")
    .eq("project_id", projectId)
    .maybeSingle();

  if (readError) {
    console.error("[contract-profile] commit read failed:", readError);
    return { ok: false, error: "Could not read the contract record." };
  }

  const existing = asProjectContractData(row?.data) ?? {};

  if (existing.contractProfile && !input.replace) {
    return { ok: false, error: "This project already has a contract set up." };
  }

  // `dayOverrides` is dropped on the floor. Periods live on the profile now; a second map of
  // loose numbers on `data` is exactly the kind of parallel source that goes stale and then
  // quietly disagrees with the engine.
  const { dayOverrides: _discarded, ...descriptive } = input.extracted as Record<string, unknown> & {
    dayOverrides?: unknown;
  };

  const base =
    input.profileType === "fidic"
      ? createFidicProfile(input.baseLabel ? { baseLabel: input.baseLabel } : {})
      : createCustomProfile(input.baseLabel ? { baseLabel: input.baseLabel } : {});

  const profile = applyExtraction(base, input.concepts);

  const data = { ...descriptive, contractProfile: profile };
  const framework =
    (descriptive.framework as string) ||
    (input.profileType === "fidic" ? "FIDIC Red Book 1999" : "Bespoke contract");

  const record = {
    name: (descriptive.name as string) || "Project contract",
    framework,
    commencement_date: (descriptive.commencementDate as string) || null,
    data,
  };

  const { error } = row
    ? await supabase.from(CONTRACT_TABLE).update(record).eq("id", row.id)
    : await supabase.from(CONTRACT_TABLE).insert({ org_id: orgId, project_id: projectId, ...record });

  if (error) {
    console.error("[contract-profile] commit failed:", error);
    return { ok: false, error: "Could not save the contract." };
  }

  if (input.replace) {
    // Retrieval chunks belong to the document that is gone. Left in place, the assistant would
    // answer questions by quoting a contract that no longer governs this project — confidently,
    // and with nothing to tell the user it had done so. Non-fatal, but loud.
    const { error: chunkError } = await supabase
      .from("contract_chunks")
      .delete()
      .eq("project_id", projectId);
    if (chunkError) console.error("[contract-profile] stale chunk delete failed:", chunkError);
  }

  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath("/settings/contract");
  return { ok: true };
}

/**
 * Fold an extraction into a fresh profile: parameters into the CONTRACT layer, wording into the
 * clause map.
 *
 * No separate baseline copy is stored. The contract layer IS the record of what the document
 * said — `manual` sits on top of it and divergence is the difference between the two, computed
 * when needed. A third stored copy would be a second source of truth with nothing keeping it
 * honest.
 *
 * `confirmed` is false on every entry without exception. Only a human act sets it — that is the
 * entire point of the flag, and an extraction marking its own output as proofread would empty
 * the "needs checking" count on exactly the contracts that most need one.
 *
 * A concept the extraction did not find is written NOWHERE: not defaulted, not stubbed, not
 * marked absent. On a FIDIC profile the general layer then governs it and the page says so; on a
 * bespoke profile it resolves to unresolved and the page asks.
 */
function applyExtraction(
  profile: StoredContractProfile,
  concepts: ExtractedConcept[],
): StoredContractProfile {
  const contract = { ...profile.parameters.contract };
  const clauseMap = { ...profile.clauseMap };

  for (const c of concepts) {
    contract[c.key] = toParameters(c);
    clauseMap[c.key] = {
      canonicalName: CONCEPTS[c.key].canonicalName,
      sourceClauseRef: c.sourceClauseRef,
      contractLabel: c.contractLabel,
      text: c.text,
      // Extraction reads a flat text sidecar with no page structure, so there is no page number
      // to record. The clause reference is what the user searches their own PDF by anyway.
      page: null,
      // The General Conditions text this clause replaced. Null by design: ClaimGuard ships FIDIC
      // defaults, not FIDIC prose, so there is no GC wording to show alongside an amendment.
      general: null,
      confirmed: false,
    };
  }

  return {
    ...profile,
    parameters: { ...profile.parameters, contract },
    clauseMap,
  };
}

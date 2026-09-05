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

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/queries/session";
import { createClient } from "@/lib/supabase/server";
import { asProjectContractData } from "@/lib/contract/contract-data";
import { createFidicProfile, touchProfile } from "@/lib/contract/resolve";
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

  revalidatePath("/settings/workflows");
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

  const next: StoredContractProfile = {
    ...loaded.profile,
    parameters: {
      ...loaded.profile.parameters,
      [conceptKey]: { ...loaded.profile.parameters[conceptKey], ...validated },
    },
  };

  return saveProfile(loaded.projectId, next);
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
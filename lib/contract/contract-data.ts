// lib/contract/contract-data.ts
//
// The shape of `project_contracts.data` (JSONB) after adopting ContractProfile.
//
// Design decision (source of truth): the ContractProfile is the SINGLE source of truth for the
// deterministic layer. `dayOverrides` is RETIRED as stored state — it is derived from
// contractProfile.parameters at read time by profile-adapter.projectDayOverrides(). This keeps
// one representation of every period (no stored duplicate to drift), consistent with the
// parameter-is-the-reading principle: we never store the same number twice.
//
// The descriptive metadata already on `data` (parties, currency, retention %, arbitration, etc.)
// is PRESERVED in place and untouched, so existing consumers (bot context, headers) keep working.
// Only `dayOverrides` moves — into contractProfile.parameters — and the engine gets it back via
// read-time projection in the query layer (get-obligations contextFor).

import type { StoredContractProfile } from './types';

/** Descriptive, non-deterministic contract metadata. Unchanged from today's `data`; kept as-is
 *  so anything reading data.parties / data.currency / etc. is unaffected.
 *
 *  Tradeoff on the index signature below: it keeps this permissive so new descriptive fields
 *  don't need a type change, but it also means a typo (`data.retentionPCT`) resolves to
 *  `unknown` instead of erroring. Accepted for the descriptive layer only — the deterministic
 *  layer under `contractProfile` is closed and exhaustively typed, which is where it matters. */
export interface ContractMeta {
  name?: string;
  parties?: { employer?: string; engineer?: string; contractor?: string };
  currency?: string;
  framework?: string;
  file_path?: string;
  arbitration?: { seat?: string; rules?: string; language?: string };
  governingLaw?: string;
  rulingLanguage?: string;
  /** @deprecated Read the `commencement_date` COLUMN, not this. Two homes for one date is
   *  exactly the drift this refactor exists to remove. Retained only so pre-migration rows
   *  type-check; new writes should not set it. */
  commencementDate?: string;
  documentPriority?: string[];
  retentionPct?: number;
  retentionLimitPct?: number;
  advancePaymentPct?: number;
  performanceSecurityPct?: number;
  delayDamagesPerDay?: string;
  maxDelayDamagesPct?: number;
  timeForCompletionDays?: number;
  timeForAccessToSiteDays?: number;
  defectsNotificationPeriodDays?: number;
  minimumInterimPaymentCertificate?: number;
  acceptedContractAmount?: number;
  languageForCommunications?: string;
  dab?: { composition?: string; appointBy?: string; appointingEntity?: string };
  // (Descriptive fields are open-ended; keep permissive to avoid churn.)
  [k: string]: unknown;
}

/**
 * project_contracts.data after migration. The descriptive fields sit at the top level exactly as
 * before (so nothing that reads them breaks); the deterministic + clause-text artifact is nested
 * under `contractProfile`. `dayOverrides` is intentionally absent — derived, not stored.
 */
export type ProjectContractData = ContractMeta & {
  /** The deterministic + clause-text source of truth. Stored SPARSE (only diffs from the FIDIC
   *  defaults); resolve.ts fills the rest at read time. */
  contractProfile?: StoredContractProfile;

  /**
   * @deprecated Retired. Present only so legacy pre-migration rows type-check during transition;
   * get-obligations falls back to it when contractProfile is absent. New rows never write it.
   */
  dayOverrides?: Record<string, number>;
};

/**
 * The row shape the query layer actually selects. Declared here rather than inline in
 * get-obligations so there is one place the `data` column's type lives.
 *
 * `commencement_date` is the COLUMN and is authoritative over ContractMeta.commencementDate.
 */
export interface ProjectContractRow {
  commencement_date: string | null;
  data: ProjectContractData | null;
}

/**
 * asProjectContractData — the boundary cast.
 *
 * Supabase types a JSONB column as `Json`, so what comes back is structurally `unknown`;
 * `ProjectContractData` above is a claim about that value, not a guarantee. This is the single
 * sanctioned place that claim is made, so the cast is auditable instead of scattered as `as any`
 * across call sites. It checks only that the value is a plain object — anything deeper is the
 * job of the specific guard for that sub-object (e.g. isStoredContractProfile in
 * profile-adapter.ts, which the engine path uses before projecting overrides).
 */
export function asProjectContractData(value: unknown): ProjectContractData | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as ProjectContractData;
}
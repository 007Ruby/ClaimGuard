import Link from "next/link";
import { getSessionContext } from "@/lib/queries/session";
import { createClient } from "@/lib/supabase/server";
import { asProjectContractData } from "@/lib/contract/contract-data";
import { createFidicProfile } from "@/lib/contract/resolve";
import { countNeedsAttention } from "@/lib/contract/workflows";
import { ContractUpload } from "@/components/contract/contract-upload";
import { ContractDetails } from "@/components/contract/contract-details";

const CONTRACT_TABLE = "project_contracts";

export default async function ContractSettingsPage() {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();
  const { data: contract } = await supabase
    .from(CONTRACT_TABLE)
    .select("data")
    .eq("project_id", projectId)
    .maybeSingle();

  // Narrowed once, here, rather than cast to `any` — see contract-data.ts.
  const data = asProjectContractData(contract?.data);
  const profile = data ? data.contractProfile ?? createFidicProfile() : null;
  const needsAttention = profile ? countNeedsAttention(profile) : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Contract</h1>
        <p className="text-sm text-muted-foreground">
          The contract behind every deadline and claim. Nothing is hardcoded — it all comes from
          the document you upload here.
        </p>
      </div>

      {data ? (
        <>
          <ContractDetails initial={data} />

          {/* ContractPeriods used to live here. Periods are no longer stored on `data` as
              dayOverrides — they are parameters on the contract profile, and they are edited
              alongside the workflow they belong to rather than as a list of loose numbers,
              because a period only means anything next to the event it runs from. */}
          <Link
            href="/settings/workflows"
            className="block rounded-md border p-4 transition-colors hover:bg-accent"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">Workflows and deadlines</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {profile?.meta.baseLabel ?? "Contract"} — every period this project counts,
                  and what happens when one runs out.
                </p>
              </div>
              {needsAttention > 0 && (
                <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs">
                  {needsAttention} to check
                </span>
              )}
            </div>
          </Link>
        </>
      ) : (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No contract uploaded yet. Upload your FIDIC PDF below to switch on deadlines and
          claims.
        </p>
      )}

      <ContractUpload initial={data} hasExisting={!!data} />
    </div>
  );
}
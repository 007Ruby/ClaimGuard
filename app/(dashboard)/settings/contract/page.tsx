import { getSessionContext } from "@/lib/queries/session";
import { createClient } from "@/lib/supabase/server";
import { ContractSummary } from "@/components/contract/contract-summary";
import { ContractUpload } from "@/components/contract/contract-upload";
import { ContractPeriods } from "@/components/contract/contract-periods";
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
  const data = (contract?.data as Record<string, any>) ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Contract</h1>
        <p className="text-sm text-muted-foreground">
          The contract behind every deadline and claim. Nothing is hardcoded —
          it all comes from the document you upload here.
        </p>
      </div>

      {data ? (
        <>
          <ContractDetails initial={data} />
          <ContractPeriods initial={data} />
        </>
      ) : (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No contract uploaded yet. Upload your FIDIC PDF below to switch on deadlines and claims.
        </p>
      )}

      <ContractUpload initial={data} hasExisting={!!data} />
    </div>
  );
}
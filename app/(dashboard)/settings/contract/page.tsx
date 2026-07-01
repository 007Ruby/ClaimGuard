import { getSessionContext } from "@/lib/queries/session";
import { createClient } from "@/lib/supabase/server";
import { ContractUpload } from "@/components/contract/contract-upload";

// If you ran migration 0005, change "contracts" to "project_contracts".
const CONTRACT_TABLE = "project_contracts";

export default async function ContractSettingsPage() {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();
  const { data: contract } = await supabase
    .from(CONTRACT_TABLE)
    .select("data")
    .eq("project_id", projectId)
    .maybeSingle();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Contract</h1>
        <p className="text-sm text-muted-foreground">
          Upload your FIDIC contract; the AI extracts the key terms for you to review.
          These values drive every deadline and claim — nothing is hardcoded.
        </p>
      </div>
      <ContractUpload initial={(contract?.data as any) ?? null} />
    </div>
  );
}
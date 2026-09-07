import { getSessionContext } from "@/lib/queries/session";
import { createClient } from "@/lib/supabase/server";
import { asProjectContractData } from "@/lib/contract/contract-data";
import { buildWorkflowGroups, countNeedsAttention } from "@/lib/contract/workflows";
import { ContractDetails } from "@/components/contract/contract-details";
import { WorkflowSection } from "@/components/contract/workflow-section";
import { ProfileNotes } from "@/components/contract/profile-notes";
import { ContractSetup } from "@/components/contract/contract-setup";

const CONTRACT_TABLE = "project_contracts";

export default async function ContractSettingsPage() {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();
  const { data: contract } = await supabase
    .from(CONTRACT_TABLE)
    .select("data")
    .eq("project_id", projectId)
    .maybeSingle();

  const data = asProjectContractData(contract?.data);
  const profile = data?.contractProfile ?? null;

  // The fork comes BEFORE anything else. Which mode the project is in changes how the document
  // is read, so asking afterwards would mean re-reading it.
  if (!profile) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <Header />
          <ContractSetup mode="initial" />
      </div>
    );
  }

  // No createFidicProfile() fallback here. A page that invents a profile to render would show
  // FIDIC periods for a project that never adopted them — the exact silent fallback the layer
  // split exists to prevent. No profile means the fork above, not a guess.
  const groups = buildWorkflowGroups(profile);
  const needsAttention = countNeedsAttention(profile);
  const baseLabel = profile.meta.baseLabel;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <Header needsAttention={needsAttention} />

      {data && <ContractDetails initial={data} />}

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Workflows</h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            Every period this project counts, read from your contract. Change one here and every
            date on the dashboard moves with it.
            {baseLabel ? ` Based on ${baseLabel}.` : ""}
          </p>
        </div>

        {groups.map((group) => (
          <WorkflowSection key={group.id} group={group} baseLabel={baseLabel} />
        ))}
      </section>

      <ProfileNotes initial={profile.notes} />

       <ContractSetup mode="replace" />
    </div>
  );
}

function Header({ needsAttention = 0 }: { needsAttention?: number }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">Contract</h1>
        <p className="text-sm text-muted-foreground">Behind every deadline and claim</p>
      </div>
      {needsAttention > 0 && (
        <span className="mt-1 shrink-0 rounded-full border px-2.5 py-1 text-xs">
          {needsAttention} {needsAttention === 1 ? "step needs" : "steps need"} checking
        </span>
      )}
    </div>
  );
}
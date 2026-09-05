import { getSessionContext } from "@/lib/queries/session";
import { createClient } from "@/lib/supabase/server";
import { asProjectContractData } from "@/lib/contract/contract-data";
import { createFidicProfile } from "@/lib/contract/resolve";
import { buildWorkflowGroups, countNeedsAttention } from "@/lib/contract/workflows";
import { WorkflowChain } from "@/components/contract/workflow-chain";
import { ProfileNotes } from "@/components/contract/profile-notes";

const CONTRACT_TABLE = "project_contracts";

export default async function WorkflowsSettingsPage() {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();

  const { data: row } = await supabase
    .from(CONTRACT_TABLE)
    .select("data")
    .eq("project_id", projectId)
    .maybeSingle();

  const data = asProjectContractData(row?.data);

  if (!data) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <Header />
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Upload your contract first and these workflows will fill in from it.
        </p>
      </div>
    );
  }

  // A project predating the profile falls back to FIDIC General Conditions, which is what its
  // deadlines were already being computed from — so the page shows the truth, not an error.
  const profile = data.contractProfile ?? createFidicProfile();
  const groups = buildWorkflowGroups(profile);
  const needsAttention = countNeedsAttention(profile);

  return (
    <div className="mx-auto max-w-4xl space-y-10 p-6">
      <Header baseLabel={profile.meta.baseLabel} needsAttention={needsAttention} />

      {groups.map((group) => (
        <WorkflowChain key={group.id} group={group} />
      ))}

      <ProfileNotes initial={profile.notes} />
    </div>
  );
}

function Header({
  baseLabel,
  needsAttention = 0,
}: {
  baseLabel?: string;
  needsAttention?: number;
}) {
  return (
    <div className="space-y-2">
      <h1 className="text-2xl font-semibold">Workflows</h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        Every deadline this project tracks, and the periods behind them. These are read from
        your contract — change one here and every date on the dashboard moves with it.
        {baseLabel ? ` Based on ${baseLabel}.` : ""}
      </p>
      {needsAttention > 0 && (
        <p className="text-sm">
          {needsAttention} {needsAttention === 1 ? "step needs" : "steps need"} checking against
          your contract.
        </p>
      )}
    </div>
  );
}
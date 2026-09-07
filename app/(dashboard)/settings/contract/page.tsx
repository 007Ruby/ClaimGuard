import Link from "next/link";
import { getSessionContext } from "@/lib/queries/session";
import { createClient } from "@/lib/supabase/server";
import { asProjectContractData } from "@/lib/contract/contract-data";
import { countNeedsAttention } from "@/lib/contract/workflows";
import { ContractUpload } from "@/components/contract/contract-upload";
import { ContractDetails } from "@/components/contract/contract-details";
import { ContractTypeFork } from "@/components/contract/contract-type-fork";

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
  const profile = data?.contractProfile ?? null;
  const needsAttention = profile ? countNeedsAttention(profile) : 0;

  // The fork comes BEFORE the upload, not after it. Which mode the project is in changes how
  // the document is read, so asking afterwards would mean re-reading it.
  //I want it to be a lot simpler:
  //Another container here should allow for the upload of a new contract. It should not take a lot of vertical space
  //The drop down should allow you to apload a Non-FIDIC contract, or a FIDIC contract
  //When a choice is amde, an upload button pops up, with a message explaining what the upload should include
  //This message will change depending on if a FIDIC or non-FIDIC was chosen (placed where *******message is bellow). 
  //--------------------------------------------------------------------------------------------------
  //Upload New Contract                                        |Drop Down|
  //******message 
  //--------------------------------------------------------------------------------------------------
  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold">Contract</h1>
          <p className="text-sm text-muted-foreground">
            Behind every deadline & claim
          </p>
        </div>
        <ContractTypeFork />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Contract</h1>
        <p className="text-sm text-muted-foreground">
          Behind every deadline & claim
        </p>
      </div>

      {data ? (
        <>

          <ContractDetails initial={data} />
          //I want thsi container to include the edit button INSIDE the contract details - top right corner
          {/* ContractPeriods used to live here. Periods are no longer stored on `data` as
              dayOverrides — they are parameters on the contract profile, and they are edited
              alongside the workflow they belong to rather than as a list of loose numbers,
              because a period only means anything next to the event it runs from. */}
          <Link
          //Replace this part with the workflows genuinly being here
          //Looking like this:
          //Workflows -- the deadlines that drive your project 
          //
          //Claims (below would be a container which can be expanded)
          //--------------------------------------------------------------------------------------------------
          //Delay --28--> Notice --42--> Claim --42--> Response --NA--> Determination 
          //--------------------------------------------------------------------------------------------------
          //When expanded, the above container would contain dot points: one dot point per event (e.g delay)
          //Those dot points would includ - next to them - a text box where you can change that value (eg |28| days)
          //Perhaps, edits can only be made after pressing the edit button (give me advice here), what looks better
          //if yes, then the edit button can be seen after the expansion on the bottom right corner. 
          //
          //Payment (below would be a container which can be expanded)
          //--------------------------------------------------------------------------------------------------
          //Statement --28--> IPC --42--> Claim --42--> Response --NA--> Determination 
          //--------------------------------------------------------------------------------------------------
          //When expanded, the above container would contain dot points: one dot point per event (e.g delay)
          //Those dot points would include - next to them - a text box where you can change that value (eg |28| days)
          //Perhaps, edits can only be made after pressing the edit button (give me advice here), what looks better
          //if yes, then the edit button can be seen after the expansion on the bottom right corner. 
          //
          //Another container here should allow for the upload of a new contract. It should not take a lot of vertical space
          //The drop down should allow you to apload a Non-FIDIC contract, or a FIDIC contract
          //When a choice is amde, an upload button pops up, with a message explaining what the upload should include
          //This message will change depending on if a FIDIC or non-FIDIC was chosen (placed where *******message is bellow). 
          //--------------------------------------------------------------------------------------------------
          //Upload New Contract                                        |Drop Down|
          //******message 
          //--------------------------------------------------------------------------------------------------
          
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
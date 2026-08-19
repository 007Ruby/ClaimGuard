import { getSessionContext } from "@/lib/queries/session";
import { createClient } from "@/lib/supabase/server";
import { SpecificationUpload } from "@/components/specification/specification-upload";
import { DocumentPriority } from "@/components/specification/document-priority";

const CONTRACT_TABLE = "project_contracts";
const BUCKET = "specifications";
type DocId = "contract" | "specification";

export default async function SpecificationSettingsPage() {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();

  const { data: contract } = await supabase
    .from(CONTRACT_TABLE).select("data").eq("project_id", projectId).maybeSingle();
  const data = (contract?.data as Record<string, any>) ?? null;
  const order = (data?.documentPriority as DocId[] | undefined) ?? ["contract", "specification"];

  const { data: files } = await supabase.storage.from(BUCKET).list(projectId);
  const specObj = files?.find((f) => f.name === "specification.pdf") ?? null;
  const sizeBytes =
    typeof specObj?.metadata?.size === "number" ? specObj.metadata.size : null;
  const existing = specObj ? { sizeBytes } : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Specification</h1>
        <p className="text-sm text-muted-foreground">
          The technical requirements the works must meet. Stored as a reference the system can
          flag against and answer questions from — no figures are extracted.
        </p>
      </div>

      <SpecificationUpload existing={existing} />

      {data ? (
        <DocumentPriority initialOrder={order} />
      ) : (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Upload a contract to set which document governs when the two disagree.
        </p>
      )}
    </div>
  );
}
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { listRfis } from "@/lib/actions/rfi";
import { listInboxItems } from "@/lib/queries/inbox";
import { RfiBuilder, type EventOption } from "@/components/rfi/rfi-builder";
import { RfiSavedList } from "@/components/rfi/rfi-saved-list";

export const dynamic = "force-dynamic";

export default async function RfiPage({
  searchParams,
}: {
  searchParams: Promise<{ evidence?: string; open?: string; ts?: string }>;
}) {
  const sp = await searchParams;
  const { projectId } = await getSessionContext();
  const supabase = await createClient();

  const [rfis, inboxItems, { data: events }] = await Promise.all([
    listRfis(),
    listInboxItems(),
    supabase
      .from("events")
      .select("id, title, type, occurred_on")
      .eq("project_id", projectId)
      .order("occurred_on", { ascending: false, nullsFirst: false }),
  ]);

  const eventOptions: EventOption[] = (events ?? []).map((e: any) => ({
    id: e.id, title: e.title ?? null, type: e.type ?? null, occurred_on: e.occurred_on ?? null,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Requests for Further Information</h1>
        <p className="text-sm text-muted-foreground">
          Raise and track RFIs to the Engineer. Unanswered requests for information
          needed to proceed may found a claim under Sub-Clause 1.9.
        </p>
      </div>

      <RfiBuilder
        key={sp.evidence ?? "new"}
        inboxItems={inboxItems}
        events={eventOptions}
        initialEvidenceId={sp.evidence ?? null}
      />

      <RfiSavedList rfis={rfis} openId={sp.open} ts={sp.ts} />
    </div>
  );
}
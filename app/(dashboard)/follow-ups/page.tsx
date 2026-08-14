import { listAwaitingEvents, listSavedFollowUps } from "@/lib/queries/follow-ups";
import { FollowUpBuilder } from "@/components/follow-ups/followup-builder";
import { FollowUpsList } from "@/components/follow-ups/followups-list";

export default async function FollowUpsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; analyze?: string; open?: string; ts?: string }>;
}) {
  const sp = await searchParams;
  const [events, followUps] = await Promise.all([
    listAwaitingEvents(),
    listSavedFollowUps(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Follow-ups</h1>
        <p className="text-sm text-muted-foreground">
          Chase the Engineer or Employer for actions they owe you. Draft the email
          from the event and its evidence — you can send even before it&apos;s overdue.
        </p>
      </div>
      <FollowUpBuilder
        key={sp.event ?? "new"}
        events={events}
        initialEventId={sp.event ?? null}
        autoAnalyze={sp.analyze === "1"}
      />
      <FollowUpsList followUps={followUps} openId={sp.open} ts={sp.ts} />
    </div>
  );
}
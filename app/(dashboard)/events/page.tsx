import { listEventsWithEvidence } from "@/lib/queries/events";
import { EventForm } from "@/components/events/event-form";
import { EventsList } from "@/components/events/events-list";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string; new?: string; ts?: string; title?: string; type?: string; occurred_on?: string; description?: string }>;
}) {
  const sp = await searchParams;
  const events = await listEventsWithEvidence();
  const initial = sp.new
    ? { title: sp.title, type: sp.type, occurred_on: sp.occurred_on, description: sp.description }
    : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Events</h1>
      {/* key forces a fresh mount per AI navigation, so the prefill always lands */}
      <EventForm key={sp.new ? `ai-${sp.ts ?? ""}` : "manual"} initial={initial} />
      <EventsList events={events as any} openId={sp.open} />
    </div>
  );
}
import Link from "next/link";
import { listEvents } from "@/lib/queries/events";
import { NewEventDialog } from "@/components/events/new-event-dialog";
import { StatusBadge } from "@/components/events/status-badge";
import { EVENT_TYPE_LABELS } from "@/lib/constants";

export default async function EventsPage() {
  const events = await listEvents();

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Events</h1>
        <NewEventDialog />
      </div>

      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          No events yet. Create your first one to get started.
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {events.map((e) => (
            <Link key={e.id} href={`/events/${e.id}`}
              className="flex items-center justify-between p-4 hover:bg-muted/40">
              <div>
                <p className="font-medium">{e.title}</p>
                <p className="text-sm text-muted-foreground">
                  {EVENT_TYPE_LABELS[e.type] ?? e.type}
                  {e.occurred_on ? ` · ${e.occurred_on}` : ""}
                </p>
              </div>
              <StatusBadge status={e.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
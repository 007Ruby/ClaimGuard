import { listEventsWithEvidence } from "@/lib/queries/events";
import { EventForm } from "@/components/events/event-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const LABEL: Record<string, string> = {
  variation: "Variation", delay: "Delay", payment: "Payment",
  instruction: "Instruction", site_issue: "Site issue", other: "Other",
};

export default async function EventsPage() {
  const events = await listEventsWithEvidence();
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Events</h1>
      <EventForm />
      <div className="space-y-4">
        {events.length === 0 && <p className="text-sm text-muted-foreground">No events yet.</p>}
        {events.map((e: any) => (
          <Card key={e.id}>
            <CardHeader>
              <CardTitle className="text-base">{e.title}</CardTitle>
              <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <span>{e.occurred_on ?? "No date"}</span>
                <Badge variant="secondary">{LABEL[e.type] ?? e.type}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {e.description && <p className="text-sm">{e.description}</p>}
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {e.evidence?.length ?? 0} linked inbox item(s)
                </p>
                <ul className="mt-1 space-y-1">
                  {(e.evidence ?? []).slice(0, 5).map((ev: any) => (
                    <li key={ev.id} className="text-sm">
                      • {ev.title || "(untitled)"}{" "}
                      <span className="text-muted-foreground">({ev.source_type})</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
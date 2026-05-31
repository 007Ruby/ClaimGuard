import { notFound } from "next/navigation";
import { getEvent } from "@/lib/queries/events";
import { StatusBadge } from "@/components/events/status-badge";
import { EVENT_TYPE_LABELS } from "@/lib/constants";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getEvent(id);
  if (!event) notFound();

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{event.title}</h1>
          <StatusBadge status={event.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {EVENT_TYPE_LABELS[event.type] ?? event.type}
          {event.occurred_on ? ` · occurred ${event.occurred_on}` : ""}
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="evidence">Evidence</TabsTrigger>
          <TabsTrigger value="deadlines">Deadlines</TabsTrigger>
          <TabsTrigger value="ai">AI suggestions</TabsTrigger>
          <TabsTrigger value="claim">Claim draft</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="rounded-lg border p-6">
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">Description</h3>
            <p className="whitespace-pre-wrap">
              {event.description || "No description provided."}
            </p>
          </div>
        </TabsContent>

        <TabsContent value="evidence" className="mt-4">
          <Placeholder label="Linked evidence will appear here once the Evidence and Inbox systems are built." />
        </TabsContent>
        <TabsContent value="deadlines" className="mt-4">
          <Placeholder label="Notice and submission deadlines for this event will appear here." />
        </TabsContent>
        <TabsContent value="ai" className="mt-4">
          <Placeholder label="AI suggestions for this event will appear here." />
        </TabsContent>
        <TabsContent value="claim" className="mt-4">
          <Placeholder label="The AI-generated claim draft will appear here." />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Placeholder({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
      {label}
    </div>
  );
}
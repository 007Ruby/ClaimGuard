import { listInboxItems } from "@/lib/queries/inbox";
import { listEventsForSelect } from "@/lib/queries/events";
import { InboxForm } from "@/components/inbox/inbox-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SOURCE_LABEL: Record<string, string> = { pasted_email: "Pasted email", note: "Note", file: "File" };

export default async function InboxPage() {
  const [items, events] = await Promise.all([listInboxItems(), listEventsForSelect()]);
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Inbox</h1>
      <InboxForm events={events} />
      <div className="space-y-4">
        {items.length === 0 && <p className="text-sm text-muted-foreground">No inbox items yet.</p>}
        {items.map((it: any) => (
          <Card key={it.id}>
            <CardHeader className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">{it.title || "(untitled)"}</CardTitle>
                <Badge variant={it.event ? "default" : "secondary"}>{it.event ? "Linked" : "Unlinked"}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {SOURCE_LABEL[it.source_type] ?? it.source_type}
                {it.event_date ? ` · event ${it.event_date}` : ""}
                {` · added ${new Date(it.created_at).toLocaleDateString()}`}
                {it.event ? ` · → ${it.event.title}` : ""}
              </p>
            </CardHeader>
            <CardContent>
              {it.content && <p className="line-clamp-3 text-sm">{it.content}</p>}
              {it.file_path && (
                <p className="text-sm text-muted-foreground">Attachment: {it.file_path.split("/").pop()}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
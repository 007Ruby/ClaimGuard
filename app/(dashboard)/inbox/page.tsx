import { listInboxItems } from "@/lib/queries/inbox";
import { listEventsForSelect } from "@/lib/queries/events";
import { InboxForm } from "@/components/inbox/inbox-form";
import { InboxList } from "@/components/inbox/inbox-list";

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const { open } = await searchParams;
  const [items, events] = await Promise.all([listInboxItems(), listEventsForSelect()]);
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Inbox</h1>
      <InboxForm events={events} />
      <InboxList items={items as any} events={events} openId={open} />
    </div>
  );
}
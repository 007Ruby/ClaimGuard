import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";
import { listInboxCards } from "@/lib/queries/inbox";
import { InboxForm } from "@/components/inbox/inbox-form";
import { InboxList } from "@/components/inbox/inbox-list";

export const dynamic = "force-dynamic";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ open?: string }>;
}) {
  const { open } = await searchParams;
  const { projectId } = await getSessionContext();
  const supabase = await createClient();

  // Full evidence rows for the cards + a clean {id,title} list for the pickers.
  const [items, { data: events }] = await Promise.all([
    listInboxCards(),
    supabase
      .from("events")
      .select("id, title")
      .eq("project_id", projectId)
      .order("occurred_on", { ascending: false, nullsFirst: false }),
  ]);

  const eventOptions = (events ?? []).map((e: any) => ({
    id: e.id,
    title: e.title ?? "(untitled)",
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Inbox</h1>
      <InboxForm events={eventOptions} />
      <InboxList items={items} events={eventOptions} openId={open} />
    </div>
  );
}
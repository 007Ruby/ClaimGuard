// lib/queries/inbox.ts
// TWO shapes, deliberately:
//   listInboxItems()  — MINIMAL, camelCase. Feeds the RFI builder's picker +
//                        pre-fill (title → subject, ai_notes → background, …).
//   listInboxCards()  — FULL evidence row. Feeds the Inbox page's <InboxList>,
//                        which renders content/source/date/file/event + flags.
// The inbox page must use listInboxCards(); listInboxItems() there is what left
// every saved card blank.
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

/* ---------------------------------------------------------------- picker --- */

export type InboxItemOption = {
  id: string;
  title: string | null;
  eventId: string | null;
  eventTitle: string | null;
  alignment: string | null;   // aligned | contentious | against_contract | null
  clarity: string | null;     // clear | unclear | null
  aiNotes: string | null;
  suggestedQuery: string | null; // newline-separated
  createdAt: string;
};

const PICKER_SELECT =
  "id, title, event_id, alignment, clarity, ai_notes, suggested_query, created_at, event:events(title)";

function mapOption(r: any): InboxItemOption {
  return {
    id: r.id,
    title: r.title ?? null,
    eventId: r.event_id ?? null,
    eventTitle: r.event?.title ?? null,
    alignment: r.alignment ?? null,
    clarity: r.clarity ?? null,
    aiNotes: r.ai_notes ?? null,
    suggestedQuery: r.suggested_query ?? null,
    createdAt: r.created_at,
  };
}

export async function listInboxItems(): Promise<InboxItemOption[]> {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("evidence")
    .select(PICKER_SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    return [];
  }
  return (data ?? []).map(mapOption);
}

export async function getInboxItem(id: string): Promise<InboxItemOption | null> {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("evidence")
    .select(PICKER_SELECT)
    .eq("id", id)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) {
    console.error(error);
    return null;
  }
  return data ? mapOption(data) : null;
}

/* ------------------------------------------------------------ full cards --- */

// Matches the InboxItem type consumed by components/inbox/inbox-list.tsx.
export type InboxCard = {
  id: string;
  title: string | null;
  content: string | null;
  source_type: string;
  event_date: string | null;
  file_path: string | null;
  created_at: string;
  ai_notes: string | null;
  alignment: string | null;
  clarity: string | null;
  suggested_query: string | null;
  event: { id: string; title: string } | null;
};

const CARD_SELECT =
  "id, title, content, source_type, event_date, file_path, created_at, ai_notes, alignment, clarity, suggested_query, event:events(id, title)";

export async function listInboxCards(): Promise<InboxCard[]> {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("evidence")
    .select(CARD_SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    id: r.id,
    title: r.title ?? null,
    content: r.content ?? null,
    source_type: r.source_type ?? "note",
    event_date: r.event_date ?? null,
    file_path: r.file_path ?? null,
    created_at: r.created_at,
    ai_notes: r.ai_notes ?? null,
    alignment: r.alignment ?? null,
    clarity: r.clarity ?? null,
    suggested_query: r.suggested_query ?? null,
    event: r.event ? { id: r.event.id, title: r.event.title } : null,
  }));
}
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

type Row = { date: string; kind: "event" | "inbox"; label: string; linked: boolean; href: string };

export async function getCalendar() {
  const { projectId } = await getSessionContext();
  const supabase = await createClient();

  const [{ data: events }, { data: items }] = await Promise.all([
    supabase.from("events").select("id, title, occurred_on").eq("project_id", projectId).not("occurred_on", "is", null),
    supabase.from("evidence").select("id, title, event_date, event_id").eq("project_id", projectId).not("event_date", "is", null),
  ]);

  const rows: Row[] = [];
  (events ?? []).forEach((e: any) =>
    rows.push({ date: e.occurred_on, kind: "event", label: e.title, linked: true, href: `/events?open=${e.id}` }));
  (items ?? []).forEach((i: any) =>
    rows.push({ date: i.event_date, kind: "inbox", label: i.title || "(untitled)", linked: !!i.event_id, href: `/inbox?open=${i.id}` }));

  const byDate: Record<string, Row[]> = {};
  rows.forEach((r) => (byDate[r.date] ??= []).push(r));
  return Object.entries(byDate).sort((a, b) => b[0].localeCompare(a[0]));
}
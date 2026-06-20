import { getCalendar } from "@/lib/queries/calendar";
import { Badge } from "@/components/ui/badge";

export default async function CalendarPage() {
  const days = await getCalendar();
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Calendar</h1>
      {days.length === 0 && <p className="text-sm text-muted-foreground">Nothing with a date yet.</p>}
      <div className="space-y-6">
        {days.map(([date, rows]) => (
          <div key={date} className="space-y-2">
            <h2 className="text-sm font-semibold">{date}</h2>
            <ul className="space-y-1 border-l pl-4">
              {rows.map((r, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <Badge variant={r.kind === "event" ? "default" : "secondary"}>
                    {r.kind === "event" ? "Event" : "Inbox"}
                  </Badge>
                  <span>{r.label}</span>
                  {r.kind === "inbox" && !r.linked && <span className="text-xs text-amber-600">unlinked</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
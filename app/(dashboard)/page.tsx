import Link from "next/link";
import { getWhatsNext } from "@/lib/queries/whats-next";
import { loadWhatsNext } from "@/lib/fidic/get-obligations";
import { ObligationItem } from "@/components/whats-next/obligation-item";
import { Card, CardContent } from "@/components/ui/card";
import { Inbox, FileText, AlertCircle} from "lucide-react";

export default async function WhatsNextPage() {
  // Fetch both in parallel: the FIDIC obligations and the housekeeping counts.
  const [{ unlinkedInbox, draftClaims, eventsNoEvidence }, items] = await Promise.all([
    getWhatsNext(),
    loadWhatsNext(),
  ]);

  // FIDIC obligations, grouped by urgency.
  const overdue = items.filter((i) => i.status === "overdue");
  const actionNeeded = items.filter((i) => i.status === "action_needed");
  const awaiting = items.filter((i) => i.status === "awaiting");

  // Housekeeping prompts.
 const cards = [
  {
    show: unlinkedInbox > 0,
    href: "/inbox",
    icon: Inbox,
    text: `${unlinkedInbox} inbox item${unlinkedInbox === 1 ? " is" : "s are"} not linked to any event`,
  },
  {
    show: draftClaims > 0,
    href: "/claims",
    icon: FileText,
    text: `${draftClaims} draft claim${draftClaims === 1 ? " is" : "s are"} waiting`,
  },
  {
    show: eventsNoEvidence > 0,
    href: "/events",
    icon: AlertCircle,
    text: `${eventsNoEvidence} event${eventsNoEvidence === 1 ? " has" : "s have"} no evidence linked yet`,
  },
].filter((c) => c.show);

  const nothing = items.length === 0 && cards.length === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">What&apos;s Next</h1>
        <p className="text-sm text-muted-foreground">
          Contractual deadlines and project housekeeping, most urgent first.
        </p>
      </div>

      {nothing && (
        <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          All clear — nothing needs attention right now.
        </p>
      )}

      {/* FIDIC obligations */}
      {overdue.length > 0 && <Section title="Overdue" items={overdue} />}
      {actionNeeded.length > 0 && <Section title="Action needed" items={actionNeeded} />}
      {awaiting.length > 0 && <Section title="Awaiting others" items={awaiting} />}

      {/* Housekeeping */}
      {cards.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Housekeeping
          </h2>
          <div className="space-y-3">
            {cards.map((c, i) => {
              const Icon = c.icon;
              return (
                <Link key={i} href={c.href}>
                  <Card className="transition-colors hover:bg-muted/50">
                    <CardContent className="flex items-center gap-3 p-4">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm">{c.text}</span>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function Section({
  title,
  items,
}: {
  title: string;
  items: Awaited<ReturnType<typeof loadWhatsNext>>;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title} ({items.length})
      </h2>
      <div className="space-y-2">
        {items.map((item) => (
          <ObligationItem key={item.eventId} item={item} />
        ))}
      </div>
    </section>
  );
}
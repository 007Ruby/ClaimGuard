import Link from "next/link";
import { getWhatsNext } from "@/lib/queries/whats-next";
import { Card, CardContent } from "@/components/ui/card";
import { Inbox, FileText, AlertCircle } from "lucide-react";

export default async function WhatsNextPage() {
  const { unlinkedInbox, draftClaims, eventsNoEvidence } = await getWhatsNext();

  const cards = [
    { show: unlinkedInbox > 0, href: "/inbox", icon: Inbox,
      text: `${unlinkedInbox} inbox item${unlinkedInbox === 1 ? " is" : "s are"} not linked to any event` },
    { show: draftClaims > 0, href: "/claims", icon: FileText,
      text: `${draftClaims} draft claim${draftClaims === 1 ? " is" : "s are"} waiting` },
    { show: eventsNoEvidence > 0, href: "/events", icon: AlertCircle,
      text: `${eventsNoEvidence} event${eventsNoEvidence === 1 ? " has" : "s have"} no evidence linked yet` },
  ].filter((c) => c.show);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">What&apos;s Next</h1>
      {cards.length === 0 && <p className="text-sm text-muted-foreground">All clear — nothing needs attention.</p>}
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
    </div>
  );
}
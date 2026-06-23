import { listClaims } from "@/lib/queries/claims";
import { listEventsForSelect } from "@/lib/queries/events";
import { ClaimBuilder } from "@/components/claims/claim-builder";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TYPE_LABEL: Record<string, string> = {
  variation_change: "Variation / Change", delay_eot: "Delay / EOT", payment_dispute: "Payment dispute",
  disruption: "Disruption", acceleration: "Acceleration", backcharge: "Backcharge",
};

export default async function ClaimsPage() {
  const [claims, events] = await Promise.all([listClaims(), listEventsForSelect()]);
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Claims</h1>
      <ClaimBuilder events={events as any} />
      <div className="space-y-4">
        {claims.length === 0 && <p className="text-sm text-muted-foreground">No claims yet.</p>}
        {claims.map((c: any) => (
          <Card key={c.id}>
            <CardHeader className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">{c.title}</CardTitle>
                <Badge variant="secondary">{c.status}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                {c.type ? (TYPE_LABEL[c.type] ?? c.type) : "No type"}
                {c.relief_sought ? ` · ${c.relief_sought}` : ""}
                {c.amount ? ` · ${c.currency} ${Number(c.amount).toLocaleString()}` : ""}
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {c.body && <p className="line-clamp-3 whitespace-pre-wrap text-sm">{c.body}</p>}
              <p className="text-xs text-muted-foreground">
                Events: {(c.claim_events ?? []).map((ce: any) => ce.event?.title).filter(Boolean).join(", ") || "none"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
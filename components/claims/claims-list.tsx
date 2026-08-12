"use client";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClaimDetailDialog } from "./claim-detail-dialog";

const TYPE_LABEL: Record<string, string> = {
  variation_change: "Variation / Change", delay_eot: "Delay / EOT", payment_dispute: "Payment dispute",
  disruption: "Disruption", acceleration: "Acceleration", backcharge: "Backcharge",
};
const KIND_LABEL: Record<string, string> = {
  notice: "Notice of claim",
  detailed: "Detailed claim",
};

export function ClaimsList({
  claims, openId, ts,
}: { claims: any[]; openId?: string; ts?: string }) {
  const router = useRouter();
  const open = (id: string) => router.push(`/claims?open=${id}&ts=${Date.now()}`);
  const close = () => router.push(`/claims`);
  const active = openId ? claims.find((c) => c.id === openId) ?? null : null;

  return (
    <div className="space-y-4">
      {claims.length === 0 && <p className="text-sm text-muted-foreground">No claims yet.</p>}
      {claims.map((c) => (
        <Card
          key={c.id}
          onClick={() => open(c.id)}
          className="cursor-pointer transition-colors hover:bg-muted/40"
        >
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">{c.title}</CardTitle>
              <div className="flex items-center gap-2">
                {c.kind && <Badge variant="outline">{KIND_LABEL[c.kind] ?? c.kind}</Badge>}
                <Badge variant={c.status === "submitted" ? "default" : "secondary"}>{c.status}</Badge>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {c.type ? (TYPE_LABEL[c.type] ?? c.type) : "No type"}
              {c.relief_sought ? ` · ${c.relief_sought}` : ""}
              {c.amount ? ` · ${c.currency} ${Number(c.amount).toLocaleString()}` : ""}
              {c.time_days ? ` · ${c.time_days} days` : ""}
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

      {active && (
        <ClaimDetailDialog key={`${openId}-${ts ?? ""}`} claim={active} onClose={close} />
      )}
    </div>
  );
}
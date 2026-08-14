"use client";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RfiDetailDialog } from "./rfi-detail-dialog";
import type { Rfi } from "@/lib/rfi/types";

/**
 * Saved RFIs, mirroring FollowUpsList: click a card → deep-link ?open={id}&ts=
 * → RfiDetailDialog (re-keyed by the ts nonce to beat the router-cache prefill
 * skip). Drafts open editable; sent/responded/closed open read-only.
 */
export function RfiSavedList({
  rfis, openId, ts,
}: { rfis: Rfi[]; openId?: string; ts?: string }) {
  const router = useRouter();
  const open = (id: string) => router.push(`/rfi?open=${id}&ts=${Date.now()}`);
  const close = () => router.push(`/rfi`);
  const active = openId ? rfis.find((r) => r.id === openId) ?? null : null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Saved RFIs</h2>
      {rfis.length === 0 && <p className="text-sm text-muted-foreground">No saved RFIs yet.</p>}
      {rfis.map((r) => (
        <Card key={r.id} onClick={() => open(r.id)} className="cursor-pointer transition-colors hover:bg-muted/40">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">
                <span className="text-muted-foreground">{r.reference}</span>{" "}
                {r.subject?.trim() || "(no subject)"}
              </CardTitle>
              <Badge variant={r.status === "draft" ? "secondary" : "default"}>{r.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {r.recipient ? `to ${r.recipient}` : "to The Engineer"}
              {r.dateSent ? ` · sent ${r.dateSent.slice(0, 10)}` : ""}
              {r.queries.length ? ` · ${r.queries.length} quer${r.queries.length === 1 ? "y" : "ies"}` : ""}
            </p>
          </CardHeader>
          <CardContent>
            {r.draftBody ? (
              <p className="line-clamp-3 whitespace-pre-wrap text-sm">{r.draftBody}</p>
            ) : r.queries.length ? (
              <p className="line-clamp-3 text-sm text-muted-foreground">
                {r.queries.map((q) => q.question).join(" · ")}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ))}

      {active && <RfiDetailDialog key={`${openId}-${ts ?? ""}`} rfi={active} onClose={close} />}
    </div>
  );
}
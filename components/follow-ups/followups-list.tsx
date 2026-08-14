"use client";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FollowUpDetailDialog } from "./followup-detail-dialog";
import type { SavedFollowUp } from "@/lib/queries/follow-ups";

export function FollowUpsList({
  followUps, openId, ts,
}: { followUps: SavedFollowUp[]; openId?: string; ts?: string }) {
  const router = useRouter();
  const open = (id: string) => router.push(`/follow-ups?open=${id}&ts=${Date.now()}`);
  const close = () => router.push(`/follow-ups`);
  const active = openId ? followUps.find((f) => f.id === openId) ?? null : null;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Saved follow-ups</h2>
      {followUps.length === 0 && (
        <p className="text-sm text-muted-foreground">No saved follow-ups yet.</p>
      )}
      {followUps.map((f) => (
        <Card
          key={f.id}
          onClick={() => open(f.id)}
          className="cursor-pointer transition-colors hover:bg-muted/40"
        >
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">{f.subject?.trim() || "(no subject)"}</CardTitle>
              <Badge variant={f.status === "sent" ? "default" : "secondary"}>{f.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {f.eventTitle ?? "(event removed)"}
              {f.recipient ? ` · to ${f.recipient}` : ""}
              {f.status === "sent" && f.sentAt ? ` · sent ${f.sentAt.slice(0, 10)}` : ""}
            </p>
          </CardHeader>
          <CardContent>
            {f.body && <p className="line-clamp-3 whitespace-pre-wrap text-sm">{f.body}</p>}
          </CardContent>
        </Card>
      ))}

      {active && (
        <FollowUpDetailDialog key={`${openId}-${ts ?? ""}`} followUp={active} onClose={close} />
      )}
    </div>
  );
}
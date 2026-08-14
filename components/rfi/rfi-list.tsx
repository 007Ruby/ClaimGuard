"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { RfiDialog, type EventOption } from "@/components/rfi/rfi-dialog";
import { CreateRfiButton } from "@/components/rfi/create-rfi-button";
import type { Rfi } from "@/lib/rfi/types";

export function RfiList({
  rfis,
  events,
}: {
  rfis: Rfi[];
  events: EventOption[];
}) {
  const router = useRouter();
  const params = useSearchParams();
  const openId = params.get("open");

  const [activeId, setActiveId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (openId) setActiveId(openId);
  }, [openId]);

  const active = rfis.find((r) => r.id === activeId) ?? null;

  function close() {
    setActiveId(null);
    router.replace("/rfi");
  }

  const eventTitle = (id: string | null) =>
    id ? events.find((e) => e.id === id)?.title ?? "(linked event)" : "—";

  return (
    <>
      <div className="flex items-center justify-end">
        <CreateRfiButton seed={{}} label="New RFI" />
      </div>

      {rfis.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No RFIs yet. Create one with the button above, from an inbox item, or
          from the assistant.
        </p>
      ) : (
        <div className="divide-y rounded-md border">
          {rfis.map((r) => (
            <button
              key={r.id}
              onClick={() => setActiveId(r.id)}
              className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/50"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.reference}</span>
                  <Badge variant="outline">{r.status}</Badge>
                </div>
                <div className="truncate text-sm text-muted-foreground">
                  {r.subject ?? "(no subject)"} · {eventTitle(r.eventId)}
                </div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {r.responseRequiredBy
                  ? `due ${r.responseRequiredBy}`
                  : r.dateSent
                    ? `sent ${r.dateSent}`
                    : "draft"}
              </span>
            </button>
          ))}
        </div>
      )}

      {active ? (
        <RfiDialog
          key={`${active.id}:${params.get("ts") ?? ""}`}
          rfi={active}
          events={events}
          open={true}
          onOpenChange={(o) => (o ? null : close())}
        />
      ) : null}
    </>
  );
}
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDocumentPriority } from "@/lib/actions/specifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type DocId = "contract" | "specification";

export function DocumentPriority({ initialOrder }: { initialOrder: DocId[] }) {
  const router = useRouter();
  const [order, setOrder] = useState<DocId[]>(initialOrder);
  const [saving, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const contractFirst = order[0] === "contract";

  function choose(next: DocId[]) {
    if (next[0] === order[0]) return;
    const prev = order;
    setOrder(next);
    start(async () => {
      const res = await setDocumentPriority(next);
      if (res?.error) { setMsg(res.error); setOrder(prev); return; }
      setMsg("Priority saved."); router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader><CardTitle>Document priority</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          When two documents disagree, the higher-priority one governs. FIDIC ranks the
          Conditions above the Specification by default; change this only if this contract's
          Particular Conditions say otherwise.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Button variant={contractFirst ? "default" : "outline"} disabled={saving}
                  onClick={() => choose(["contract", "specification"])}>
            Contract governs
          </Button>
          <Button variant={!contractFirst ? "default" : "outline"} disabled={saving}
                  onClick={() => choose(["specification", "contract"])}>
            Specification governs
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Current: {order.map((d) => (d === "contract" ? "Contract" : "Specification")).join(" → ")}
        </p>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </CardContent>
    </Card>
  );
}
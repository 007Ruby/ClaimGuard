"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveContractPeriods } from "@/lib/actions/contract-periods";
import { EDITABLE_PERIODS } from "@/lib/fidic/clauses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Data = Record<string, any> | null;

export function ContractPeriods({ initial }: { initial: Data }) {
  const router = useRouter();
  const [saving, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const seed: Record<string, number> = {};
  for (const p of EDITABLE_PERIODS) {
    const v = initial?.dayOverrides?.[p.key];
    seed[p.key] = typeof v === "number" && v > 0 ? v : p.defaultDays;
  }
  const [vals, setVals] = useState<Record<string, number>>(seed);

  function set(key: string, v: number) {
    setVals((s) => ({ ...s, [key]: v }));
    setOk(false); setMsg(null);
  }

  function save() {
    start(async () => {
      const res = await saveContractPeriods(vals);
      if (res?.error) { setOk(false); setMsg(`Save failed: ${res.error}`); return; }
      setOk(true); setMsg("Saved. Deadlines now use these periods.");
      router.refresh();
    });
  }

  if (!initial) return null; // no contract yet

  return (
    <Card>
      <CardHeader><CardTitle>Contractual periods</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Time bars used to compute every deadline. Defaults are the FIDIC General Conditions;
          a re-uploaded contract fills these from the Particular Conditions. Edit any value at any time.
        </p>
        <div className="grid grid-cols-2 gap-4">
          {EDITABLE_PERIODS.map((p) => (
            <div key={p.key} className="space-y-1.5">
              <Label htmlFor={`period-${p.key}`}>
                {p.label} <span className="text-muted-foreground">(SC {p.clauseRef})</span>
              </Label>
              <Input
                id={`period-${p.key}`}
                type="number"
                min={1}
                value={vals[p.key]}
                onChange={(e) => set(p.key, Math.max(1, Number(e.target.value) || 1))}
              />
              <p className="text-xs text-muted-foreground">{p.hint} · default {p.defaultDays}</p>
            </div>
          ))}
        </div>
        <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save periods"}</Button>
        {msg && <p className={`text-sm ${ok ? "text-emerald-600" : "text-muted-foreground"}`}>{msg}</p>}
      </CardContent>
    </Card>
  );
}
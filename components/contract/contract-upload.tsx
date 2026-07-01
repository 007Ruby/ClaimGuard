"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveContract } from "@/lib/actions/contract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, AlertTriangle } from "lucide-react";

type Data = Record<string, any>;

const FIELDS: { key: string; label: string; type?: string }[] = [
  { key: "name", label: "Project / works name" },
  { key: "commencementDate", label: "Commencement date", type: "date" },
  { key: "timeForCompletionDays", label: "Time for Completion (days)", type: "number" },
  { key: "defectsNotificationPeriodDays", label: "Defects Notification Period (days)", type: "number" },
  { key: "acceptedContractAmount", label: "Accepted Contract Amount", type: "number" },
  { key: "currency", label: "Currency" },
  { key: "governingLaw", label: "Governing law" },
  { key: "delayDamagesPerDay", label: "Delay damages (per day)" },
  { key: "advancePaymentPct", label: "Advance payment %", type: "number" },
  { key: "retentionPct", label: "Retention %", type: "number" },
];

export function ContractUpload({ initial, hasExisting }: { initial: Data | null; hasExisting?: boolean }) {
  const router = useRouter();
  const [saving, start] = useTransition();
  const [data, setData] = useState<Data | null>(null); // only set after a NEW extract
  const [extracting, setExtracting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function set(key: string, value: any) { setData((d) => ({ ...(d ?? {}), [key]: value })); }
  function setParty(role: string, value: string) {
    setData((d) => ({ ...(d ?? {}), parties: { ...((d ?? {}).parties ?? {}), [role]: value } }));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (file.type !== "application/pdf") { setMsg("PDF only."); return; }
    setExtracting(true); setMsg(null); setSaved(false);
    try {
      const fd = new FormData(); fd.set("file", file);
      const res = await fetch("/api/contract/extract", { method: "POST", body: fd });
      const raw = await res.text();
      let json: any;
      try { json = JSON.parse(raw); }
      catch {
        throw new Error(
          `The extract route didn't return JSON (HTTP ${res.status}). It likely crashed or the path is wrong — ` +
          `check the dev-server terminal. Response started with: ${raw.slice(0, 40)}`,
        );
      }
      if (!res.ok) throw new Error(json?.error ?? "Extraction failed");
      setData(json.data);
      setMsg("Extracted. Review the values below, then save to replace the current contract.");
    } catch (e: any) {
      setMsg(e?.message ?? "Couldn't read that PDF.");
    } finally { setExtracting(false); }
  }

  function save() {
    if (!data) return;
    start(async () => {
      const res = await saveContract(data);
      if (res?.error) { setSaved(false); setMsg(`Save failed: ${res.error}`); return; }
      setSaved(true); setMsg("Saved. Deadlines and claims now use this contract.");
      setData(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{hasExisting ? "Replace contract" : "Upload contract"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {hasExisting && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Uploading a new PDF <strong>replaces the current contract</strong>. All deadlines and claims will recompute against the new terms.</span>
            </div>
          )}
          <Input type="file" accept="application/pdf" disabled={extracting}
                 onChange={(e) => onFile(e.target.files?.[0])} />
          {extracting && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4" /> Reading the Appendix to Tender…
            </p>
          )}
          {msg && <p className={`text-sm ${saved ? "text-emerald-600" : "text-muted-foreground"}`}>{msg}</p>}
        </CardContent>
      </Card>

      {data && (
        <Card>
          <CardHeader><CardTitle>Review &amp; confirm</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={f.key}>{f.label}</Label>
                  <Input id={f.key} type={f.type ?? "text"}
                         value={data[f.key] ?? ""}
                         onChange={(e) => set(f.key, f.type === "number" ? Number(e.target.value) || null : e.target.value)} />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              {["employer", "contractor", "engineer"].map((role) => (
                <div key={role} className="space-y-1.5">
                  <Label htmlFor={`p-${role}`} className="capitalize">{role}</Label>
                  <Input id={`p-${role}`} value={data.parties?.[role] ?? ""}
                         onChange={(e) => setParty(role, e.target.value)} />
                </div>
              ))}
            </div>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : hasExisting ? "Save & replace contract" : "Save contract"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Anything not shown here (insurance, DAB, arbitration) is still extracted and saved.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
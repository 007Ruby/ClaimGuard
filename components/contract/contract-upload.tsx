"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveContract } from "@/lib/actions/contract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

type Data = Record<string, any>;

// The fields surfaced for review. Everything else extracted is still saved in
// `data`; these are the ones worth eyeballing (commencementDate drives deadlines).
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

export function ContractUpload({ initial }: { initial: Data | null }) {
  const router = useRouter();
  const [saving, start] = useTransition();
  const [data, setData] = useState<Data | null>(initial);
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
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Extraction failed");
      setData(json.data);
      setMsg("Extracted. Review the values below, then save.");
    } catch (e: any) {
      setMsg(e?.message ?? "Couldn't read that PDF.");
    } finally { setExtracting(false); }
  }

  function save() {
    if (!data) return;
    start(async () => {
      await saveContract(data);
      setSaved(true); setMsg("Saved. Deadlines and claims now use this contract.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Upload contract (PDF)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
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

            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save contract"}</Button>
            <p className="text-xs text-muted-foreground">
              Anything not shown here (insurance, DAB, arbitration, etc.) is still extracted and saved — these are just the fields most worth checking.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveContract } from "@/lib/actions/contract";
import { ContractSummary } from "@/components/contract/contract-summary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pencil, X } from "lucide-react";

type Data = Record<string, any>;
type Field = { key: string; label: string; type?: "text" | "number" | "date" };

const SCALAR_GROUPS: { title: string; fields: Field[] }[] = [
  { title: "Core", fields: [
    { key: "name", label: "Project / works name" },
    { key: "framework", label: "Framework" },
    { key: "commencementDate", label: "Commencement date", type: "date" },
  ]},
  { title: "Commercial", fields: [
    { key: "acceptedContractAmount", label: "Accepted Contract Amount", type: "number" },
    { key: "currency", label: "Currency" },
    { key: "minimumInterimPaymentCertificate", label: "Minimum Interim Payment Certificate", type: "number" },
    { key: "delayDamagesPerDay", label: "Delay damages (per day)" },
    { key: "maxDelayDamagesPct", label: "Max delay damages %", type: "number" },
  ]},
  { title: "Time", fields: [
    { key: "timeForCompletionDays", label: "Time for Completion (days)", type: "number" },
    { key: "defectsNotificationPeriodDays", label: "Defects Notification Period (days)", type: "number" },
    { key: "timeForAccessToSiteDays", label: "Time for Access to Site (days)", type: "number" },
  ]},
  { title: "Percentages", fields: [
    { key: "advancePaymentPct", label: "Advance payment %", type: "number" },
    { key: "retentionPct", label: "Retention %", type: "number" },
    { key: "retentionLimitPct", label: "Retention limit %", type: "number" },
    { key: "performanceSecurityPct", label: "Performance security %", type: "number" },
  ]},
  { title: "Law & language", fields: [
    { key: "governingLaw", label: "Governing law" },
    { key: "rulingLanguage", label: "Ruling language" },
    { key: "languageForCommunications", label: "Language for communications" },
  ]},
];

const NESTED_GROUPS: { key: string; title: string; fields: Field[] }[] = [
  { key: "parties", title: "Parties", fields: [
    { key: "employer", label: "Employer" },
    { key: "contractor", label: "Contractor" },
    { key: "engineer", label: "Engineer" },
  ]},
  { key: "dab", title: "Dispute Adjudication Board", fields: [
    { key: "appointBy", label: "Appoint by" },
    { key: "composition", label: "Composition" },
    { key: "appointingEntity", label: "Appointing entity" },
  ]},
  { key: "arbitration", title: "Arbitration", fields: [
    { key: "rules", label: "Rules" },
    { key: "seat", label: "Seat" },
    { key: "language", label: "Language" },
  ]},
];

export function ContractDetails({ initial }: { initial: Data }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, start] = useTransition();
  const [draft, setDraft] = useState<Data>(initial);
  const [msg, setMsg] = useState<string | null>(null);

  function setScalar(key: string, type: Field["type"], raw: string) {
    setDraft((d) => ({ ...d, [key]: type === "number" ? (Number(raw) || null) : raw }));
  }
  function setNested(group: string, key: string, raw: string) {
    setDraft((d) => ({ ...d, [group]: { ...(d[group] ?? {}), [key]: raw } }));
  }
  function cancel() { setDraft(initial); setEditing(false); setMsg(null); }
  function save() {
    start(async () => {
      const res = await saveContract(draft);
      if (res?.error) { setMsg(`Save failed: ${res.error}`); return; }
      setEditing(false); setMsg(null); router.refresh();
    });
  }

  if (!editing) {
    return (
      <div className="space-y-3">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </Button>
        </div>
        <ContractSummary data={initial} />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Edit contract</CardTitle>
        <Button variant="ghost" size="sm" onClick={cancel}><X className="mr-2 h-4 w-4" /> Cancel</Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {SCALAR_GROUPS.map((g) => (
          <div key={g.title} className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">{g.title}</h3>
            <div className="grid grid-cols-2 gap-4">
              {g.fields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={f.key}>{f.label}</Label>
                  <Input id={f.key} type={f.type ?? "text"}
                         value={draft[f.key] ?? ""}
                         onChange={(e) => setScalar(f.key, f.type, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        ))}
        {NESTED_GROUPS.map((g) => (
          <div key={g.key} className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">{g.title}</h3>
            <div className="grid grid-cols-2 gap-4">
              {g.fields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`${g.key}-${f.key}`}>{f.label}</Label>
                  <Input id={`${g.key}-${f.key}`}
                         value={draft[g.key]?.[f.key] ?? ""}
                         onChange={(e) => setNested(g.key, f.key, e.target.value)} />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="flex gap-2">
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          <Button variant="outline" onClick={cancel} disabled={saving}>Cancel</Button>
        </div>
        {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      </CardContent>
    </Card>
  );
}
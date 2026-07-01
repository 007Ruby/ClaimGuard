// components/contract/contract-summary.tsx
// Read-only summary of the saved contract (server component, no interactivity).
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b py-2 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right">{value ?? "—"}</span>
    </div>
  );
}

export function ContractSummary({ data }: { data: Record<string, any> }) {
  const money =
    data.acceptedContractAmount != null
      ? `${data.currency ?? ""} ${Number(data.acceptedContractAmount).toLocaleString()}`.trim()
      : "—";
  const p = data.parties ?? {};

  return (
    <Card>
      <CardHeader><CardTitle>Current contract</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Row label="Project" value={data.name} />
          <Row label="Framework" value={data.framework ?? "FIDIC Red Book 1999"} />
          <Row label="Commencement date" value={data.commencementDate} />
          <Row label="Time for Completion" value={data.timeForCompletionDays ? `${data.timeForCompletionDays} days` : "—"} />
          <Row label="Defects Notification Period" value={data.defectsNotificationPeriodDays ? `${data.defectsNotificationPeriodDays} days` : "—"} />
          <Row label="Accepted Contract Amount" value={money} />
          <Row label="Governing law" value={data.governingLaw} />
          <Row label="Delay damages" value={data.delayDamagesPerDay} />
          <Row label="Retention" value={data.retentionPct != null ? `${data.retentionPct}%` : "—"} />
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Parties</p>
          <Row label="Employer" value={p.employer} />
          <Row label="Contractor" value={p.contractor} />
          <Row label="Engineer" value={p.engineer} />
        </div>

        <p className="text-xs text-muted-foreground">
          These values drive every deadline and claim. Key FIDIC time bars applied:
          notice 28 days (SC 20.1), detailed claim 42 days, IPC 28 days (SC 14.6), payment 56 days (SC 14.7).
        </p>
      </CardContent>
    </Card>
  );
}
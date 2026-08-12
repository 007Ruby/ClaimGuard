import { listClaims } from "@/lib/queries/claims";
import { listEventsForSelect } from "@/lib/queries/events";
import { ClaimBuilder } from "@/components/claims/claim-builder";
import { ClaimsList } from "@/components/claims/claims-list";

export default async function ClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; intent?: string; open?: string; ts?: string }>;
}) {
  const sp = await searchParams;
  const intent = sp.intent === "notice" || sp.intent === "detailed" ? sp.intent : null;

  const [claims, events] = await Promise.all([listClaims(), listEventsForSelect()]);
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold">Claims</h1>
      <ClaimBuilder
        key={sp.event ?? "new"}
        events={events as any}
        initialEventId={sp.event ?? null}
        initialIntent={intent}
      />
      <ClaimsList claims={claims} openId={sp.open} ts={sp.ts} />
    </div>
  );
}
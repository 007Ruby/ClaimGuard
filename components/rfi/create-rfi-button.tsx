"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createRfiDraft } from "@/lib/actions/rfi";
import type { RfiSeed } from "@/lib/rfi/types";

/**
 * The single funnel shared by all three entry points (inbox flag, assistant
 * card, and anywhere else). Seeds a draft RFI, then deep-links to the RFI page
 * with the dialog open. The ?ts nonce defeats the router-cache prefill-skip
 * gotcha by forcing the dialog form to re-key on arrival.
 */
export function CreateRfiButton({
  seed,
  label = "Create RFI",
  variant = "default",
  size = "sm",
  className,
  onCreated,
}: {
  seed: RfiSeed;
  label?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
  onCreated?: (id: string) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handle() {
    setPending(true);
    setError(null);
    const res = await createRfiDraft(seed);
    setPending(false);
    if (res.error || !res.id) {
      setError(res.error ?? "Could not create the RFI.");
      return;
    }
    onCreated?.(res.id);
    router.push(`/rfi?open=${res.id}&ts=${Date.now()}`);
  }

  return (
    <div className={className}>
      <Button variant={variant} size={size} onClick={handle} disabled={pending}>
        {pending ? "Creating…" : label}
      </Button>
      {error ? (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
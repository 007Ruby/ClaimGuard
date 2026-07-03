"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

const CLAIM_TYPES = [
  "variation_change", "delay_eot", "payment_dispute",
  "disruption", "acceleration", "backcharge",
];
const RELIEF = ["money", "time", "both"];

const norm = (v: string | null | undefined, allowed: string[]) => {
  const x = (v ?? "").toLowerCase().trim();
  return allowed.includes(x) ? x : null;
};

export async function createClaim(input: {
  title: string;
  kind?: "notice" | "detailed";
  type?: string | null;
  relief_sought?: string | null;
  amount?: number | null;
  description?: string | null;
  body?: string | null;
  ai_generated?: boolean;
  primary_event_id?: string | null;
  event_ids?: string[]; // additional events linked as further evidence
}): Promise<{ error?: string; id?: string }> {
  const { orgId, projectId, user } = await getSessionContext();
  const supabase = await createClient();

  const title = (input.title ?? "").trim();
  if (!title) return { error: "Title is required." };

  const { data: claim, error } = await supabase
    .from("claims")
    .insert({
      org_id: orgId,
      project_id: projectId,
      title,
      kind: input.kind === "notice" ? "notice" : "detailed",
      type: norm(input.type, CLAIM_TYPES),
      relief_sought: norm(input.relief_sought, RELIEF),
      amount:
        typeof input.amount === "number" && !Number.isNaN(input.amount)
          ? input.amount
          : null,
      currency: "AED",
      description: (input.description ?? "").trim() || null,
      body: (input.body ?? "").trim() || null,
      ai_generated: !!input.ai_generated,
      status: "draft",
      primary_event_id: input.primary_event_id ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !claim)
    return { error: error?.message ?? "Could not save the claim." };

  // Link the primary event plus any additional evidence events (de-duped).
  const ids = Array.from(
    new Set(
      [
        ...(input.primary_event_id ? [input.primary_event_id] : []),
        ...(input.event_ids ?? []),
      ].filter(Boolean),
    ),
  );
  if (ids.length) {
    await supabase
      .from("claim_events")
      .insert(ids.map((event_id) => ({ claim_id: claim.id, event_id })));
  }

  revalidatePath("/claims");
  revalidatePath("/");
  return { id: claim.id };
}
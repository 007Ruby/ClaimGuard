"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/queries/session";

export async function createEvent(formData: FormData) {
  const { orgId, projectId, user } = await getSessionContext();
  const supabase = await createClient();

  const occurred = (formData.get("occurred_on") as string) || null;

  const { data, error } = await supabase
    .from("events")
    .insert({
      org_id: orgId,
      project_id: projectId,
      created_by: user.id,
      title: formData.get("title") as string,
      type: formData.get("type") as string,
      description: (formData.get("description") as string) || null,
      occurred_on: occurred,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/events?error=${encodeURIComponent(error?.message ?? "Failed")}`);
  }

  revalidatePath("/events");
  redirect(`/events/${data.id}`);
}

export async function updateEventStatus(id: string, status: string) {
  const supabase = await createClient();
  await supabase.from("events").update({ status }).eq("id", id);
  revalidatePath(`/events/${id}`);
  revalidatePath("/events");
}
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function getSessionContext() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // The user's membership -> org -> the org's single project (MVP: one project).
  const { data: membership } = await supabase
    .from("organization_members")
    .select("org_id, role, organizations(name)")
    .eq("user_id", user.id)
    .single();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("org_id", membership?.org_id)
    .limit(1)
    .single();

return {
  user,
  orgId: membership?.org_id as string,
  orgName: membership?.organizations?.[0]?.name ?? "",
  role: membership?.role as string,
  projectId: project?.id as string,
  projectName: project?.name ?? "",
};
}
import { createAdminClient } from "@/lib/supabase/admin";

export async function bootstrapNewUser(userId: string, companyName: string) {
  const admin = createAdminClient();

  // The signup trigger normally creates the public.users row; upsert is a
  // safety net against any timing gap before the foreign keys below resolve.
  await admin.from("users").upsert({ id: userId }, { onConflict: "id" });

  // 1. The organization.
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: companyName, created_by: userId })
    .select("id")
    .single();
  if (orgError || !org) throw new Error(orgError?.message ?? "Could not create organization");

  // 2. The user as its owner.
  const { error: memberError } = await admin
    .from("organization_members")
    .insert({ org_id: org.id, user_id: userId, role: "owner" });
  if (memberError) throw new Error(memberError.message);

  // 3. The single default project for the MVP.
  const { error: projectError } = await admin
    .from("projects")
    .insert({ org_id: org.id, name: "Default project", created_by: userId });
  if (projectError) throw new Error(projectError.message);
}
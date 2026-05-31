import { Sidebar } from "@/components/layout/sidebar";
import { UserMenu } from "@/components/layout/user-menu";
import { getSessionContext } from "@/lib/queries/session";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, orgName } = await getSessionContext();

  return (
    <div className="flex h-screen">
      <div className="flex h-screen w-60 flex-col border-r bg-muted/20">
        <div className="flex-1 overflow-y-auto">
          <Sidebar />
        </div>
        <UserMenu email={user.email ?? ""} orgName={orgName} />
      </div>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
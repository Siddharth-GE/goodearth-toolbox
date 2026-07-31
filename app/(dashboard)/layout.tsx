import { Sidebar } from "@/components/layout/sidebar";
import { getGrantedApps } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { visibleTools } from "@/lib/tools";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  // Admins skip the query entirely — the sidebar's admin bypass never
  // depends on user_apps or its RLS, so a bug there can't lock out an
  // admin's own account.
  const grantedApps = user.profile?.role === "admin" ? [] : await getGrantedApps(user.id);
  const tools = visibleTools(user.profile, grantedApps);

  return (
    <div className="flex min-h-screen">
      <Sidebar tools={tools} userName={user.profile?.full_name || user.email} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

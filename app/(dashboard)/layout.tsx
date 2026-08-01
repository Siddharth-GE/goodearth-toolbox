import { Sidebar } from "@/components/layout/sidebar";
import { requireUser } from "@/lib/auth/dal";
import { visibleTools } from "@/lib/tools";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Admins ignore grantedApps entirely — the sidebar's admin bypass
  // never depends on user_apps, so a bug there can't lock out an
  // admin's own account.
  const grantedApps = user.profile?.role === "admin" ? [] : user.grantedApps;
  const tools = visibleTools(user.profile, grantedApps);

  return (
    // Column on phones (top bar above content), row from md up (rail
    // beside content). The rail pins itself with sticky; the page body
    // is the one scroll container, so anchors and the browser's own
    // chrome behave normally. min-w-0 keeps a wide table inside main
    // from stretching the whole row instead of scrolling in place.
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar tools={tools} userName={user.profile?.full_name || user.email} />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-5 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}

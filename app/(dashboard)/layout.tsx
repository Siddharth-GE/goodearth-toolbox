import { Sidebar } from "@/components/layout/sidebar";
import { requireUser } from "@/lib/auth/dal";
import { visibleTools } from "@/lib/tools";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const tools = visibleTools(user.profile);

  return (
    <div className="flex min-h-screen">
      <Sidebar tools={tools} userName={user.profile?.full_name || user.email} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

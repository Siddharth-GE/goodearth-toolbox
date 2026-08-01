import { PageTitle } from "@/components/ui/page-title";
import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { MastersNav } from "./_components/masters-nav";

export default async function MastersLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await requireApp(user, "/masters");

  return (
    <div className="space-y-4">
      <PageTitle
        title="Masters"
        description="Projects, plots, units, clients, vendors, stores, and items."
      />
      <MastersNav />
      {children}
    </div>
  );
}

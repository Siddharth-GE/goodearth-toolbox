import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { MastersNav } from "./_components/masters-nav";

export default async function MastersLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await requireApp(user, "/masters");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-foreground">Masters</h1>
        <p className="text-sm text-muted">Projects, plots, units, clients, vendors, stores, and items.</p>
      </div>
      <MastersNav />
      {children}
    </div>
  );
}

import { PageTitle } from "@/components/ui/page-title";
import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";

export default async function SupervisorsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await requireApp(user, "/supervisors");

  return (
    <div className="space-y-4">
      <PageTitle title="Supervisors" description="The site's day: labour, materials, requests." />
      {children}
    </div>
  );
}

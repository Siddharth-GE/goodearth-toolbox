import { PageTitle } from "@/components/ui/page-title";
import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";

export default async function DesignManagementLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await requireApp(user, "/design-management");

  return (
    <div className="space-y-4">
      <PageTitle
        title="Design Management"
        description="Drawing sets and their revisions for each villa, and the transmittals that send them to site."
      />
      {children}
    </div>
  );
}

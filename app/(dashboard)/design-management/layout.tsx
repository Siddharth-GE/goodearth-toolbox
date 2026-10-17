import { PageTitle } from "@/components/ui/page-title";
import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";

import { DesignNav } from "./_components/design-nav";

export default async function DesignManagementLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await requireApp(user, "/design-management");

  return (
    <div className="space-y-4">
      <PageTitle
        title="Design Management"
        description="Each villa's design from stage to stage, who is on it, and the drawings that go to site."
      />
      <DesignNav />
      {children}
    </div>
  );
}

import { PageTitle } from "@/components/ui/page-title";
import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { EstimatorNav } from "./_components/estimator-nav";

export default async function EstimatorLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await requireApp(user, "/estimator");

  return (
    <div className="space-y-4">
      <PageTitle
        title="Estimator"
        description="What a villa costs to build, work by work."
      />
      <EstimatorNav />
      {children}
    </div>
  );
}

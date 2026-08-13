import { PageTitle } from "@/components/ui/page-title";
import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { FmNav } from "./_components/fm-nav";

export default async function FinancialManagementLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  await requireApp(user, "/financial-management");

  return (
    <div className="space-y-4">
      <PageTitle
        title="Financial Management"
        description="Cash flow, receivables and spending across the company."
      />
      <FmNav />
      {children}
    </div>
  );
}

import { PageTitle } from "@/components/ui/page-title";
import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { CrmNav } from "./_components/crm-nav";

export default async function ClientRelationsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await requireApp(user, "/client-relations");

  return (
    <div className="space-y-4">
      <PageTitle
        title="Client Relations"
        description="Every client and plot, from first visit to the last payment."
      />
      <CrmNav />
      {children}
    </div>
  );
}

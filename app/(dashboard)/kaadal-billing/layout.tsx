import { LinkButton } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
import { UndoBarProvider } from "@/components/ui/undo-bar";
import { requireApp } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { GRANT } from "@/lib/kaadal-billing/ledger";
import { Download, Plus } from "lucide-react";
import { BillingNav } from "./_components/billing-nav";

export default async function KaadalBillingLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await requireApp(user, GRANT);

  return (
    <UndoBarProvider>
      <div className="space-y-4">
        <PageTitle
          title="Kaadal Billing"
          description="Vendor orders for the Kaadal plots, and what Kaadal and the client have paid."
          actions={
            <>
              <LinkButton href="/kaadal-billing/download" variant="secondary" plain>
                <Download className="size-4" aria-hidden />
                Export to Excel
              </LinkButton>
              <LinkButton href="/kaadal-billing/orders/new">
                <Plus className="size-4" aria-hidden />
                New order
              </LinkButton>
            </>
          }
        />
        <BillingNav />
        {children}
      </div>
    </UndoBarProvider>
  );
}

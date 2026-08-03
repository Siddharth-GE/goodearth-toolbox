import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";
import { PageTitle } from "@/components/ui/page-title";
import { ShoppingCart } from "lucide-react";

// Placeholder until M2 lands the real flow (project → plot/unit scope →
// vendor → the approved-indent-line pool). Kept as a page rather than a
// dead link so the list's "New PO" button never 404s mid-phase.
export default function NewPurchaseOrderPage() {
  return (
    <div className="space-y-4">
      <PageTitle title="New purchase order" backHref="/purchase-orders" backLabel="Purchase Orders" />
      <EmptyState
        icon={ShoppingCart}
        title="Almost here"
        description="Raising a PO from approved indent lines arrives with the next milestone of this build."
        action={<LinkButton href="/purchase-orders">Back to the list</LinkButton>}
      />
    </div>
  );
}

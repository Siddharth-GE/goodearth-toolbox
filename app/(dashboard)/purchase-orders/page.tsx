import { PageTitle } from "@/components/ui/page-title";
import { getWelcomeCounts } from "@/lib/purchase-orders/queries";

import { ToolWelcome } from "../_components/tool-welcome";

// Counts only: PO money stays behind the doors.
export default async function PurchaseOrdersPage() {
  const counts = await getWelcomeCounts();

  return (
    <div className="space-y-4">
      <PageTitle
        title="Purchase Orders"
        description="Orders to vendors — always from approved indent lines."
      />
      <ToolWelcome
        icon="ShoppingCart"
        intro={[
          "An order always starts from an approved indent: pick it, give each line a vendor, and one draft PO per vendor is made. A bulk buy gathers several villas' approved indents into one general PO, delivered to a store. Each PO is one vendor and one plot, unit or general scope, priced here and issued to the vendor. An issued PO is what deliveries are received against and what bills are recorded against.",
          "Deleting an issued PO is never quiet: it has to be requested, and someone else approves it.",
        ]}
        stats={[
          { label: "Drafts", value: counts.drafts, hint: "being put together" },
          { label: "Issued", value: counts.issuedOpen, hint: "with vendors now" },
          {
            label: "Deletion requests",
            value: counts.deletionRequests,
            hint: "waiting on a decision",
          },
        ]}
        links={[
          { label: "From an indent", href: "/purchase-orders/from-indent", primary: true },
          { label: "Bulk PO from several indents", href: "/purchase-orders/new" },
          { label: "All purchase orders", href: "/purchase-orders/list" },
          { label: "Deletion requested", href: "/purchase-orders/list?status=deletion_requested" },
        ]}
      />
    </div>
  );
}

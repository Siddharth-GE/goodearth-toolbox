import { PageTitle } from "@/components/ui/page-title";
import { getWelcomeCounts } from "@/lib/purchase-orders/queries";

import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen (founder, 2026-08-13: every Operations and
// Management tool opens on one). The list lives one click in at
// /purchase-orders/list. Counts only — PO money stays behind the doors.
export default async function PurchaseOrdersPage() {
  const counts = await getWelcomeCounts();

  return (
    <div className="space-y-4">
      <PageTitle
        title="Purchase Orders"
        description="Orders to vendors — from approved indent lines, or raised directly for bulk and urgent buys."
      />
      <ToolWelcome
        icon="ShoppingCart"
        intro={[
          "An order starts from an approved indent line, or is raised directly for a bulk or urgent buy that belongs to no one plot — one vendor and one plot, unit or general scope per PO, priced here and issued to the vendor. An issued PO is what deliveries are received against and what bills are recorded against.",
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
          { label: "New PO", href: "/purchase-orders/new", primary: true },
          { label: "All purchase orders", href: "/purchase-orders/list" },
          { label: "Deletion requested", href: "/purchase-orders/list?status=deletion_requested" },
        ]}
      />
    </div>
  );
}

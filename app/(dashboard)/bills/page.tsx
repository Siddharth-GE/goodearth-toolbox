import { PageTitle } from "@/components/ui/page-title";
import { getWelcomeCounts } from "@/lib/bills/queries";

import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen (founder, 2026-08-13: every Operations and
// Management tool opens on one). The list lives one click in at
// /bills/list. Counts only — bill amounts stay behind the doors.
export default async function BillsPage() {
  const counts = await getWelcomeCounts();

  return (
    <div className="space-y-4">
      <PageTitle title="Bills" description="Vendor invoices against POs and work orders." />
      <ToolWelcome
        icon="Receipt"
        intro={[
          "The vendor's paper invoice, recorded as printed — against one purchase order or one work order. A recorded bill goes to an approver, and only an approved bill can be marked paid, so what we owe is never a matter of memory.",
          "Work orders live here too: a contractor's works from the Masters list, priced, with their terms — approved by a bill approver, then billed against.",
        ]}
        stats={[
          {
            label: "Awaiting approval",
            value: counts.awaitingApproval,
            hint: "recorded, not yet cleared",
          },
          { label: "Unpaid", value: counts.unpaid, hint: "recorded and approved together" },
          { label: "Paid this month", value: counts.paidThisMonth, hint: "settled" },
        ]}
        links={[
          { label: "Record bill", href: "/bills/new", primary: true },
          { label: "All bills", href: "/bills/list" },
          { label: "Work orders", href: "/bills/work-orders" },
        ]}
      />
    </div>
  );
}

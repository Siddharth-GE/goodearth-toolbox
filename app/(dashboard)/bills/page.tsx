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
          "A bill lists what it is for — a PO's materials, a work order's works, or the labour the supervisors logged — and its totals are the lines'. A recorded bill goes to an approver; an approved one is paid, in part or in full, through the week's cash request, and it is paid when the payments reach its total. What we owe is never a matter of memory.",
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
          { label: "Labour to bill", href: "/bills/labour" },
          { label: "Cash requests", href: "/bills/cash-requests" },
          { label: "Payments", href: "/bills/payments" },
          { label: "Contractors", href: "/bills/contractors" },
          { label: "Work orders", href: "/bills/work-orders" },
        ]}
      />
    </div>
  );
}

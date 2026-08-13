import { getWelcomeCounts } from "@/lib/financial-management/queries";

import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen (founder, 2026-08-13: every Operations and
// Management tool opens on one). No PageTitle here — the layout renders
// the title and nav. The Cash dashboard lives one click in at
// /financial-management/cash. Counts only, never rupees: this tool's
// screens are all money, so the welcome is the one place showing none.
export default async function FinancialManagementPage() {
  const counts = await getWelcomeCounts();

  return (
    <ToolWelcome
      icon="Landmark"
      intro={[
        "The company's money picture in one place, drawn from what the other tools record — client receipts from Client Relations, paid bills from Bills — plus the funding ledger kept here: every loan and investor, its drawdowns, repayments and interest.",
        "Cash adds up money in against money out, month by month. Forward looks ahead at expected collections against the plan. Funding is the ledger of what has been raised.",
      ]}
      stats={[
        { label: "Funding facilities", value: counts.facilities, hint: "loans and investors" },
        {
          label: "Bills awaiting payment",
          value: counts.approvedUnpaid,
          hint: "approved, not yet paid",
        },
        {
          label: "Receipts this month",
          value: counts.receiptsThisMonth,
          hint: "client payments in",
        },
      ]}
      links={[
        { label: "Cash", href: "/financial-management/cash", primary: true },
        { label: "Forward", href: "/financial-management/forward" },
        { label: "Funding", href: "/financial-management/funding" },
      ]}
    />
  );
}

import { getWelcomeCounts } from "@/lib/financial-management/queries";

import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen: counts only, never rupees. The Cash dashboard is one click in at
// /financial-management/cash. The layout renders the title and nav.
export default async function FinancialManagementPage() {
  const counts = await getWelcomeCounts();

  return (
    <ToolWelcome
      icon="Landmark"
      intro={[
        "The company's money picture in one place, drawn from what the other tools record — client receipts from Client Relations, paid bills from Bills — plus the funding ledger kept here: every loan and investor, its drawdowns, repayments and interest.",
        "Cash adds up money in against money out, month by month. Forward looks ahead at expected collections against the plan. Funding is the ledger of what has been raised. Birdwing is the guest house's own picture — billed, collected, spent and still pending.",
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
        { label: "Birdwing", href: "/financial-management/birdwing" },
      ]}
    />
  );
}

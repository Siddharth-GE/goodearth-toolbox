import { PageTitle } from "@/components/ui/page-title";
import { listInbox } from "@/lib/budgets/queries";

import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen (founder, 2026-08-13: every Operations and
// Management tool opens on one). Counts only — the rupees stay on the
// screens behind the doors below. The inbox is a complete fetchAll read,
// so deriving counts from it is safe.
export default async function BudgetsPage() {
  const inbox = await listInbox();
  const waiting = inbox.filter((row) => !row.budget_id).length;
  const pricing = inbox.filter((row) => row.budget_status === "pricing").length;
  const approved = inbox.filter((row) => row.budget_status === "approved").length;

  return (
    <div className="space-y-4">
      <PageTitle title="Budgets" description="Price an issued design revision, space by space." />
      <ToolWelcome
        icon="PiggyBank"
        intro={[
          "The moment the design team issues a revision, it lands here to be priced — every line, space by space, with the margins this team alone can see. An approved budget is what Indents draws against, so nothing is purchased that was never priced.",
          "Interiors carries the priced revisions and client quotes; Construction carries the QS team's stage-wise quantity plans.",
        ]}
        stats={[
          { label: "Waiting to price", value: waiting, hint: "issued, not started" },
          { label: "Being priced", value: pricing, hint: "part-way through" },
          { label: "Approved", value: approved, hint: "ready for indents" },
        ]}
        links={[
          { label: "Pricing inbox", href: "/budgets/interiors", primary: true },
          { label: "Construction", href: "/budgets/construction" },
          { label: "Product margins", href: "/budgets/margins" },
        ]}
      />
    </div>
  );
}

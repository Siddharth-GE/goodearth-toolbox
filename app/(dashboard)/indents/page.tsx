import { PageTitle } from "@/components/ui/page-title";
import { getWelcomeCounts } from "@/lib/indents/queries";

import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen (founder, 2026-08-13: every Operations and
// Management tool opens on one). The list lives one click in at
// /indents/list.
export default async function IndentsPage() {
  const counts = await getWelcomeCounts();

  return (
    <div className="space-y-4">
      <PageTitle
        title="Indents"
        description="Site teams request materials, tagged to project and plot."
      />
      <ToolWelcome
        icon="ClipboardList"
        intro={[
          "When site needs materials, it starts here: an indent names the project, the plot and the materials, and goes up for approval. Approved lines are what Purchase Orders buys against — nothing is ordered that site never asked for.",
          "No prices anywhere on an indent — quantities and dates are its whole story.",
        ]}
        stats={[
          {
            label: "Awaiting approval",
            value: counts.awaitingApproval,
            hint: "submitted from site",
          },
          { label: "Drafts", value: counts.drafts, hint: "still being put together" },
          { label: "Approved this month", value: counts.approvedThisMonth, hint: "cleared to buy" },
        ]}
        links={[
          { label: "New indent", href: "/indents/new", primary: true },
          { label: "All indents", href: "/indents/list" },
          { label: "Awaiting approval", href: "/indents/list?status=submitted" },
        ]}
      />
    </div>
  );
}

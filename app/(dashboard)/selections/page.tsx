import { PageTitle } from "@/components/ui/page-title";
import { getWelcomeCounts } from "@/lib/selections/queries";

import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen (founder, 2026-08-13: every Operations and
// Management tool opens on one). The units list lives one click in at
// /selections/units.
export default async function SelectionsPage() {
  const counts = await getWelcomeCounts();

  return (
    <div className="space-y-4">
      <PageTitle title="Selections" description="What goes into every space of a unit." />
      <ToolWelcome
        icon="Palette"
        intro={[
          "Selections is where a design becomes a list: what goes into every space of a unit — finishes, fittings, fixtures — captured revision by revision. Costs and rates deliberately stay out of sight here; pricing is Budgets' job.",
          "A revision is drafted, then issued to budgeting. Once issued it is locked, so what a budget was priced against can never quietly change underneath it.",
        ]}
        stats={[
          { label: "Units", value: counts.units, hint: "created in Masters" },
          { label: "Drafts open", value: counts.drafts, hint: "being designed right now" },
          { label: "With budgeting", value: counts.issued, hint: "issued revisions" },
        ]}
        links={[{ label: "Open units", href: "/selections/units", primary: true }]}
      />
    </div>
  );
}

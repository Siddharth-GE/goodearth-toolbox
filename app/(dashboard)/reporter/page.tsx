import { PageTitle } from "@/components/ui/page-title";
import { DATASETS } from "@/lib/reporter/datasets";
import { getWelcomeCounts } from "@/lib/reporter/queries";
import { STARTERS } from "@/lib/reporter/starters";

import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen (founder, 2026-08-13: every Operations and
// Management tool opens on one). The starters and saved reports live one
// click in at /reporter/saved. Counts only — the money Reporter can show
// stays inside the reports themselves.
export default async function ReporterPage() {
  const counts = await getWelcomeCounts();

  return (
    <div className="space-y-4">
      <PageTitle
        title="Reporter"
        description="Build a report over any data — chart it, save it, download it."
      />
      <ToolWelcome
        icon="FileChartColumn"
        intro={[
          "Ask a question of any data in the toolbox — indents, orders, bills, budgets, sales, stock. Pick the columns, filter, group and total, then chart it, download it, or save it by name.",
          "A saved report keeps the question, not the numbers: whoever opens it sees live figures through their own access. The starting points are ready-made questions to copy from.",
        ]}
        stats={[
          { label: "Saved reports", value: counts.saved, hint: "shared by the whole team" },
          { label: "Starting points", value: STARTERS.length, hint: "ready-made questions" },
          { label: "Data sets", value: Object.keys(DATASETS).length, hint: "to report over" },
        ]}
        links={[
          { label: "New report", href: "/reporter/new", primary: true },
          { label: "Starting points & saved reports", href: "/reporter/saved" },
        ]}
      />
    </div>
  );
}

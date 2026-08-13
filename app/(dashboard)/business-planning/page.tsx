import { PageTitle } from "@/components/ui/page-title";
import { listPlans } from "@/lib/business-planning/queries";

import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen (founder, 2026-08-13: every Operations and
// Management tool opens on one). Counts only — the money stays on the
// plans list and inside each plan.
export default async function BusinessPlanningPage() {
  const plans = await listPlans();
  const lineCount = plans.reduce((sum, plan) => sum + plan.lineCount, 0);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Business Planning"
        description="Model a project before you build it. Figures here are visible only to this team."
      />
      <ToolWelcome
        icon="Target"
        intro={[
          "Model a project before you build it. A plan is a set of lines — plotted development, row houses, apartments, senior living — each with its own land, costs and sale velocity. Type the assumptions and read profit and funding as you go.",
          "Plans sit side by side here instead of drifting apart in cloned spreadsheets, and a finished plan can publish its headline numbers as targets for the rest of the company to be measured against.",
        ]}
        stats={[
          { label: "Plans", value: plans.length, hint: "side by side, newest touch first" },
          { label: "Product lines modelled", value: lineCount, hint: "across every plan" },
        ]}
        links={[{ label: "Your plans", href: "/business-planning/plans", primary: true }]}
      />
    </div>
  );
}

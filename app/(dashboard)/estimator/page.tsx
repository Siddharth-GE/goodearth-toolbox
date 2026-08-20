import { getWelcomeCounts } from "@/lib/estimator/queries";

import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen (founder, 2026-08-13: every Operations tool opens
// on one). No PageTitle here — the layout renders the title and nav.
// Counts only, never rupees: everything one click in is money, so the
// welcome is the one screen in this tool that shows none.
export default async function EstimatorPage() {
  const counts = await getWelcomeCounts();

  return (
    <ToolWelcome
      icon="Calculator"
      intro={[
        "Set up once, in this order: add your materials and their rates, build the mixes (M20 concrete — so many bags of cement, so much sand and jelly per cum), then give each work its unit, labour rate and recipe on the Works tab.",
        "After that, estimating a villa is picking works and typing quantities. The tool prices it at today's rates, groups it the way a BOQ reads, and lists every material needed. Change a rate and every draft follows.",
        "When a villa's estimate is ready, Submit it: it gets a number, freezes at that day's rates, and becomes the villa's official estimate — the one material requests and site issues will be checked against.",
      ]}
      stats={[
        { label: "Estimates", value: counts.estimates, hint: "villas costed" },
        { label: "Official", value: counts.official, hint: "submitted, one per villa" },
        { label: "Works set up", value: counts.worksSetUp, hint: "have a unit and a recipe" },
        { label: "Materials", value: counts.materials, hint: "in the price list" },
      ]}
      links={[
        { label: "1 · Materials", href: "/estimator/materials" },
        { label: "2 · Mixes", href: "/estimator/mixes" },
        { label: "3 · Works", href: "/estimator/works" },
        { label: "4 · Estimates", href: "/estimator/estimates", primary: true },
      ]}
    />
  );
}

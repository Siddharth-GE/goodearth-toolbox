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
        "What a villa costs to build. Each work in the Masters list is set up once — what it is measured in, what labour costs, and what it consumes: materials directly, or a named mix like M20 concrete that several works share.",
        "An estimate is a villa and a list of works with quantities. From that the tool works out every material needed and what the whole thing costs. Estimates use today's rates, so changing a rate updates every estimate that uses it.",
      ]}
      stats={[
        { label: "Estimates", value: counts.estimates, hint: "villas costed" },
        { label: "Works set up", value: counts.worksSetUp, hint: "have a unit and a recipe" },
        { label: "Materials", value: counts.materials, hint: "in the price list" },
      ]}
      links={[
        { label: "Estimates", href: "/estimator/estimates", primary: true },
        { label: "Works", href: "/estimator/works" },
        { label: "Mixes", href: "/estimator/mixes" },
        { label: "Materials", href: "/estimator/materials" },
      ]}
    />
  );
}

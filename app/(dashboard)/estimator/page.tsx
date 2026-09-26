import { countVillasOverEstimate, getWelcomeCounts } from "@/lib/estimator/estimate-queries";

import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen (founder, 2026-08-13: every Operations tool opens
// on one). No PageTitle here — the layout renders the title and nav.
// Counts only, never rupees: everything one click in is money, so the
// welcome is the one screen in this tool that shows none.
export default async function EstimatorPage() {
  const [counts, overEstimate] = await Promise.all([getWelcomeCounts(), countVillasOverEstimate()]);

  return (
    <ToolWelcome
      icon="Calculator"
      intro={[
        "An estimate is a villa's list of works and how much of each. Every rate on it can be tapped to see how it is built — the labour, what one unit of the work uses, and what each material costs — and changed for that villa alone: a dearer tile, a different labour rate.",
        "What every villa starts from is the rate book: each work's unit, labour rate and materials, priced at Masters' prices. Price the works an estimate actually uses first — the rate book lists them — and the rest can wait until something needs them.",
        "When a villa's estimate is ready, Submit it: it gets a number, freezes at that day's prices, and becomes the villa's official estimate — the one material requests and site issues are checked against.",
      ]}
      stats={[
        { label: "Estimates", value: counts.estimates, hint: "for villas, drafts included" },
        { label: "Official", value: counts.official, hint: "submitted, one per villa" },
        { label: "Works set up", value: counts.worksSetUp, hint: "have a unit to be priced in" },
        { label: "Materials", value: counts.materials, hint: "items in Masters, priced there" },
        {
          label: "Over estimate",
          value: overEstimate,
          hint: "villas drawing past their official estimate — see Site check",
        },
      ]}
      links={[
        { label: "Estimates", href: "/estimator/estimates", primary: true },
        { label: "Rate book", href: "/estimator/works" },
        { label: "Mixes", href: "/estimator/mixes" },
        { label: "Site check", href: "/estimator/site-check" },
      ]}
    />
  );
}

import { getSiteCounts } from "@/lib/supervisors/look-ahead-queries";

import { ToolWelcome } from "../_components/tool-welcome";

// Counts only, never rupees: stages, and deliveries waiting for the site.
export default async function SupervisorsPage() {
  const counts = await getSiteCounts();

  return (
    <ToolWelcome
      icon="HardHat"
      intro={[
        "Villas is the board: every villa with how it is doing, what is being worked now and what comes next. Open yours to log the day's labour against a stage, ask the store for its material, and mark it waiting or done.",
        "Each villa's dates work themselves out from the Sequence — the order stages run in and how long each takes — and the day the villa starts. A stage running long pushes everything after it.",
        "Look ahead shows what starts in the next three weeks across your villas, whether its material is ready, and which contractors are booked on two villas at once.",
        "Before an inspection, start the stage's checklist and answer it one check at a time on site; sign it off and it becomes the record.",
      ]}
      stats={[
        { label: "Stages being worked", value: counts.working, hint: "across every villa" },
        {
          label: "Starting this week",
          value: counts.startingThisWeek,
          hint: "line up crew and material",
        },
        { label: "Waiting", value: counts.waiting, hint: "on material, labour or a decision" },
        { label: "Deliveries to confirm", value: counts.toConfirm, hint: "arrived at site?" },
      ]}
      links={[
        { label: "Villas", href: "/supervisors/villas", primary: true },
        { label: "Look ahead", href: "/supervisors/plan" },
        { label: "Checklists", href: "/supervisors/checklists" },
        { label: "Sequence", href: "/supervisors/sequence" },
      ]}
    />
  );
}

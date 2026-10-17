import { getBoardWelcomeCounts } from "@/lib/design-management/board-queries";

import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen (founder, 2026-08-13: every Management/Operations
// tool opens on one). Counts only, never rupees — this tool has no money
// anywhere in it.
//
// The Board is the main door since the thirteenth piece (root plan.md): each
// villa passed from stage to stage, "like crm". Drawings are reached
// through a villa, as before.
export default async function DesignManagementPage() {
  const counts = await getBoardWelcomeCounts();

  return (
    <ToolWelcome
      icon="DraftingCompass"
      intro={[
        "Every villa's design, stage by stage: Design, Permit, Working Drawings, Structural, Interiors. Pass a villa on to the next stage and the people who take it; send a stage back for revision when it needs one — the villa stays where it has got to.",
        "Actions are the team's to-do list: a step, an owner and a date, overdue first. A villa's drawings and transmittals are on its page.",
      ]}
      stats={[
        { label: "Villas in design", value: counts.inDesign, hint: "started, not complete" },
        { label: "Revising now", value: counts.revising, hint: "a stage sent back" },
        { label: "With the client", value: counts.withClient, hint: "waiting on their word" },
        { label: "Actions overdue", value: counts.overdueActions, hint: "or with no date" },
      ]}
      links={[
        { label: "Board", href: "/design-management/villas", primary: true },
        { label: "Actions", href: "/design-management/actions" },
        { label: "Design stages", href: "/design-management/stages" },
      ]}
    />
  );
}

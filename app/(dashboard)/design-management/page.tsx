import { getWelcomeCounts } from "@/lib/design-management/queries";

import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen (founder, 2026-08-13: every Management/Operations
// tool opens on one). Counts only, never rupees — this tool has no
// money anywhere in it, not even a fact view to gate.
//
// Two doors, not four (founder, 2026-08-22 evening: "the flow is super
// cluttered right now"). Everything about drawings is reached through a
// villa; design stages are the one list that is genuinely company-wide.
export default async function DesignManagementPage() {
  const counts = await getWelcomeCounts();

  return (
    <ToolWelcome
      icon="DraftingCompass"
      intro={[
        "This is where a villa's drawings live: what has been sent to site, what revision each drawing set is on, and what is still being put together.",
        "Everything happens on a villa. Open one to see its transmittals, then start a new transmittal to upload drawings, revise a set and issue it to site.",
        "A transmittal is the formal record of what was issued, at which design stage, and when. Relay still tracks who is holding each task; this tool holds the drawings themselves.",
      ]}
      stats={[
        {
          label: "Villas with issued drawings",
          value: counts.villasWithReleasedDrawings,
          hint: "at least one drawing released",
        },
        { label: "Transmittals issued", value: counts.transmittalsIssued, hint: "all time" },
        {
          label: "Drafts open",
          value: counts.draftTransmittals,
          hint: "started, not yet issued",
        },
      ]}
      links={[
        { label: "Villas", href: "/design-management/villas", primary: true },
        { label: "Design stages", href: "/design-management/stages" },
      ]}
    />
  );
}

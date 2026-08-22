import { getWelcomeCounts } from "@/lib/design-management/queries";

import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen (founder, 2026-08-13: every Management/Operations
// tool opens on one). Counts only, never rupees — this tool has no
// money anywhere in it, not even a fact view to gate.
export default async function DesignManagementPage() {
  const counts = await getWelcomeCounts();

  return (
    <ToolWelcome
      icon="DraftingCompass"
      intro={[
        "This is where a villa's drawings live: what sheets exist, what revision each is on, and what has formally gone to site.",
        'A drawing set — say "Working Drawings — Ground Floor" — links to the works it covers. Each villa keeps its own revision history per set: R0, R1 and so on, each with a note and its files.',
        "A transmittal is the formal record of what was issued, at which design stage, and when. Relay still tracks who is holding each task; this tool holds the drawings themselves.",
      ]}
      stats={[
        { label: "Active drawing sets", value: counts.activeSets, hint: "in the master list" },
        {
          label: "Villas with released drawings",
          value: counts.villasWithReleasedDrawings,
          hint: "at least one revision issued",
        },
        { label: "Draft revisions", value: counts.draftRevisions, hint: "not yet sent to site" },
        { label: "Transmittals issued", value: counts.transmittalsIssued, hint: "all time" },
      ]}
      links={[
        { label: "Villas", href: "/design-management/villas", primary: true },
        { label: "Transmittals", href: "/design-management/transmittals" },
        { label: "Drawing sets", href: "/design-management/sets" },
        { label: "Design stages", href: "/design-management/stages" },
      ]}
    />
  );
}

import { getWelcomeCounts } from "@/lib/supervisors/queries";

import { ToolWelcome } from "../_components/tool-welcome";

// Counts only, never rupees: labour is heads, materials are quantities.
export default async function SupervisorsPage() {
  const counts = await getWelcomeCounts();

  return (
    <ToolWelcome
      icon="HardHat"
      intro={[
        "Pick your villa and log the day's labour — how many masons, helpers and others each contractor had on which work. One entry per contractor, work and day; edit it if the count changes.",
        "The same villa page shows what material every work has drawn from the stores, next to what the official estimate allows, and flags anything that arrived outside the plan.",
        "Need material at site? Send a request naming the work, the item and the quantity — it lands in the store-keeper's queue, and you'll see here whether it was issued or declined.",
        "Before an inspection, start a checklist on the villa page and answer each check Pass, Fail or N/A on site; sign it off and it becomes the record.",
        "Each villa's dates work themselves out from the Sequence — the order stages run in and how long each takes — and the day the villa starts. A stage running long pushes everything after it.",
      ]}
      stats={[
        { label: "Villas", value: counts.villas, hint: "pick yours from the list" },
        { label: "Workers this week", value: counts.workersThisWeek, hint: "across all logs" },
        { label: "Open requests", value: counts.openRequests, hint: "waiting at the store" },
        { label: "Contractors", value: counts.contractors, hint: "active in Masters" },
      ]}
      links={[
        { label: "Villas", href: "/supervisors/villas", primary: true },
        { label: "Checklists", href: "/supervisors/checklists" },
        { label: "Sequence", href: "/supervisors/sequence" },
      ]}
    />
  );
}

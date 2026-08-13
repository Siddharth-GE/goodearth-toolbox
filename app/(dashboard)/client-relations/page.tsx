import { getWelcomeCounts } from "@/lib/client-relations/queries";

import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen (founder, 2026-08-13: every Operations and
// Management tool opens on one). No PageTitle here — the layout renders
// the title and nav for every screen in this tool. Counts only: dues and
// receipts stay behind the doors below.
export default async function ClientRelationsPage() {
  const counts = await getWelcomeCounts();

  return (
    <ToolWelcome
      icon="Handshake"
      intro={[
        "Every client and plot in one place, from the first site visit to the last payment. A prospect becomes a client the day a plot is assigned; from there the tool follows the paperwork, the payment milestones and every receipt against them.",
        "Clients is the people view, Plots is the same story told by villa, and Collections is what is due — invoiced or coming up — across everyone.",
      ]}
      stats={[
        { label: "Clients", value: counts.clients, hint: "holding a plot" },
        { label: "Prospects", value: counts.prospects, hint: "in conversation" },
        { label: "Plots engaged", value: counts.engaged, hint: "assigned to a client" },
      ]}
      links={[
        { label: "Clients", href: "/client-relations/clients", primary: true },
        { label: "Plots", href: "/client-relations/plots" },
        { label: "Collections", href: "/client-relations/dues" },
      ]}
    />
  );
}

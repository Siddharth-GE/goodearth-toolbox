import { getActionCounts } from "@/lib/client-relations/next-steps-queries";
import { getWelcomeCounts } from "@/lib/client-relations/queries";

import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen (founder, 2026-08-13: every Operations and
// Management tool opens on one). No PageTitle here — the layout renders
// the title and nav for every screen in this tool. Counts only: dues and
// receipts stay behind the doors below. Actions is the main door since
// the Saarang tracker came in (root plan.md, seventh piece).
export default async function ClientRelationsPage() {
  const [counts, actions] = await Promise.all([getWelcomeCounts(), getActionCounts()]);

  return (
    <ToolWelcome
      icon="Handshake"
      intro={[
        "Every client and plot in one place, from the first site visit to the handover. Every promise to a client is an action with an owner and a date, so nothing waits on someone's memory.",
        "Actions is what to do next, overdue first. Plots shows each villa's paperwork, build and interiors at a glance; Clients is the people; Collections is the money due.",
      ]}
      stats={[
        { label: "Overdue", value: actions.overdue, hint: "actions past their date" },
        { label: "This week", value: actions.week, hint: "due in the next 7 days" },
        {
          label: "Waiting on management",
          value: actions.management,
          hint: "only a manager can clear",
        },
        { label: "Clients", value: counts.clients, hint: "holding a plot" },
      ]}
      links={[
        { label: "Actions", href: "/client-relations/actions", primary: true },
        { label: "Plots", href: "/client-relations/plots" },
        { label: "Clients", href: "/client-relations/clients" },
        { label: "Collections", href: "/client-relations/dues" },
      ]}
    />
  );
}

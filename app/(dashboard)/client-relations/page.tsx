import { getActionCounts } from "@/lib/client-relations/next-steps-queries";
import { getWelcomeCounts } from "@/lib/client-relations/queries";

import { ToolWelcome } from "../_components/tool-welcome";

// Welcome screen. No PageTitle: the layout renders title and nav. Counts only; dues and receipts stay behind the doors.
export default async function ClientRelationsPage() {
  const [counts, actions] = await Promise.all([getWelcomeCounts(), getActionCounts()]);

  return (
    <ToolWelcome
      icon="Handshake"
      intro={[
        "Every client and plot in one place, from the first site visit to the handover. Every promise to a client is an action with an owner and a date, so nothing waits on someone's memory.",
        "Actions is what to do next, overdue first. Plots shows each villa's paperwork, build and interiors at a glance, with its payment schedule; Clients is the people.",
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
      ]}
    />
  );
}

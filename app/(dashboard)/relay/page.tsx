import { PageTitle } from "@/components/ui/page-title";
import { requireUser } from "@/lib/auth/dal";
import { getRelayPulse } from "@/lib/relay/queries";

import { ToolWelcome } from "../_components/tool-welcome";

/**
 * The welcome screen (founder, 2026-08-13: every Operations and
 * Management tool opens on one). Supersedes the 2026-08-10 decision to
 * open straight on Projects — Projects is now the primary door below.
 */
export default async function RelayPage() {
  const user = await requireUser();
  const pulse = await getRelayPulse(user.id);

  return (
    <div className="space-y-4">
      <PageTitle title="Relay" description="Who is holding each task, and for how long." />
      <ToolWelcome
        icon="Route"
        intro={[
          "Every handover that matters — drawing approvals, selections, fire NOCs, site handovers — runs as a trail, passed person to person like a baton until it is finished. Relay keeps the baton visible: where it is, whose hands it is in, and how long it has sat there.",
          "The work itself stays where it happens. What lives here is accountability, so a trail that has gone cold gets spotted before it costs a week.",
        ]}
        stats={[
          { label: "In flight", value: pulse.live, hint: "trails with a baton in hand" },
          { label: "Gone cold", value: pulse.cold, hint: "sitting longer than expected" },
          { label: "In your court", value: pulse.mine, hint: "waiting on you right now" },
          { label: "With a client", value: pulse.withClient, hint: "waiting on someone outside" },
        ]}
        links={[
          { label: "Projects", href: "/relay/projects", primary: true },
          { label: "Your court", href: "/relay/court" },
          { label: "All trails", href: "/relay/trails" },
        ]}
      />
    </div>
  );
}

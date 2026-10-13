import { getWelcomeCounts } from "@/lib/birdwing/queries";
import { requireUser } from "@/lib/auth/dal";

import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen (every Operations and Management tool opens on
// one). Counts only — no rupee leaves the screens one click in.
export default async function BirdwingPage() {
  const [counts, user] = await Promise.all([getWelcomeCounts(), requireUser()]);
  const isAdmin = user.profile?.role === "admin";

  return (
    <ToolWelcome
      icon="Bed"
      intro={[
        "Every stay at Birdwing — who it is for, which rooms, what was charged, and how it was paid or closed. A room can't be booked twice: the database refuses it, so the calendar is the truth.",
        "A paying guest is invoiced and pays. A Goodearth client, prospect or team stay is closed by charging it to a cost centre, so nothing sits as money owed that nobody will pay.",
      ]}
      stats={[
        {
          label: "Arriving today",
          value: counts.arrivingToday,
          hint: `${counts.leavingToday} leaving`,
        },
        { label: "In the house", value: counts.inHouse, hint: "checked in" },
        {
          label: "To invoice",
          value: counts.toInvoice,
          hint: "paying guests checked out",
        },
        {
          label: "To review",
          value: counts.toReview,
          hint: `${counts.enquiries} open enquiries`,
        },
      ]}
      links={[
        { label: "New stay", href: "/birdwing/stays/new", primary: true },
        { label: "Calendar", href: "/birdwing/calendar" },
        { label: "All stays", href: "/birdwing/stays" },
        { label: "Review", href: "/birdwing/review" },
        ...(isAdmin ? [{ label: "Settings", href: "/birdwing/settings" }] : []),
      ]}
    />
  );
}

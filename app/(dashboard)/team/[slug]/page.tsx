import { requireUser } from "@/lib/auth/dal";
import { arrangeTools } from "@/lib/nav/arrange";
import { getToolArrangement } from "@/lib/nav/queries";
import { visibleTools } from "@/lib/tools";
import { notFound } from "next/navigation";

import { TeamTools } from "../../_components/team-tools";

// Only tools this person can open; grants still decide on each tool's own pages.
export default async function TeamPage({ params }: { params: Promise<{ slug: string }> }) {
  const [{ slug }, user, arrangement] = await Promise.all([
    params,
    requireUser(),
    getToolArrangement(),
  ]);
  const team = arrangeTools(visibleTools(user.profile, user.grantedApps), arrangement).find(
    (section) => section.slug === slug,
  );
  if (!team) notFound();

  return <TeamTools team={team} />;
}

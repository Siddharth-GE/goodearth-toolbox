import { Spinner } from "@/components/ui/spinner";
import { requireUser } from "@/lib/auth/dal";
import { formatLongDate } from "@/lib/format";
import { arrangeTools } from "@/lib/nav/arrange";
import { getToolArrangement } from "@/lib/nav/queries";
import { visibleTools } from "@/lib/tools";
import { Suspense } from "react";
import { OperationsPipeline } from "./_components/operations-pipeline";
import { PeopleOverview } from "./_components/people-overview";
import { ToolGrid } from "./_components/tool-grid";

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardHome() {
  const [user, arrangement] = await Promise.all([requireUser(), getToolArrangement()]);
  const firstName = user.profile?.full_name?.split(" ")[0];
  const today = formatLongDate(new Date());
  // Same rule and same teams as the sidebar, so a card and a nav row
  // never disagree about whether someone can open a tool, or where it is.
  const sections = arrangeTools(visibleTools(user.profile, user.grantedApps), arrangement);

  return (
    <div>
      <div className="mt-4 mb-6">
        <h1 className="text-foreground font-display text-4xl font-medium text-balance md:text-6xl">
          {greeting()}
          {firstName ? `, ${firstName}.` : "."}
        </h1>
        <p className="text-muted mt-2 text-sm">{today}</p>
      </div>

      <div className="space-y-8">
        <ToolGrid sections={sections} />
        {/* Fetches its own counts, so it gets its own boundary rather than holding up the page. */}
        <Suspense
          fallback={
            <div className="bg-surface flex h-[168px] items-center justify-center rounded-2xl">
              <Spinner />
            </div>
          }
        >
          <OperationsPipeline />
        </Suspense>

        <Suspense
          fallback={
            <div className="bg-surface flex h-[158px] items-center justify-center rounded-2xl">
              <Spinner />
            </div>
          }
        >
          <PeopleOverview />
        </Suspense>
      </div>
    </div>
  );
}

import { Spinner } from "@/components/ui/spinner";
import { requireUser } from "@/lib/auth/dal";
import { formatLongDate } from "@/lib/format";
import { visibleTools } from "@/lib/tools";
import { Suspense } from "react";
import { MarathonLiveCard } from "./_components/marathon-live-card";
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
  const user = await requireUser();
  const firstName = user.profile?.full_name?.split(" ")[0];
  const today = formatLongDate(new Date());
  // Same rule the sidebar uses, so a card and a nav row never disagree
  // about whether someone can open a tool.
  const tools = visibleTools(user.profile, user.grantedApps);

  return (
    <div>
      <div className="mt-4 mb-6">
        <h1 className="text-foreground text-4xl font-semibold tracking-tight text-balance md:text-5xl">
          {greeting()}
          {firstName ? `, ${firstName}.` : "."}
        </h1>
        <p className="text-muted mt-2 text-sm">{today}</p>
      </div>

      <div className="space-y-8">
        <ToolGrid tools={tools} />
        {/* Fetches its own counts now that Indents is real, so it gets
            its own boundary rather than holding up the whole page. */}
        <Suspense
          fallback={
            <div className="bg-surface flex h-[168px] items-center justify-center rounded-2xl">
              <Spinner />
            </div>
          }
        >
          <OperationsPipeline />
        </Suspense>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Suspense
            fallback={
              <div className="bg-surface flex h-[158px] items-center justify-center rounded-2xl">
                <Spinner />
              </div>
            }
          >
            <PeopleOverview />
          </Suspense>
          <Suspense
            fallback={
              <div className="bg-surface flex h-[164px] items-center justify-center rounded-2xl">
                <Spinner />
              </div>
            }
          >
            <MarathonLiveCard />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

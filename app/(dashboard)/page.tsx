import { Spinner } from "@/components/ui/spinner";
import { requireUser } from "@/lib/auth/dal";
import { formatLongDate } from "@/lib/format";
import { Suspense } from "react";
import { ActivityFeed } from "./_components/activity-feed";
import { BudgetVsActual } from "./_components/budget-vs-actual";
import { KpiRow } from "./_components/kpi-row";
import { MarathonLiveCard } from "./_components/marathon-live-card";
import { OperationsPipeline } from "./_components/operations-pipeline";
import { PendingApprovals } from "./_components/pending-approvals";
import { PeopleOverview } from "./_components/people-overview";
import { RecentPurchaseOrders } from "./_components/recent-purchase-orders";

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

  return (
    <div>
      <div className="text-muted mb-1 text-xs">
        Toolbox <span className="text-border mx-1">/</span>{" "}
        <span className="text-foreground">Overview</span>
      </div>

      <div className="mt-4 mb-6">
        <h1 className="text-foreground text-4xl font-extrabold tracking-tight md:text-5xl">
          {greeting()}
          {firstName ? `, ${firstName}.` : "."}
        </h1>
        <p className="text-muted mt-1 text-sm">{today}</p>
      </div>

      <div className="space-y-5">
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
        <KpiRow />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.55fr_1fr]">
          <div className="space-y-5">
            <BudgetVsActual />
            <RecentPurchaseOrders />
          </div>
          <div className="space-y-5">
            <PendingApprovals />
            <Suspense
              fallback={
                <div className="bg-surface flex h-[164px] items-center justify-center rounded-2xl">
                  <Spinner />
                </div>
              }
            >
              <MarathonLiveCard />
            </Suspense>
            <PeopleOverview />
            <ActivityFeed />
          </div>
        </div>
      </div>
    </div>
  );
}

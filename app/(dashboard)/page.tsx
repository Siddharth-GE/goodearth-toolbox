import { Spinner } from "@/components/ui/spinner";
import { requireUser } from "@/lib/auth/dal";
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
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <div className="mb-1 text-xs text-muted">
        Toolbox <span className="mx-1 text-border">/</span> <span className="text-foreground">Overview</span>
      </div>

      <div className="mb-6 mt-4">
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground md:text-5xl">
          {greeting()}{firstName ? `, ${firstName}.` : "."}
        </h1>
        <p className="mt-1 text-sm text-muted">{today}</p>
      </div>

      <div className="space-y-5">
        <OperationsPipeline />
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
                <div className="flex h-[164px] items-center justify-center rounded-2xl bg-surface">
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

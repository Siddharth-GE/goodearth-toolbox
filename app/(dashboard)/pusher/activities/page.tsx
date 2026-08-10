import { PageTitle } from "@/components/ui/page-title";
import { listActivities } from "@/lib/pusher/queries";

import { PusherNav } from "../_components/pusher-nav";
import { ActivityList } from "./_components/activity-list";

export default async function ActivitiesPage() {
  const activities = await listActivities(true);

  return (
    <div className="space-y-5">
      <PageTitle
        title="Activities"
        description="The kinds of work a trail can be. Add to this list whenever a new kind of work appears."
      />
      <PusherNav active="activities" />
      <ActivityList activities={activities} />
    </div>
  );
}

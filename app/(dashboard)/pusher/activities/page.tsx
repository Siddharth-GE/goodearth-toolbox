import { PageTitle } from "@/components/ui/page-title";
import {
  createActivity,
  createDepartment,
  setActivityActive,
  setDepartmentActive,
} from "@/lib/pusher/actions";
import { listActivities, listDepartments } from "@/lib/pusher/queries";

import { PusherNav } from "../_components/pusher-nav";
import { SimpleMaster } from "./_components/simple-master";

export default async function ActivitiesPage() {
  const [activities, departments] = await Promise.all([
    listActivities(true),
    listDepartments(true),
  ]);

  return (
    <div className="space-y-5">
      <PageTitle
        title="Activities & departments"
        description="The kinds of work a trail can be, and the parts of the company it belongs to."
      />
      <PusherNav active="activities" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SimpleMaster
          title="Activities"
          hint="What a trail is. Its legs fill in from the last time anyone ran it."
          addLabel="Add an activity"
          placeholder="e.g. Drawing approval"
          rows={activities}
          createAction={createActivity}
          setActiveAction={setActivityActive}
        />
        <SimpleMaster
          title="Departments"
          hint="Who a trail belongs to. A trail can be in more than one at once."
          addLabel="Add a department"
          placeholder="e.g. Design"
          rows={departments}
          createAction={createDepartment}
          setActiveAction={setDepartmentActive}
        />
      </div>
    </div>
  );
}

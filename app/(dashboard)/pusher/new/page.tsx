import { PageTitle } from "@/components/ui/page-title";
import { getTrailFormOptions } from "@/lib/pusher/queries";

import { PusherNav } from "../_components/pusher-nav";
import { OpenTrailForm } from "./_components/open-trail-form";

export default async function OpenTrailPage() {
  const options = await getTrailFormOptions();

  return (
    <div className="space-y-5">
      <PageTitle
        backHref="/pusher/court"
        backLabel="Your court"
        title="Open a trail"
        description="A task, and the people it has to travel through."
      />
      <PusherNav active="trails" />
      <OpenTrailForm
        projects={options.projects}
        units={options.units}
        activities={options.activities}
        departments={options.departments}
        people={options.people}
        prefills={options.prefills}
      />
    </div>
  );
}

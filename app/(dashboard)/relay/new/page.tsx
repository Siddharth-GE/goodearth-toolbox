import { PageTitle } from "@/components/ui/page-title";
import { getTrailFormOptions, listTrailSets } from "@/lib/relay/queries";

import { RelayNav } from "../_components/relay-nav";
import { OpenTrailForm } from "./_components/open-trail-form";

export default async function OpenTrailPage({
  searchParams,
}: {
  // Set when this is reached from a house, so both pickers arrive answered.
  searchParams: Promise<{ project?: string; unit?: string }>;
}) {
  const [options, params, trailSets] = await Promise.all([
    getTrailFormOptions(),
    searchParams,
    listTrailSets(),
  ]);

  return (
    <div className="space-y-5">
      <PageTitle
        backHref="/relay/court"
        backLabel="Your court"
        title="Open a trail"
        description="A task, and the people it has to travel through."
      />
      <RelayNav active="trails" />
      <OpenTrailForm
        projects={options.projects}
        units={options.units}
        activities={options.activities}
        departments={options.departments}
        people={options.people}
        trailSets={trailSets}
        activityDefaults={options.activityDefaults}
        initialProjectId={params.project}
        initialUnitId={params.unit}
      />
    </div>
  );
}

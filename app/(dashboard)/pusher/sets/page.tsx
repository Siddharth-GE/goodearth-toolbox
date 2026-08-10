import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { createTrailSet } from "@/lib/pusher/actions";
import { listActivities, listTrailSets } from "@/lib/pusher/queries";
import { Layers } from "lucide-react";

import { PusherNav } from "../_components/pusher-nav";
import { NewSetForm } from "./_components/new-set-form";
import { SetEditor } from "./_components/set-editor";

/**
 * The named standard sets — the answer to "every villa runs roughly the
 * same handoffs, why am I opening them one at a time".
 *
 * A set is a list of ACTIVITIES, never a frozen copy of people and days.
 * Legs are prefilled from each activity's last run at the moment the set
 * is applied, so a set built today does not carry a leaver's name onto
 * every new house forever.
 */
export default async function TrailSetsPage() {
  const [sets, activities] = await Promise.all([listTrailSets(true), listActivities()]);

  return (
    <div className="space-y-5">
      <PageTitle
        title="Standard sets"
        description="The trails a house normally runs, ready to lay down in one click."
      />
      <PusherNav active="sets" />

      <Card className="p-5">
        <NewSetForm action={createTrailSet} />
      </Card>

      {sets.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No standard sets yet"
          description="Build one from the activities you already have — the drawing approvals, the NOCs, the handover — and every new house can start from it."
        />
      ) : (
        <div className="space-y-4">
          {sets.map((set) => (
            <SetEditor key={set.id} set={set} activities={activities} />
          ))}
        </div>
      )}
    </div>
  );
}

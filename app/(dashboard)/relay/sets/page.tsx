import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { createTrailSet } from "@/lib/relay/actions";
import { listActivities, listTrailSets } from "@/lib/relay/queries";
import { Layers } from "lucide-react";

import { RelayNav, RelaySetupNav } from "../_components/relay-nav";
import { NewSetForm } from "./_components/new-set-form";
import { SetEditor } from "./_components/set-editor";

/** Named standard sets. A set holds ACTIVITIES, never frozen people and days: legs prefill at apply time, so a leaver's name doesn't ride onto every new house. */
export default async function TrailSetsPage() {
  const [sets, activities] = await Promise.all([listTrailSets(true), listActivities()]);

  return (
    <div className="space-y-5">
      <PageTitle
        title="Trail types"
        description="A named trail with its activities fixed — ready to lay down on a house in one click."
      />
      <RelayNav active="sets" />
      <RelaySetupNav active="sets" />

      <Card className="p-5">
        <NewSetForm action={createTrailSet} />
      </Card>

      {sets.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No trail types yet"
          description="Build one from the activities you already have — the drawing approvals, the NOCs, the handover — in the order they happen. Every new house can then start from it."
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

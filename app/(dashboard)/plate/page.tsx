import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { PlateCountSync } from "@/components/layout/plate-count-sync";
import { getMyPlate, plateCount } from "@/lib/overview/plate";
import { CircleCheck } from "lucide-react";
import { PlateLines } from "../_components/plate-lines";

/** Everything waiting on the signed-in person: what is theirs first, then the queues of the tools they hold. */
export default async function PlatePage() {
  const plate = await getMyPlate();
  const empty = plate.mine.length === 0 && plate.queues.length === 0;

  return (
    <div className="space-y-4">
      <PlateCountSync count={plateCount(plate)} />
      <PageTitle
        title="My plate"
        description="What is waiting on you: the stages, actions and batons that are yours, then what waits in the tools you use. Tap a line to deal with it."
      />

      {plate.failed.length > 0 && (
        <p className="text-warning text-sm" role="status">
          {`Couldn't read ${plate.failed.join(", ")} just now — refresh to try again.`}
        </p>
      )}

      {empty ? (
        <EmptyState
          icon={CircleCheck}
          title="Nothing on your plate"
          description="Nothing you own is late or due, and nothing waits on you in your tools."
        />
      ) : (
        <>
          {plate.mine.length > 0 && (
            <Card className="space-y-3 p-5">
              <h2 className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
                Yours
              </h2>
              <PlateLines lines={plate.mine} />
            </Card>
          )}
          {plate.queues.length > 0 && (
            <Card className="space-y-3 p-5">
              <h2 className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
                Waiting in your tools
              </h2>
              <PlateLines lines={plate.queues} />
            </Card>
          )}
        </>
      )}
    </div>
  );
}

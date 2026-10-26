import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getMyPlate } from "@/lib/overview/plate";
import { PlateLines } from "./plate-lines";

const LINES_SHOWN = 5;

/** The top of the person's plate on the home page: what is theirs and late first. It reads every tool, so the page streams
 * it in its own Suspense boundary and a failure says so here only. */
export async function PlateCard() {
  let plate;
  try {
    plate = await getMyPlate();
  } catch {
    return (
      <Card className="p-5">
        <h2 className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">My plate</h2>
        <p className="text-muted mt-3 text-sm">
          Couldn&apos;t load your plate just now. Refresh to try again.
        </p>
      </Card>
    );
  }
  const lines = [...plate.mine, ...plate.queues].sort(
    (a, b) => Number(b.urgent) - Number(a.urgent),
  );

  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">My plate</h2>
        <LinkButton href="/plate" variant="ghost" size="sm">
          Open
        </LinkButton>
      </div>
      {lines.length === 0 ? (
        <p className="text-muted text-sm">Nothing waiting on you.</p>
      ) : (
        <>
          <PlateLines lines={lines.slice(0, LINES_SHOWN)} withItems={false} />
          {lines.length > LINES_SHOWN && (
            <p className="text-muted text-xs">{`${lines.length - LINES_SHOWN} more on your plate`}</p>
          )}
        </>
      )}
    </Card>
  );
}

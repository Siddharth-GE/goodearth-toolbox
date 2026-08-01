import { getMarathonHome } from "@/lib/marathon/queries";
import { Footprints } from "lucide-react";
import Link from "next/link";

// Real data — reuses the exact same query Marathon's own home page
// calls (lib/marathon/queries.ts), not a second implementation.
export async function MarathonLiveCard() {
  const { eventName, totalEntries, groupCount, runCounts } = await getMarathonHome();

  return (
    <Link
      href="/marathon"
      className="bg-accent text-accent-foreground block overflow-hidden rounded-2xl shadow-sm transition-opacity hover:opacity-95"
    >
      <div className="border-accent-foreground/15 flex items-center gap-2 border-b px-5 pt-4 pb-3">
        <Footprints className="size-4" />
        <h2 className="text-sm font-semibold">{eventName} — live</h2>
        <span className="text-accent-foreground/80 ml-auto flex items-center gap-1.5 font-mono text-xs">
          <span className="bg-accent-foreground size-1.5 animate-pulse rounded-full" />
          registering
        </span>
      </div>
      <div className="p-5">
        <p className="font-mono text-4xl font-semibold tracking-tight">{totalEntries}</p>
        <p className="text-accent-foreground/80 mt-1 text-xs">total registrations</p>
        <div className="mt-4 flex gap-2">
          {runCounts.map((run) => (
            <div key={run.runId} className="bg-accent-foreground/10 flex-1 rounded-xl px-3 py-2">
              <p className="font-mono text-base">{run.count}</p>
              <p className="text-accent-foreground/80 mt-0.5 text-[11px]">{run.name}</p>
            </div>
          ))}
          <div className="bg-accent-foreground/10 flex-1 rounded-xl px-3 py-2">
            <p className="font-mono text-base">{groupCount}</p>
            <p className="text-accent-foreground/80 mt-0.5 text-[11px]">schools / clubs</p>
          </div>
        </div>
      </div>
    </Link>
  );
}

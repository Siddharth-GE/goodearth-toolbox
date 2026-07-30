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
      className="block overflow-hidden rounded-2xl bg-accent text-accent-foreground shadow-sm transition-opacity hover:opacity-95"
    >
      <div className="flex items-center gap-2 px-5 pt-4 pb-3 border-b border-accent-foreground/15">
        <Footprints className="size-4" />
        <h2 className="text-sm font-semibold">{eventName} — live</h2>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-xs text-accent-foreground/80">
          <span className="size-1.5 animate-pulse rounded-full bg-accent-foreground" />
          registering
        </span>
      </div>
      <div className="p-5">
        <p className="font-mono text-4xl font-semibold tracking-tight">{totalEntries}</p>
        <p className="mt-1 text-xs text-accent-foreground/80">total registrations</p>
        <div className="mt-4 flex gap-2">
          {runCounts.map((run) => (
            <div key={run.runId} className="flex-1 rounded-xl bg-accent-foreground/10 px-3 py-2">
              <p className="font-mono text-base">{run.count}</p>
              <p className="mt-0.5 text-[11px] text-accent-foreground/80">{run.name}</p>
            </div>
          ))}
          <div className="flex-1 rounded-xl bg-accent-foreground/10 px-3 py-2">
            <p className="font-mono text-base">{groupCount}</p>
            <p className="mt-0.5 text-[11px] text-accent-foreground/80">schools / clubs</p>
          </div>
        </div>
      </div>
    </Link>
  );
}

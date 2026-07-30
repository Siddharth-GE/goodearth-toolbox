import { Avatar } from "@/components/ui/avatar";
import { getMarathonHome } from "@/lib/marathon/queries";
import Link from "next/link";
import { HeroCounter } from "./_components/hero-counter";
import { copy } from "./_lib/copy";

export default async function MarathonHome() {
  const { eventName, totalEntries, groupCount, runCounts, agents } = await getMarathonHome();

  return (
    <div className="pb-12">
      <div className="px-6 pt-12 pb-6 text-center">
        <span className="text-xs font-semibold uppercase tracking-widest text-muted">
          {eventName}
        </span>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">
          {copy.runnerRegistration.en}
        </h1>
        <p className="mt-0.5 text-sm text-muted">{copy.runnerRegistration.ml}</p>

        <div className="mt-6">
          <HeroCounter total={totalEntries} label="runners registered so far" />
        </div>

        <div className="mt-4 flex justify-center gap-6">
          {runCounts.map((run) => (
            <div key={run.runId} className="text-center">
              <div className="text-base font-bold text-foreground">{run.count}</div>
              <div className="text-xs font-medium text-muted">{run.name}</div>
            </div>
          ))}
          <div className="text-center">
            <div className="text-base font-bold text-foreground">{groupCount}</div>
            <div className="text-xs font-medium text-muted">Schools &amp; clubs</div>
          </div>
        </div>
      </div>

      <div className="px-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
          Members — tap your name
        </h2>
        <div className="space-y-2.5">
          {agents.map((agent) => (
            <Link
              key={agent.id}
              href={`/marathon/pin?agent=${agent.id}`}
              className="flex items-center gap-3.5 rounded-2xl border border-border bg-surface px-4 py-3.5 shadow-sm transition-transform active:scale-[0.98]"
            >
              <Avatar name={agent.name} />
              <span className="font-semibold text-foreground">{agent.name}</span>
              <span className="ml-auto text-muted">&rsaquo;</span>
            </Link>
          ))}
          {agents.length === 0 && (
            <p className="text-sm text-muted">No members yet. Ask an admin to add one.</p>
          )}
        </div>
      </div>
    </div>
  );
}

import { LinkButton } from "@/components/ui/button";
import { getMarathonHome } from "@/lib/marathon/queries";
import { ShieldCheck } from "lucide-react";
import { HeroCounter } from "./_components/hero-counter";
import { MemberList } from "./_components/member-list";
import { copy } from "./_lib/copy";

// This page reads no cookies/searchParams, so Next.js would otherwise
// treat it as static and prerender it once at build/deploy time —
// meaning a new agent or updated counts wouldn't show up on the kiosk
// until the next deploy. Force it to hit the database on every visit.
export const dynamic = "force-dynamic";

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
        <MemberList agents={agents} />

        <div className="mt-8 flex justify-center">
          <LinkButton href="/marathon/admin" variant="secondary" size="md">
            <ShieldCheck className="size-4" />
            Admin
          </LinkButton>
        </div>
      </div>
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { Pagination } from "@/components/ui/pagination";
import { listActivities, listDepartments, listPeople, listTrails } from "@/lib/relay/queries";
import { Route } from "lucide-react";
import Link from "next/link";

import { RelayNav } from "../_components/relay-nav";
import { TimerDial } from "../_components/timer-dial";
import { TrailFilters } from "../_components/trail-filters";

export default async function AllTrailsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    cold?: string;
    project?: string;
    person?: string;
    activity?: string;
    department?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;
  const status =
    params.status === "finished" || params.status === "all" ? params.status : "running";

  const [result, people, activities, departments] = await Promise.all([
    listTrails({
      page: Number(params.page) || 1,
      stuckOnly: params.cold === "1",
      projectId: params.project,
      holderId: params.person,
      activityId: params.activity,
      departmentId: params.department,
      status,
    }),
    listPeople(),
    listActivities(),
    listDepartments(),
  ]);

  const query = new URLSearchParams(
    Object.entries(params).filter(([k, v]) => v && k !== "page") as [string, string][],
  );
  const pageHref = (page: number) => {
    const next = new URLSearchParams(query);
    next.set("page", String(page));
    return `/relay/trails?${next}`;
  };

  return (
    <div className="space-y-5">
      <PageTitle
        title="All trails"
        description="Everyone sees every trail — that is how a cold one gets spotted."
        actions={<LinkButton href="/relay/new">Open a trail</LinkButton>}
      />
      <RelayNav active="trails" />

      <TrailFilters people={people} activities={activities} departments={departments} />

      {result.rows.length === 0 ? (
        <EmptyState
          icon={Route}
          title="No trails match"
          description="Loosen a filter, or open the first one."
          action={<LinkButton href="/relay/new">Open a trail</LinkButton>}
        />
      ) : (
        <>
          <p className="text-muted text-xs">
            Showing {result.rows.length} of {result.total}
          </p>
          <Card className="divide-border divide-y">
            {result.rows.map((row) => (
              <Link
                key={row.chainId}
                href={`/relay/trails/${row.chainId}`}
                className="flex items-center gap-3 p-4 transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.04]"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-sm font-semibold">
                    {row.activityName}
                    {row.title ? (
                      <span className="text-muted font-normal"> · {row.title}</span>
                    ) : null}
                  </p>
                  <p className="text-muted mt-0.5 text-xs">
                    {row.projectName}
                    {row.unitName ? ` · ${row.unitName}` : ""}
                    {row.isFinished ? (
                      " · finished"
                    ) : (
                      <>
                        {" · with "}
                        <b className="text-foreground font-medium">{row.holderName ?? "nobody"}</b>
                        {row.currentLeg ? ` · leg ${row.currentLeg} of ${row.legCount}` : ""}
                      </>
                    )}
                  </p>
                  {row.departments.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {row.departments.map((d) => (
                        <Badge key={d} variant="info">
                          {d}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                {row.isFinished ? (
                  <Badge variant="success">Done</Badge>
                ) : (
                  <TimerDial days={row.daysInLeg} expectedDays={row.expectedDays} />
                )}
              </Link>
            ))}
          </Card>
          <Pagination
            page={result.page}
            pageCount={result.pageCount}
            total={result.total}
            unit="trails"
            prevHref={result.page > 1 ? pageHref(result.page - 1) : undefined}
            nextHref={result.page < result.pageCount ? pageHref(result.page + 1) : undefined}
          />
        </>
      )}
    </div>
  );
}

import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { Pagination } from "@/components/ui/pagination";
import { listActivities, listDepartments, listPeople, listTrails } from "@/lib/relay/queries";
import { Route } from "lucide-react";

import { RelayNav } from "../_components/relay-nav";
import { TrailCard } from "../_components/trail-card";
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {result.rows.map((row) => (
              <TrailCard key={row.chainId} row={row} showProject />
            ))}
          </div>
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

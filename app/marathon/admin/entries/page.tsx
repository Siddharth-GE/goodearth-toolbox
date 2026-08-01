import { CategoryBadge } from "@/app/marathon/_components/category-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getAdminAgents, getAdminEntries, getEntryFormData } from "@/lib/marathon/queries";
import { requireAdminSession } from "@/lib/marathon/session";
import { Inbox } from "lucide-react";
import { AdminEntryFilters } from "../_components/admin-entry-filters";
import { AdminNav } from "../_components/admin-nav";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export default async function MarathonAdminEntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; group?: string; category?: string; agent?: string }>;
}) {
  await requireAdminSession();
  const { run: runFilter, group: groupFilter, category: categoryFilter, agent: agentFilter } =
    await searchParams;
  const hasFilter = Boolean(runFilter || groupFilter || categoryFilter || agentFilter);

  const [{ groups, runs, categories: allCategories }, agents] = await Promise.all([
    getEntryFormData(),
    getAdminAgents(),
  ]);

  // Drop a category filter that no longer belongs to the selected race
  // (e.g. left over from before the race filter changed).
  const categories = runFilter ? allCategories.filter((c) => c.run_id === runFilter) : allCategories;
  const effectiveCategoryFilter = categories.some((c) => c.id === categoryFilter) ? categoryFilter : undefined;

  const { entries, matchingCount, grandTotal, truncated } = await getAdminEntries({
    runId: runFilter,
    groupId: groupFilter,
    categoryId: effectiveCategoryFilter,
    agentId: agentFilter,
  });

  return (
    <div>
      <AdminNav active="entries" />

      <div className="px-5 pt-5 pb-16">
        <p className="mb-1 text-sm text-muted">{hasFilter ? "Matching" : "Total"} entries</p>
        {/* The real count, not how many rows fitted on this page — the
            list is capped, and a headline that quietly stops climbing on
            race day would be worse than no headline at all. */}
        <p className="mb-1 text-3xl font-extrabold tracking-tight text-foreground">
          {matchingCount}
          {hasFilter && <span className="text-base font-medium text-muted"> of {grandTotal}</span>}
        </p>
        {truncated && (
          <p className="mb-5 text-xs text-muted">
            Showing the {entries.length} most recent. Filter to narrow this down.
          </p>
        )}
        {!truncated && <div className="mb-5" />}

        <AdminEntryFilters
          groups={groups}
          runs={runs}
          categories={allCategories}
          agents={agents}
          initialGroup={groupFilter}
          initialRun={runFilter}
          initialCategory={effectiveCategoryFilter}
          initialAgent={agentFilter}
          hasFilter={hasFilter}
        />

        {entries.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title={hasFilter ? "No entries match this filter" : "No entries yet"}
          />
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.bib}
                className="flex items-center justify-between rounded-2xl border border-border bg-surface p-3.5"
              >
                <div className="flex items-center gap-3">
                  <span className="w-16 shrink-0 font-mono text-sm font-bold text-foreground">{entry.bib}</span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{entry.name}</p>
                    <p className="text-xs text-muted">
                      {entry.marathon_runs?.name}
                      {entry.marathon_groups?.name ? ` · ${entry.marathon_groups.name}` : ""}
                      {entry.marathon_agents?.name ? ` · by ${entry.marathon_agents.name}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {entry.marathon_categories && (
                    <CategoryBadge name={entry.marathon_categories.name} color={entry.marathon_categories.color} />
                  )}
                  <span className="text-xs text-muted">{formatTime(entry.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

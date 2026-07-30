import { CategoryBadge } from "@/app/marathon/_components/category-badge";
import { getAdminAgents, getAdminEntries, getEntryFormData } from "@/lib/marathon/queries";
import { requireAdminSession } from "@/lib/marathon/session";
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

  const { entries, grandTotal } = await getAdminEntries({
    runId: runFilter,
    groupId: groupFilter,
    categoryId: effectiveCategoryFilter,
    agentId: agentFilter,
  });

  return (
    <div className="px-5 pt-8 pb-16">
      <AdminNav active="entries" />

      <p className="mb-1 text-sm text-muted">{hasFilter ? "Matching" : "Total"} entries</p>
      <p className="mb-5 text-3xl font-extrabold tracking-tight text-foreground">
        {entries.length}
        {hasFilter && <span className="text-base font-medium text-muted"> of {grandTotal}</span>}
      </p>

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
        <p className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
          No entries {hasFilter ? "match this filter" : "yet"}.
        </p>
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
  );
}

import { CategoryBadge } from "@/app/marathon/_components/category-badge";
import { ListFilters } from "@/app/marathon/_components/list-filters";
import { copy } from "@/app/marathon/_lib/copy";
import { LinkButton } from "@/components/ui/button";
import { agentLogout } from "@/lib/marathon/actions";
import { getAgentEntries, getEntryFormData } from "@/lib/marathon/queries";
import { requireAgentSession } from "@/lib/marathon/session";
import { createAdminClient } from "@/lib/supabase/admin";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export default async function MarathonListPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string; group?: string; category?: string }>;
}) {
  const session = await requireAgentSession();
  const { run: runFilter, group: groupFilter, category: categoryFilter } = await searchParams;
  const hasFilter = Boolean(runFilter || groupFilter || categoryFilter);

  const supabase = createAdminClient();
  const [{ data: agent }, { groups, runs, categories: allCategories }] = await Promise.all([
    supabase.from("marathon_agents").select("name").eq("id", session.agentId).single(),
    getEntryFormData(),
  ]);

  // Only offer categories that belong to the selected race — every
  // category under the Fun Run is "Open", so once a race is picked the
  // rest would just be noise (and couldn't match anything anyway).
  const categories = runFilter ? allCategories.filter((c) => c.run_id === runFilter) : allCategories;
  const categoryFilterValid = categories.some((c) => c.id === categoryFilter);
  const effectiveCategoryFilter = categoryFilterValid ? categoryFilter : undefined;

  const { entries, totalCount } = await getAgentEntries(session.agentId, {
    runId: runFilter,
    groupId: groupFilter,
    categoryId: effectiveCategoryFilter,
  });

  return (
    <div className="px-5 pt-8 pb-16">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">{copy.myEntries.en}</h1>
          <p className="text-xs text-muted">{copy.myEntries.ml}</p>
        </div>
        <form action={agentLogout}>
          <button type="submit" className="text-sm font-medium text-accent">
            Exit
          </button>
        </form>
      </div>

      <p className="mb-1 text-sm text-muted">Signed in as {agent?.name}</p>
      <p className="mb-5 text-3xl font-extrabold tracking-tight text-foreground">
        {totalCount} <span className="text-base font-medium text-muted">registered by you</span>
      </p>

      <ListFilters
        groups={groups}
        runs={runs}
        categories={allCategories}
        initialGroup={groupFilter}
        initialRun={runFilter}
        initialCategory={effectiveCategoryFilter}
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

      <LinkButton href="/marathon/entry" size="lg" className="mt-6 w-full">
        + New Entry
      </LinkButton>
    </div>
  );
}

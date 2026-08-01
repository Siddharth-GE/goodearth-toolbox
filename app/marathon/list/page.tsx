import { CategoryBadge } from "@/app/marathon/_components/category-badge";
import { ExitButton } from "@/app/marathon/_components/exit-button";
import { ListFilters } from "@/app/marathon/_components/list-filters";
import { copy } from "@/app/marathon/_lib/copy";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { agentLogout } from "@/lib/marathon/actions";
import { getAgentEntries, getEntryFormData } from "@/lib/marathon/queries";
import { requireAgentSession } from "@/lib/marathon/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { Inbox } from "lucide-react";
import { formatTime } from "@/lib/format";

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
  const categories = runFilter
    ? allCategories.filter((c) => c.run_id === runFilter)
    : allCategories;
  const categoryFilterValid = categories.some((c) => c.id === categoryFilter);
  const effectiveCategoryFilter = categoryFilterValid ? categoryFilter : undefined;

  const { entries, totalCount } = await getAgentEntries(session.agentId, {
    runId: runFilter,
    groupId: groupFilter,
    categoryId: effectiveCategoryFilter,
  });

  return (
    <div>
      <PageHeader
        title={copy.myEntries.en}
        subtitle={copy.myEntries.ml}
        actions={<ExitButton action={agentLogout} />}
      />

      <div className="px-5 pt-5 pb-16">
        <p className="text-muted mb-1 text-sm">Signed in as {agent?.name}</p>
        <p className="text-foreground mb-5 text-3xl font-extrabold tracking-tight">
          {totalCount} <span className="text-muted text-base font-medium">registered by you</span>
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
          <EmptyState
            icon={Inbox}
            title={hasFilter ? "No entries match this filter" : "No entries yet"}
            description={hasFilter ? undefined : "Runners you register will show up here."}
          />
        ) : (
          <ul className="space-y-2">
            {entries.map((entry) => (
              <li
                key={entry.bib}
                className="border-border bg-surface flex items-center justify-between rounded-2xl border p-3.5"
              >
                <div className="flex items-center gap-3">
                  <span className="text-foreground w-16 shrink-0 font-mono text-sm font-bold">
                    {entry.bib}
                  </span>
                  <div>
                    <p className="text-foreground text-sm font-medium">{entry.name}</p>
                    <p className="text-muted text-xs">
                      {entry.marathon_runs?.name}
                      {entry.marathon_groups?.name ? ` · ${entry.marathon_groups.name}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {entry.marathon_categories && (
                    <CategoryBadge
                      name={entry.marathon_categories.name}
                      color={entry.marathon_categories.color}
                    />
                  )}
                  <span className="text-muted text-xs">{formatTime(entry.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <LinkButton href="/marathon/entry" size="lg" className="mt-6 w-full">
          + New Entry
        </LinkButton>
      </div>
    </div>
  );
}

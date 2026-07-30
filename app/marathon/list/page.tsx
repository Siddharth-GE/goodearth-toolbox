import { CategoryBadge } from "@/app/marathon/_components/category-badge";
import { copy } from "@/app/marathon/_lib/copy";
import { LinkButton } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { agentLogout } from "@/lib/marathon/actions";
import { getAgentEntries, getEntryFormData } from "@/lib/marathon/queries";
import { requireAgentSession } from "@/lib/marathon/session";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

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
  const [{ data: agent }, { groups, runs, categories }, { entries, totalCount }] = await Promise.all([
    supabase.from("marathon_agents").select("name").eq("id", session.agentId).single(),
    getEntryFormData(),
    getAgentEntries(session.agentId, { runId: runFilter, groupId: groupFilter, categoryId: categoryFilter }),
  ]);

  const runsById = new Map(runs.map((r) => [r.id, r.name]));

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

      <form method="GET" className="mb-4 space-y-2 rounded-2xl border border-border bg-surface p-3.5">
        <Select name="group" defaultValue={groupFilter ?? ""}>
          <option value="">All groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </Select>
        <Select name="run" defaultValue={runFilter ?? ""}>
          <option value="">All races</option>
          {runs.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
        <Select name="category" defaultValue={categoryFilter ?? ""}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} — {runsById.get(c.run_id)}
            </option>
          ))}
        </Select>
        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="h-10 flex-1 rounded-xl bg-accent text-sm font-medium text-accent-foreground"
          >
            Filter
          </button>
          {hasFilter && (
            <Link
              href="/marathon/list"
              className="flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium text-foreground"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

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

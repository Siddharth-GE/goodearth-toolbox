import { CategoryBadge } from "@/app/marathon/_components/category-badge";
import { copy } from "@/app/marathon/_lib/copy";
import { LinkButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { agentLogout } from "@/lib/marathon/actions";
import { getAgentEntries } from "@/lib/marathon/queries";
import { requireAgentSession } from "@/lib/marathon/session";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

export default async function MarathonListPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const session = await requireAgentSession();
  const { run: runFilter } = await searchParams;

  const supabase = createAdminClient();
  const [{ data: agent }, { data: runs }, { entries, totalCount }] = await Promise.all([
    supabase.from("marathon_agents").select("name").eq("id", session.agentId).single(),
    supabase.from("marathon_runs").select("id, name").order("sort_order"),
    getAgentEntries(session.agentId, runFilter),
  ]);

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

      <div className="mb-4 flex gap-2 overflow-x-auto">
        <Link
          href="/marathon/list"
          className={cn(
            "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium",
            !runFilter ? "border-accent bg-accent text-accent-foreground" : "border-border text-foreground",
          )}
        >
          All
        </Link>
        {(runs ?? []).map((r) => (
          <Link
            key={r.id}
            href={`/marathon/list?run=${r.id}`}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium",
              runFilter === r.id
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border text-foreground",
            )}
          >
            {r.name}
          </Link>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
          No entries yet.
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
                  <p className="text-xs text-muted">{entry.marathon_runs?.name}</p>
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

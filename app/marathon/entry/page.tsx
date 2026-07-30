import { CategoryBadge } from "@/app/marathon/_components/category-badge";
import { EntryForm } from "@/app/marathon/_components/entry-form";
import { copy } from "@/app/marathon/_lib/copy";
import { agentLogout } from "@/lib/marathon/actions";
import { getEntryFormData } from "@/lib/marathon/queries";
import { requireAgentSession } from "@/lib/marathon/session";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function MarathonEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const session = await requireAgentSession();
  const { saved } = await searchParams;

  const supabase = createAdminClient();
  const [{ data: agent }, { groups, runs, categories }] = await Promise.all([
    supabase.from("marathon_agents").select("name").eq("id", session.agentId).single(),
    getEntryFormData(),
  ]);

  const savedCategory = saved ? categories.find((c) => saved.startsWith(c.bib_prefix)) : undefined;

  return (
    <div className="px-5 pt-8 pb-16">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground">{copy.newRunner.en}</h1>
          <p className="text-xs text-muted">{copy.newRunner.ml}</p>
        </div>
        <form action={agentLogout}>
          <button type="submit" className="text-sm font-medium text-accent">
            Exit
          </button>
        </form>
      </div>

      <p className="mb-5 text-sm text-muted">Signed in as {agent?.name}</p>

      {saved && (
        <div className="mb-5 rounded-2xl border border-border bg-surface p-4 text-center">
          <p className="text-sm text-muted">Saved</p>
          <p className="mt-1 text-2xl font-extrabold tracking-tight text-foreground">{saved}</p>
          {savedCategory && (
            <div className="mt-2 flex justify-center">
              <CategoryBadge name={savedCategory.name} color={savedCategory.color} />
            </div>
          )}
        </div>
      )}

      <EntryForm groups={groups} runs={runs} categories={categories} />
    </div>
  );
}

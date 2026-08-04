import { BibCard } from "@/app/marathon/_components/bib-card";
import { EntryForm } from "@/app/marathon/_components/entry-form";
import { ExitButton } from "@/app/marathon/_components/exit-button";
import { copy } from "@/app/marathon/_lib/copy";
import { PageHeader } from "@/components/ui/page-header";
import { agentLogout } from "@/lib/marathon/actions";
import { getEntryFormData, getSavedEntry } from "@/lib/marathon/queries";
import { requireAgentSession } from "@/lib/marathon/session";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";

export default async function MarathonEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  const session = await requireAgentSession();
  const { saved } = await searchParams;

  const supabase = createAdminClient();
  const [{ data: agent }, { groups, runs, categories }, savedEntry] = await Promise.all([
    supabase.from("marathon_agents").select("name").eq("id", session.agentId).single(),
    getEntryFormData(),
    saved ? getSavedEntry(saved, session.agentId) : Promise.resolve(null),
  ]);

  return (
    <div>
      <PageHeader
        title={copy.newRunner.en}
        subtitle={copy.newRunner.ml}
        actions={<ExitButton action={agentLogout} />}
      />

      <div className="px-5 pt-5 pb-16">
        <div className="mb-5 flex items-center justify-between">
          <p className="text-muted text-sm">Signed in as {agent?.name}</p>
          <Link href="/marathon/list" className="text-accent text-sm font-medium">
            My Entries
          </Link>
        </div>

        {savedEntry && (
          <BibCard
            bib={savedEntry.bib}
            runnerName={savedEntry.name}
            categoryName={savedEntry.marathon_categories?.name ?? ""}
            runName={savedEntry.marathon_runs?.name ?? ""}
            teeSize={savedEntry.tee_size}
            color={savedEntry.marathon_categories?.color ?? ""}
          />
        )}

        <EntryForm groups={groups} runs={runs} categories={categories} />
      </div>
    </div>
  );
}

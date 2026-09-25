import "server-only";

import { GRANT } from "@/lib/dexter/shared";
import { requireTool } from "@/lib/auth/access";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { readFailed } from "@/lib/supabase/read-failed";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads for Dexter.
 *
 * Every function opens with `requireTool(GRANT)`. Dexter reads nothing
 * outside itself but `profiles`, for the uploader's name (STATUS.md
 * contract row) — `dexter_decks` carries two FKs to `profiles`
 * (uploaded_by, updated_by, plus created_by), so names are merged
 * through a `Map` rather than an embed (BUGCATCHER #2), the
 * lib/design-management/queries.ts pattern.
 */

const fail = (context: string, error: { message: string }): never =>
  readFailed("dexter", context, error);

// ---------------------------------------------------------------------
// Welcome
// ---------------------------------------------------------------------

export async function getWelcomeCounts(): Promise<{
  projects: number;
  decks: number;
  sharedDecks: number;
}> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [projects, decks, sharedDecks] = await Promise.all([
    supabase.from("dexter_projects").select("id", { count: "exact", head: true }),
    supabase.from("dexter_decks").select("id", { count: "exact", head: true }),
    supabase
      .from("dexter_decks")
      .select("id", { count: "exact", head: true })
      .eq("share_enabled", true),
  ]);
  if (projects.error) fail("the welcome counts", projects.error);
  if (decks.error) fail("the welcome counts", decks.error);
  if (sharedDecks.error) fail("the welcome counts", sharedDecks.error);

  return {
    projects: projects.count ?? 0,
    decks: decks.count ?? 0,
    sharedDecks: sharedDecks.count ?? 0,
  };
}

// ---------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------

export type DexterProjectRow = {
  id: string;
  name: string;
  clientName: string | null;
  deckCount: number;
  updatedAt: string;
};

/** Every project, ordered by name, with how many decks each holds. */
export async function listProjects(): Promise<DexterProjectRow[]> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const [projects, decks] = await Promise.all([
    fetchAll<{
      id: string;
      name: string;
      client_name: string | null;
      updated_at: string;
    }>((from, to) =>
      supabase
        .from("dexter_projects")
        .select("id, name, client_name, updated_at")
        .order("name")
        .order("id")
        .range(from, to),
    ),
    fetchAll<{ project_id: string }>((from, to) =>
      supabase.from("dexter_decks").select("project_id").order("id").range(from, to),
    ),
  ]);

  const deckCounts = new Map<string, number>();
  for (const deck of decks) {
    deckCounts.set(deck.project_id, (deckCounts.get(deck.project_id) ?? 0) + 1);
  }

  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    clientName: project.client_name,
    deckCount: deckCounts.get(project.id) ?? 0,
    updatedAt: project.updated_at,
  }));
}

export type DexterDeckRow = {
  id: string;
  title: string;
  entryPath: string;
  shareToken: string;
  shareEnabled: boolean;
  fileCount: number;
  totalBytes: number;
  uploadedByName: string | null;
  createdAt: string;
};

export type DexterProjectDetail = {
  project: { id: string; name: string; clientName: string | null };
  decks: DexterDeckRow[];
};

/** One project and every deck in it, newest first. `null` when the id doesn't exist. */
export async function getProject(projectId: string): Promise<DexterProjectDetail | null> {
  await requireTool(GRANT);
  const supabase = await createClient();

  const { data: project, error: projectError } = await supabase
    .from("dexter_projects")
    .select("id, name, client_name")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) fail("the project", projectError);
  if (!project) return null;

  const decks = await fetchAll<{
    id: string;
    title: string;
    entry_path: string;
    share_token: string;
    share_enabled: boolean;
    file_count: number;
    total_bytes: number;
    uploaded_by: string | null;
    created_at: string;
  }>((from, to) =>
    supabase
      .from("dexter_decks")
      .select(
        "id, title, entry_path, share_token, share_enabled, file_count, total_bytes, uploaded_by, created_at",
      )
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, to),
  );

  const uploaderIds = [
    ...new Set(decks.map((deck) => deck.uploaded_by).filter((id): id is string => id !== null)),
  ];
  const uploaders =
    uploaderIds.length > 0
      ? await fetchAll<{ id: string; full_name: string | null }>((from, to) =>
          supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", uploaderIds)
            .order("id")
            .range(from, to),
        )
      : [];
  const uploaderNames = new Map(uploaders.map((uploader) => [uploader.id, uploader.full_name]));

  return {
    project: { id: project.id, name: project.name, clientName: project.client_name },
    decks: decks.map((deck) => ({
      id: deck.id,
      title: deck.title,
      entryPath: deck.entry_path,
      shareToken: deck.share_token,
      shareEnabled: deck.share_enabled,
      fileCount: deck.file_count,
      totalBytes: deck.total_bytes,
      uploadedByName: deck.uploaded_by ? (uploaderNames.get(deck.uploaded_by) ?? null) : null,
      createdAt: deck.created_at,
    })),
  };
}

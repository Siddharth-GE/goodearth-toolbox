import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { formatCount, formatDate } from "@/lib/format";
import { listProjects } from "@/lib/dexter/queries";
import { FolderOpen } from "lucide-react";
import Link from "next/link";

import { NewProjectDialog } from "./_components/project-forms";

export default async function DexterProjectsPage() {
  const projects = await listProjects();

  return (
    <div className="space-y-4">
      <PageTitle
        title="Projects"
        backHref="/dexter"
        backLabel="Dexter"
        actions={<NewProjectDialog />}
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="No projects yet"
          description="Make one for a client, then upload a deck into it."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/dexter/projects/${project.id}`}>
              <Card interactive className="h-full space-y-1 p-5">
                <p className="text-foreground truncate text-sm font-semibold">{project.name}</p>
                <p className="text-muted truncate text-sm">
                  {project.clientName ?? "No client set"}
                </p>
                <p className="text-muted mt-3 text-xs">
                  {formatCount(project.deckCount)} {project.deckCount === 1 ? "deck" : "decks"} ·
                  Updated {formatDate(project.updatedAt)}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

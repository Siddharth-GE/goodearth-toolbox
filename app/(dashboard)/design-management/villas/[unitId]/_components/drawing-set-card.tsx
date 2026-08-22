"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { createDraftRevision } from "@/lib/design-management/actions";
import type { DrawingSetWithRevisions } from "@/lib/design-management/queries";
import { formatDate } from "@/lib/format";
import type { WorksTreeCategory } from "@/lib/masters/works";
import { FileText } from "lucide-react";
import { useState, useTransition } from "react";

import { DraftRevisionEditor } from "./draft-revision-editor";

const statusVariant = { draft: "warning", released: "success", superseded: "neutral" } as const;
const statusLabel = { draft: "Draft", released: "Released", superseded: "Superseded" } as const;

/**
 * One drawing set's revision history on this villa, newest first. The one
 * draft (if any) gets the full editor; released/superseded rows are
 * read-only history — the guard triggers in 0091 refuse edits to those
 * anyway, so the screen simply never offers one.
 */
export function DrawingSetCard({
  unitId,
  set,
  tree,
}: {
  unitId: string;
  set: DrawingSetWithRevisions;
  tree: WorksTreeCategory[];
}) {
  const hasDraft = set.revisions.some((revision) => revision.status === "draft");

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-foreground text-sm font-semibold">
          {set.setCode ? `${set.setCode} — ${set.setName}` : set.setName}
        </p>
        {!hasDraft && <StartRevisionButton unitId={unitId} setId={set.setId} />}
      </div>

      <div className="space-y-2">
        {set.revisions.map((revision) =>
          revision.status === "draft" ? (
            <DraftRevisionEditor key={revision.id} revision={revision} tree={tree} />
          ) : (
            <div key={revision.id} className="border-border rounded-xl border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-foreground font-medium">R{revision.revisionNo}</span>
                <Badge variant={statusVariant[revision.status]}>
                  {statusLabel[revision.status]}
                </Badge>
                {revision.releasedAt && (
                  <span className="text-muted text-xs">
                    Released {formatDate(revision.releasedAt)}
                  </span>
                )}
                <span className="text-muted text-xs">
                  {revision.files.length} file{revision.files.length === 1 ? "" : "s"}
                </span>
              </div>
              {revision.note && <p className="text-muted mt-1.5 text-xs">{revision.note}</p>}
              {revision.files.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {revision.files.map((file) => (
                    <a
                      key={file.id}
                      href={`/design-management/files/${file.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground border-border hover:border-accent hover:text-accent flex items-center gap-1 rounded-lg border px-2 py-1 text-xs"
                    >
                      <FileText className="size-3 shrink-0" />
                      {file.fileName}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ),
        )}
      </div>
    </Card>
  );
}

function StartRevisionButton({ unitId, setId }: { unitId: string; setId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex items-center gap-2">
      <FormMessage error={error} size="xs" />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(undefined);
          startTransition(async () => {
            const result = await createDraftRevision(unitId, setId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? "Starting…" : "Start next revision"}
      </Button>
    </div>
  );
}

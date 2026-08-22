import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { DrawingSetWithRevisions } from "@/lib/design-management/queries";
import { formatDate } from "@/lib/format";
import { FileText } from "lucide-react";

const statusVariant = { released: "success", superseded: "neutral" } as const;
const statusLabel = { released: "Released", superseded: "Superseded" } as const;

/**
 * One drawing set's ISSUED history on this villa, newest first — and
 * nothing else. No editor, no "start a revision" button, no draft.
 *
 * Founder, 2026-08-22, redirecting the flow on the staging vet: "in the
 * overview you just see what's been issued". Work in progress lives on
 * the transmittal that will send it, which is where every edit control
 * now is. This card is a record, so it is a server component with
 * nothing to press.
 */
export function DrawingSetCard({ set }: { set: DrawingSetWithRevisions }) {
  return (
    <Card className="space-y-3 p-4">
      <p className="text-foreground text-sm font-semibold">
        {set.setCode ? `${set.setCode} — ${set.setName}` : set.setName}
      </p>

      <div className="space-y-2">
        {set.revisions.map((revision) => (
          <div key={revision.id} className="border-border rounded-xl border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-foreground font-medium">R{revision.revisionNo}</span>
              {revision.status !== "draft" && (
                <Badge variant={statusVariant[revision.status]}>
                  {statusLabel[revision.status]}
                </Badge>
              )}
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
        ))}
      </div>
    </Card>
  );
}

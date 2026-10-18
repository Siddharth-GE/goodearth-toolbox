"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconButton } from "@/components/ui/icon-button";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { UploadButton } from "@/components/ui/upload-button";
import { deleteStayFile, uploadStayFile } from "@/lib/birdwing/files-actions";
import type { StayFile } from "@/lib/birdwing/queries";
import { FILE_KINDS, FILE_KIND_LABELS, type FileKind } from "@/lib/birdwing/shared";
import { formatDate } from "@/lib/format";
import { FileText, Trash2 } from "lucide-react";
import { useState } from "react";

/** Kept in a private bucket and opened only through /birdwing/files/<id>, after the grant is checked. */
export function DocumentsPanel({ stayId, files }: { stayId: string; files: StayFile[] }) {
  const [kind, setKind] = useState<FileKind>("id");

  return (
    <Section
      title="Documents"
      note="Photos are made smaller on the phone before they go up."
      collapsible
      defaultOpen={files.length > 0}
    >
      {files.length > 0 && (
        <ul className="divide-border mb-3 divide-y">
          {files.map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-3 py-2">
              <a
                href={`/birdwing/files/${file.id}`}
                target="_blank"
                rel="noopener"
                className="text-foreground hover:text-accent inline-flex min-w-0 items-center gap-2 text-sm"
              >
                <FileText className="text-muted size-4 shrink-0" aria-hidden />
                <span className="truncate">{file.fileName}</span>
                <span className="text-muted shrink-0 text-xs">
                  {FILE_KIND_LABELS[file.kind]} · {formatDate(file.createdAt)}
                </span>
              </a>
              <ConfirmDialog
                trigger={
                  <IconButton aria-label={`Remove ${file.fileName}`} tone="danger" size="sm">
                    <Trash2 className="size-4" />
                  </IconButton>
                }
                title="Remove this document?"
                description={`${file.fileName} is deleted for good.`}
                confirmLabel="Remove"
                pendingLabel="Removing…"
                onConfirm={() => deleteStayFile(file.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full space-y-1.5 sm:w-56">
          <Label htmlFor="doc-kind">What it is</Label>
          <Select
            id="doc-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as FileKind)}
          >
            {FILE_KINDS.map((value) => (
              <option key={value} value={value}>
                {FILE_KIND_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>
        <UploadButton
          action={uploadStayFile.bind(null, stayId)}
          fields={{ kind }}
          label="Upload a photo or PDF"
          size="md"
        />
      </div>
    </Section>
  );
}

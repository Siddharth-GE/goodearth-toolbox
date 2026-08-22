"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteDraftRevision,
  deleteDrawingRevisionFile,
  setDrawingRevisionWorks,
  updateDraftRevisionNote,
  uploadDrawingRevisionFile,
} from "@/lib/design-management/actions";
import type { DrawingRevisionRow } from "@/lib/design-management/queries";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import type { WorksTreeCategory } from "@/lib/masters/works";
import { FileText, Trash2, UploadCloud } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";

import { WorksCheckboxTree } from "../../../_components/works-checkbox-tree";

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * The draft's own workspace: note, files, and its work links — the only
 * revision status this tool ever offers an edit surface for. Once
 * released or superseded, the guard triggers in 0091 refuse every one of
 * these writes anyway; this component simply never renders for that row
 * (drawing-set-card.tsx branches on status before reaching here).
 */
export function DraftRevisionEditor({
  revision,
  tree,
}: {
  revision: DrawingRevisionRow;
  tree: WorksTreeCategory[];
}) {
  return (
    <div className="border-warning/30 bg-warning/5 space-y-3 rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-foreground text-sm font-medium">R{revision.revisionNo}</span>
          <Badge variant="warning">Draft</Badge>
        </div>
        <DeleteDraftButton revisionId={revision.id} />
      </div>

      <NoteField revisionId={revision.id} note={revision.note} />
      <FilesEditor revisionId={revision.id} files={revision.files} />
      <WorksEditor revisionId={revision.id} tree={tree} workItemIds={revision.workItemIds ?? []} />
    </div>
  );
}

function DeleteDraftButton({ revisionId }: { revisionId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex items-center gap-2">
      <FormMessage error={error} size="xs" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(undefined);
          startTransition(async () => {
            const result = await deleteDraftRevision(revisionId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? "Deleting…" : "Delete this draft"}
      </Button>
    </div>
  );
}

function NoteField({ revisionId, note }: { revisionId: string; note: string | null }) {
  const [value, setValue] = useState(note ?? "");
  const noteSave = useSaveOnBlur<string>({
    initial: note ?? "",
    save: (next) => updateDraftRevisionNote(revisionId, next),
  });

  return (
    <div className="space-y-1.5">
      <label className="text-muted text-xs font-semibold tracking-widest uppercase">Note</label>
      <Textarea
        rows={2}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => noteSave.flush(value)}
        placeholder="What changed in this revision…"
      />
      <FormMessage error={noteSave.error} size="xs" />
    </div>
  );
}

function FilesEditor({
  revisionId,
  files,
}: {
  revisionId: string;
  files: DrawingRevisionRow["files"];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, startUpload] = useTransition();
  const [uploadError, setUploadError] = useState<string>();
  const [removingId, setRemovingId] = useState<string>();
  const [removeError, setRemoveError] = useState<string>();
  const [removing, startRemove] = useTransition();

  const upload = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploadError(undefined);
    startUpload(async () => {
      // Sequential: Server Actions dispatch one at a time per client
      // anyway, and this keeps the order and any error predictable.
      for (const file of Array.from(fileList)) {
        if (file.size > MAX_UPLOAD_BYTES) {
          setUploadError(`"${file.name}" is over 4 MB — split a big set into several sheets.`);
          break;
        }
        const formData = new FormData();
        formData.set("file", file);
        const result = await uploadDrawingRevisionFile(revisionId, formData);
        if (result?.error) {
          setUploadError(result.error);
          break;
        }
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  const remove = (fileId: string) => {
    setRemoveError(undefined);
    setRemovingId(fileId);
    startRemove(async () => {
      const result = await deleteDrawingRevisionFile(fileId);
      if (result?.error) setRemoveError(result.error);
      setRemovingId(undefined);
    });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted text-xs font-semibold tracking-widest uppercase">Files</p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          multiple
          hidden
          onChange={(event) => upload(event.target.files)}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Spinner className="size-4 border-2" /> : <UploadCloud className="size-4" />}
          {uploading ? "Uploading…" : "Add file"}
        </Button>
      </div>
      <FormMessage error={uploadError} size="xs" />

      {files.length === 0 ? (
        <p className="text-muted text-xs">
          No files yet — a PDF or a photo of the sheet, up to 4 MB each.
        </p>
      ) : (
        <ul className="divide-border divide-y">
          {files.map((file) => (
            <li key={file.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <a
                href={`/design-management/files/${file.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-foreground flex min-w-0 items-center gap-1.5 truncate hover:underline"
              >
                <FileText className="text-muted size-3.5 shrink-0" />
                <span className="truncate">{file.fileName}</span>
              </a>
              <IconButton
                aria-label={`Remove ${file.fileName}`}
                tone="danger"
                disabled={removing && removingId === file.id}
                onClick={() => remove(file.id)}
              >
                <Trash2 className="size-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <FormMessage error={removeError} size="xs" />
    </div>
  );
}

function WorksEditor({
  revisionId,
  tree,
  workItemIds,
}: {
  revisionId: string;
  tree: WorksTreeCategory[];
  workItemIds: string[];
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(workItemIds));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [justSaved, setJustSaved] = useState(false);

  const dirty = useMemo(() => {
    const original = new Set(workItemIds);
    if (original.size !== checked.size) return true;
    for (const id of checked) if (!original.has(id)) return true;
    return false;
  }, [checked, workItemIds]);

  const toggle = (id: string) => {
    setJustSaved(false);
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // The category ticker: set the whole list one way, never toggle each —
  // toggling a mixed selection would invert it instead of completing it.
  const setMany = (ids: string[], check: boolean) => {
    setJustSaved(false);
    setChecked((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (check) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const save = () => {
    setError(undefined);
    startTransition(async () => {
      const result = await setDrawingRevisionWorks(revisionId, [...checked]);
      if (result?.error) setError(result.error);
      else setJustSaved(true);
    });
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-muted text-xs font-semibold tracking-widest uppercase">
          Works this revision serves
        </p>
        <Badge variant="neutral">{checked.size} picked</Badge>
      </div>

      <WorksCheckboxTree
        tree={tree}
        checked={checked}
        onToggle={toggle}
        onSetMany={setMany}
        disabled={pending}
      />

      <div className="flex items-center gap-3">
        <Button type="button" size="sm" disabled={!dirty || pending} onClick={save}>
          {pending ? "Saving…" : "Save work links"}
        </Button>
        {justSaved && !dirty && <FormMessage success="Saved." size="xs" />}
        <FormMessage error={error} size="xs" />
      </div>
    </div>
  );
}

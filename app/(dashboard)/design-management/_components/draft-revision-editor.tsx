"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  readDraftFolder,
  setDraftDrawingsLink,
  setDraftRevisionNumber,
  setDrawingRevisionWorks,
  updateDraftRevisionNote,
} from "@/lib/design-management/revision-actions";
import { deleteDrawingRevisionFile } from "@/lib/design-management/files-actions";
import type { DrawingRevisionRow } from "@/lib/design-management/queries";
import { parseWorkDriveLink } from "@/lib/design-management/workdrive-link";
import { formatShortDate } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import type { WorksTreeCategory } from "@/lib/masters/works";
import { ChevronDown, ChevronUp, ExternalLink, FileText, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { FolderSheetList } from "./folder-sheet-list";
import { WorksCheckboxTree } from "./works-checkbox-tree";

const LABEL = "text-muted text-[11px] font-medium tracking-[0.14em] uppercase";

/** The draft's workspace: number, what changed, drawings, works. Rendered only for a draft (guard triggers refuse later writes anyway). It sits inside a transmittal line, so discarding is the transmittal's Delete this draft. */
export function DraftRevisionEditor({
  revision,
  tree,
}: {
  revision: DrawingRevisionRow;
  tree: WorksTreeCategory[];
}) {
  return (
    // No warning tint: the Draft badge says what it is.
    <div className="border-border space-y-4 rounded-xl border p-3">
      <RevisionNumberField revisionId={revision.id} revisionNo={revision.revisionNo} />
      <NoteField revisionId={revision.id} revisionNo={revision.revisionNo} note={revision.note} />
      <DrawingsField
        revisionId={revision.id}
        drawingsUrl={revision.drawingsUrl}
        sheets={revision.folderSheets}
      />
      {revision.files.length > 0 && <UploadedSheets files={revision.files} />}
      <WorksEditor revisionId={revision.id} tree={tree} workItemIds={revision.workItemIds ?? []} />
    </div>
  );
}

/** The designer's revision number while draft (0124); the database refuses one at or below a number the set already used, and its sentence shows under the field. */
function RevisionNumberField({
  revisionId,
  revisionNo,
}: {
  revisionId: string;
  revisionNo: number;
}) {
  const [value, setValue] = useState(String(revisionNo));
  const save = useSaveOnBlur<string>({
    initial: String(revisionNo),
    validate: (next) =>
      /^\d{1,2}$/.test(next.trim()) ? undefined : "A revision is a whole number from 0 to 99.",
    save: (next) => setDraftRevisionNumber(revisionId, Number(next.trim())),
  });

  return (
    <div className="space-y-1.5">
      <label htmlFor={`revision-no-${revisionId}`} className={LABEL}>
        Revision
      </label>
      <div className="flex items-center gap-2">
        <span className="text-foreground text-sm font-semibold">R</span>
        <Input
          id={`revision-no-${revisionId}`}
          inputMode="numeric"
          autoComplete="off"
          maxLength={2}
          className="w-20 tabular-nums"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => save.flush(value)}
        />
      </div>
      <p className="text-muted text-xs">
        Already at R2 in Excel? Make this R3. It can only go above the numbers this set has used.
      </p>
      <FormMessage error={save.error} success={save.saved ? "Saved" : null} size="xs" />
    </div>
  );
}

function NoteField({
  revisionId,
  revisionNo,
  note,
}: {
  revisionId: string;
  revisionNo: number;
  note: string | null;
}) {
  const [value, setValue] = useState(note ?? "");
  const noteSave = useSaveOnBlur<string>({
    initial: note ?? "",
    save: (next) => updateDraftRevisionNote(revisionId, next),
  });

  return (
    <div className="space-y-1.5">
      <label htmlFor={`revision-note-${revisionId}`} className={LABEL}>
        {revisionNo === 0 ? "Note" : "What changed"}
      </label>
      <Textarea
        id={`revision-note-${revisionId}`}
        rows={2}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => noteSave.flush(value)}
        placeholder={
          // 0093: R0 is the first issue, so nothing to explain yet; from R1 the note is what Issue asks for.
          revisionNo === 0
            ? "Optional — anything site should know about this first issue"
            : "What changed in this revision — needed before it can go to site"
        }
      />
      <FormMessage error={noteSave.error} success={noteSave.saved ? "Saved" : null} size="xs" />
    </div>
  );
}

/** The share link of this revision's WorkDrive folder (0124). Using it reads the folder there and then; Read again picks up new sheets; Issue reads it once more and keeps that list. */
function DrawingsField({
  revisionId,
  drawingsUrl,
  sheets,
}: {
  revisionId: string;
  drawingsUrl: string | null;
  sheets: DrawingRevisionRow["folderSheets"];
}) {
  const [value, setValue] = useState(drawingsUrl ?? "");
  const { pending, error, run } = useActionRunner();

  // Compared as the server will store it, so a pasted link with a slash or
  // a query on the end still reads as the saved one.
  const parsed = parseWorkDriveLink(value);
  const changed = (parsed.ok ? parsed.url : value.trim()) !== (drawingsUrl ?? "");
  const readAt = sheets[0]?.readAt ?? null;

  return (
    <div className="space-y-2">
      <label htmlFor={`drawings-link-${revisionId}`} className={LABEL}>
        Drawings — WorkDrive link
      </label>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => setDraftDrawingsLink(revisionId, value));
        }}
      >
        <Input
          id={`drawings-link-${revisionId}`}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 basis-64"
          placeholder="https://workdrive.zohoexternal.com/external/…"
          value={value}
          disabled={pending}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button type="submit" variant="secondary" className="h-11" disabled={pending || !changed}>
          {pending && <Spinner className="size-4 border-2" />}
          {pending
            ? "Reading the folder…"
            : !value.trim() && drawingsUrl
              ? "Take the link off"
              : "Use this link"}
        </Button>
      </form>
      <p className="text-muted text-xs">
        The share link of this revision&apos;s folder — the one anyone can view. Make a new folder
        for each revision, and leave it as it is once issued.
      </p>
      <FormMessage error={error} size="xs" />

      {drawingsUrl && !changed && (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-foreground text-sm font-medium">
              {sheets.length} {sheets.length === 1 ? "sheet" : "sheets"} in the folder
              {readAt && (
                <span className="text-muted font-normal"> · read {formatShortDate(readAt)}</span>
              )}
            </p>
            <div className="flex gap-1">
              <LinkButton href={drawingsUrl} newTab variant="ghost" size="sm">
                <ExternalLink className="size-3.5" />
                Open
              </LinkButton>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => run(() => readDraftFolder(revisionId))}
              >
                <RefreshCw className="size-3.5" />
                Read again
              </Button>
            </div>
          </div>
          <FolderSheetList sheets={sheets} />
        </div>
      )}
    </div>
  );
}

/** Sheets uploaded before 0124 go to site with the draft unless taken off. */
function UploadedSheets({ files }: { files: DrawingRevisionRow["files"] }) {
  const [removingId, setRemovingId] = useState<string>();
  const { pending: removing, error, run } = useActionRunner();

  const remove = async (fileId: string) => {
    setRemovingId(fileId);
    await run(() => deleteDrawingRevisionFile(fileId));
    setRemovingId(undefined);
  };

  return (
    <div className="space-y-1.5">
      <p className={LABEL}>Uploaded sheets ({files.length})</p>
      <p className="text-muted text-xs">
        Uploaded before WorkDrive links. They go to site with this revision unless you take them
        off.
      </p>
      <ul className="divide-border divide-y">
        {files.map((file) => (
          <li key={file.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
            <a
              href={`/design-management/files/${file.id}`}
              target="_blank"
              rel="noreferrer"
              className="text-foreground flex min-w-0 items-center gap-2 hover:underline"
            >
              <FileText className="text-muted size-3.5 shrink-0" />
              <span className="min-w-0 break-all">{file.fileName}</span>
            </a>
            {/* No confirmation: one sheet, on a draft. */}
            <IconButton
              aria-label={`Take off ${file.fileName}`}
              tone="danger"
              disabled={removing && removingId === file.id}
              onClick={() => remove(file.id)}
            >
              <Trash2 className="size-3.5" />
            </IconButton>
          </li>
        ))}
      </ul>
      <FormMessage error={error} size="xs" />
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
  const { pending, error, run } = useActionRunner();
  const [justSaved, setJustSaved] = useState(false);
  const [open, setOpen] = useState(false);

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

  // Set the whole list one way, never toggle each: toggling a mixed selection would invert it.
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

  const save = async () => {
    const result = await run(() => setDrawingRevisionWorks(revisionId, [...checked]));
    if (!result?.error) setJustSaved(true);
  };

  // Folded until asked for; unsaved ticks keep it open so a change is never hidden.
  const shown = open || dirty;

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-expanded={shown}
        onClick={() => setOpen((value) => !value)}
        disabled={dirty}
      >
        {shown ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        Works this drawing serves ({checked.size})
      </Button>

      {shown && (
        <>
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
          </div>
        </>
      )}
      <FormMessage error={error} size="xs" />
    </div>
  );
}

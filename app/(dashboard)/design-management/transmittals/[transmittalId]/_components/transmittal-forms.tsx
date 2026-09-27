"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteDraftTransmittal,
  issueTransmittal,
  removeTransmittalLine,
  setDraftTransmittalNote,
  setDraftTransmittalStage,
} from "@/lib/design-management/actions";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "../../../_components/confirm-dialog";

/**
 * Everything a DRAFT transmittal can be changed by. Once issued, none of
 * this renders — the guard trigger in 0091 refuses every one of these
 * writes anyway, and an issued transmittal that looks editable is worse
 * than one that plainly isn't.
 */
export function DraftDetails({
  transmittalId,
  stages,
  stageId,
  note,
}: {
  transmittalId: string;
  stages: { id: string; name: string }[];
  stageId: string;
  note: string | null;
}) {
  // The stage saves on pick. It is held locally so a failed save can put
  // the select back to what the database still says.
  const [stage, setStage] = useState(stageId);
  const [stagePending, startStage] = useTransition();
  const [stageError, setStageError] = useState<string>();
  const [stageSaved, setStageSaved] = useState(false);

  const [noteValue, setNoteValue] = useState(note ?? "");
  const noteSave = useSaveOnBlur<string>({
    initial: note ?? "",
    save: (next) => setDraftTransmittalNote(transmittalId, next),
  });

  const changeStage = (next: string) => {
    const before = stage;
    setStage(next);
    setStageError(undefined);
    setStageSaved(false);
    startStage(async () => {
      const result = await setDraftTransmittalStage(transmittalId, next);
      if (result?.error) {
        setStage(before);
        setStageError(result.error);
      } else {
        setStageSaved(true);
        setTimeout(() => setStageSaved(false), 1200);
      }
    });
  };

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(12rem,1fr)_2fr]">
      <div className="space-y-1.5">
        <Label htmlFor="design_stage_id">Design stage</Label>
        <Select
          id="design_stage_id"
          value={stage}
          disabled={stagePending}
          onChange={(event) => changeStage(event.target.value)}
        >
          {stages.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </Select>
        <FormMessage error={stageError} success={stageSaved ? "Saved" : null} size="xs" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="transmittal-note">Note for site (optional)</Label>
        <Textarea
          id="transmittal-note"
          rows={2}
          value={noteValue}
          maxLength={1000}
          onChange={(event) => setNoteValue(event.target.value)}
          onBlur={() => noteSave.flush(noteValue)}
          placeholder="Anything site should know about this issue…"
        />
        <FormMessage error={noteSave.error} success={noteSave.saved ? "Saved" : null} size="xs" />
      </div>
    </div>
  );
}

/**
 * One Remove per drawing, and one question when it costs something.
 *
 * A draft drawing lives on exactly one draft transmittal, so taking it
 * off deletes it and its sheets — left behind, it would be a draft
 * nobody can open (2026-09-27 audit: a red trash icon that quietly
 * stranded it sat beside a grey button that deleted it, neither asking).
 * A released drawing being sent again loses nothing when it comes off,
 * so it goes without a question.
 */
export function RemoveLineButton({
  lineId,
  label,
  revisionNo,
  isDraft,
  fileCount,
}: {
  lineId: string;
  label: string;
  revisionNo: number;
  isDraft: boolean;
  fileCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  if (isDraft) {
    const sheets =
      fileCount === 0
        ? "It has no sheets yet."
        : `Its ${fileCount === 1 ? "sheet" : `${fileCount} sheets`} will be deleted too.`;
    return (
      <ConfirmDialog
        trigger={
          <Button type="button" variant="ghost" size="sm">
            Remove
          </Button>
        }
        title={`Remove ${label} R${revisionNo}?`}
        description={`The draft comes off this transmittal and is deleted. ${sheets}`}
        confirmLabel="Remove and delete"
        pendingLabel="Removing…"
        onConfirm={() => removeTransmittalLine(lineId, true)}
      />
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <FormMessage error={error} size="xs" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        aria-label={`Take ${label} off this transmittal`}
        onClick={() => {
          setError(undefined);
          startTransition(async () => {
            const result = await removeTransmittalLine(lineId, false);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? "Removing…" : "Remove"}
      </Button>
    </div>
  );
}

/**
 * Issue is deliberately pressable on a draft with no drawings on it: the
 * refusal that comes back — "Add at least one drawing before issuing
 * this transmittal" — is the database's own sentence, written for a
 * person, and reading it teaches more than a greyed-out button.
 */
export function IssueTransmittalButton({ transmittalId }: { transmittalId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex items-center gap-2">
      <FormMessage error={error} size="xs" />
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(undefined);
          startTransition(async () => {
            const result = await issueTransmittal(transmittalId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? "Issuing…" : "Issue"}
      </Button>
    </div>
  );
}

/** The whole draft, gone — said out loud first, with what goes with it. */
export function DeleteDraftTransmittalButton({
  transmittalId,
  draftCount,
}: {
  transmittalId: string;
  draftCount: number;
}) {
  const goesWithIt =
    draftCount === 0
      ? "Nothing has been sent, so nothing on site changes."
      : `${draftCount === 1 ? "Its draft drawing" : `Its ${draftCount} draft drawings`} and their sheets are deleted with it. Nothing on site changes.`;
  return (
    <ConfirmDialog
      trigger={
        <Button type="button" variant="ghost">
          Delete this draft
        </Button>
      }
      title="Delete this draft transmittal?"
      description={goesWithIt}
      confirmLabel="Delete draft"
      pendingLabel="Deleting…"
      onConfirm={() => deleteDraftTransmittal(transmittalId)}
    />
  );
}

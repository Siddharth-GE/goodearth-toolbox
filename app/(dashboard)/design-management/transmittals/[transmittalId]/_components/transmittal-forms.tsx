"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
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
import { Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

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
 * Taking a drawing off, and — for a draft — the separate question of
 * whether to throw the drawing away too.
 *
 * They are deliberately two presses. Off-this-transmittal is a change of
 * mind about what goes out today; deleting the draft destroys uploaded
 * sheets. Guessing between them would either strand a draft nobody can
 * find or lose work nobody meant to lose, so the screen asks.
 */
export function RemoveLineButton({
  lineId,
  label,
  isDraft,
}: {
  lineId: string;
  label: string;
  isDraft: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const remove = (discardDraft: boolean) => {
    setError(undefined);
    startTransition(async () => {
      const result = await removeTransmittalLine(lineId, discardDraft);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <FormMessage error={error} size="xs" />
      {isDraft && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => remove(true)}
        >
          {pending ? "Working…" : "Remove and delete the draft"}
        </Button>
      )}
      <IconButton
        aria-label={`Take ${label} off this transmittal`}
        tone="danger"
        disabled={pending}
        onClick={() => remove(false)}
      >
        <Trash2 className="size-3.5" />
      </IconButton>
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

export function DeleteDraftTransmittalButton({ transmittalId }: { transmittalId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex items-center gap-2">
      <FormMessage error={error} size="xs" />
      <Button
        type="button"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          setError(undefined);
          startTransition(async () => {
            const result = await deleteDraftTransmittal(transmittalId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? "Deleting…" : "Delete this draft"}
      </Button>
    </div>
  );
}

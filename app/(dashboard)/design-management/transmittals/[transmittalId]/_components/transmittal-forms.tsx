"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  addTransmittalLine,
  createRevisionOnTransmittal,
  createSetOnTransmittal,
  deleteDraftTransmittal,
  issueTransmittal,
  removeTransmittalLine,
  updateDraftTransmittal,
} from "@/lib/design-management/actions";
import type { VillaDrawingSetState } from "@/lib/design-management/queries";
import { Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

/**
 * Everything a DRAFT transmittal can be changed by. Once issued, none of
 * this renders — the guard trigger in 0091 refuses every one of these
 * writes anyway, and an issued transmittal that looks editable is worse
 * than one that plainly isn't.
 */
export function DraftDetailsForm({
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
  const [state, formAction, pending] = useActionState(
    updateDraftTransmittal.bind(null, transmittalId),
    undefined,
  );

  return (
    <form action={formAction}>
      <fieldset disabled={pending} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="design_stage_id">Design stage</Label>
          <Select id="design_stage_id" name="design_stage_id" defaultValue={stageId}>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="note">Note (optional)</Label>
          <Textarea
            id="note"
            name="note"
            rows={2}
            defaultValue={note ?? ""}
            placeholder="Anything site should know about this issue…"
          />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit">{pending ? "Saving…" : "Save changes"}</Button>
          <FormMessage error={state?.error} size="xs" />
        </div>
      </fieldset>
    </form>
  );
}

/**
 * The board the founder asked for: THIS VILLA'S drawing sets, each with
 * the one press that makes sense for where it stands.
 *
 * "under new transmittal you either upload a new set of drawings or you
 * revise a set that can be seen there" (2026-08-22). A set with a draft
 * open continues it rather than starting a second, which the database
 * would refuse anyway; any other set offers its next revision. A set
 * this villa has never drawn is not here at all — that is what the New
 * drawing set control beneath is for.
 *
 * Both offers are the same action: `createRevisionOnTransmittal` reads
 * the villa's state itself, so the label is the only thing that differs
 * and the screen can never disagree with the database about which case
 * it is in.
 */
export function AddDrawingsBoard({
  transmittalId,
  sets,
  setIdsOnTransmittal,
}: {
  transmittalId: string;
  sets: VillaDrawingSetState[];
  setIdsOnTransmittal: string[];
}) {
  const onTransmittal = new Set(setIdsOnTransmittal);

  if (sets.length === 0) {
    return (
      <p className="text-muted text-sm">
        No drawings on this villa yet. Name the first set below and upload its sheets.
      </p>
    );
  }

  return (
    <ul className="divide-border divide-y">
      {sets.map((set) => (
        <li key={set.setId} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <div className="min-w-0">
            <p className="text-foreground text-sm font-medium">
              {set.setCode ? `${set.setCode} — ${set.setName}` : set.setName}
            </p>
            <p className="text-muted text-xs">{stateLine(set)}</p>
          </div>
          {onTransmittal.has(set.setId) ? (
            <Badge variant="info">On this transmittal</Badge>
          ) : (
            <AddSetButton transmittalId={transmittalId} set={set} />
          )}
        </li>
      ))}
    </ul>
  );
}

/** What this villa has of the set, said plainly. */
function stateLine(set: VillaDrawingSetState): string {
  const parts: string[] = [];
  if (set.draft) {
    parts.push(`Draft R${set.draft.revisionNo} · ${fileCount(set.draft.fileCount)}`);
  }
  if (set.released) {
    parts.push(
      set.draft
        ? `last released R${set.released.revisionNo}`
        : `Released R${set.released.revisionNo} · ${fileCount(set.released.fileCount)}`,
    );
  }
  if (parts.length === 0) return "Not drawn for this villa yet";
  return parts.join(" · ");
}

function fileCount(count: number): string {
  return `${count} ${count === 1 ? "file" : "files"}`;
}

function AddSetButton({
  transmittalId,
  set,
}: {
  transmittalId: string;
  set: VillaDrawingSetState;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  // Two labels, not three: a set only reaches this board if this villa
  // already has a revision of it, so "the first drawings" is the New
  // drawing set control's job and never this button's.
  const label = set.draft
    ? `Continue draft R${set.draft.revisionNo}`
    : `Revise — starts R${set.nextRevisionNo}`;

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
            const result = await createRevisionOnTransmittal(transmittalId, set.setId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? "Adding…" : label}
      </Button>
    </div>
  );
}

/**
 * A drawing set is born here, inside a transmittal, and nowhere else
 * (founder, 2026-08-22 evening: "dont make a new drawing set outside").
 *
 * One press creates the set, starts its R0 on this villa and puts it on
 * this transmittal — after which the draft editor appears on its line
 * for the sheets, the note and the works it serves. It asks for a name
 * and nothing else: a set born on a plot needs no code, and its works
 * are ticked one level down on the revision itself.
 */
export function NewDrawingSetForm({ transmittalId }: { transmittalId: string }) {
  const [state, formAction, pending] = useActionState(
    createSetOnTransmittal.bind(null, transmittalId),
    undefined,
  );

  return (
    <form action={formAction}>
      <fieldset disabled={pending} className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="new-set-name">New drawing set</Label>
            <Input
              id="new-set-name"
              name="name"
              required
              maxLength={120}
              autoComplete="off"
              placeholder="e.g. Working Drawings — Ground Floor"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Adding…" : "Add set and start R0"}
          </Button>
        </div>
        <FormMessage error={state?.error} size="xs" />
      </fieldset>
    </form>
  );
}

/**
 * Sending a drawing that is already released, exactly as it is — the
 * same set going out again at a new design stage. Nothing is revised
 * and nothing is created; `issue_transmittal` leaves these lines alone.
 */
export function ResendReleasedPicker({
  transmittalId,
  options,
}: {
  transmittalId: string;
  options: { revisionId: string; label: string }[];
}) {
  const [revisionId, setRevisionId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  if (options.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="resend-revision">Send an already-released drawing again, unchanged</Label>
          <Select
            id="resend-revision"
            value={revisionId}
            disabled={pending}
            onChange={(event) => setRevisionId(event.target.value)}
          >
            <option value="">Choose a released drawing…</option>
            {options.map((option) => (
              <option key={option.revisionId} value={option.revisionId}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={!revisionId || pending}
          onClick={() => {
            setError(undefined);
            startTransition(async () => {
              const result = await addTransmittalLine(transmittalId, revisionId);
              if (result?.error) setError(result.error);
              else setRevisionId("");
            });
          }}
        >
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <FormMessage error={error} size="xs" />
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

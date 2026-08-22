"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  addTransmittalLine,
  deleteDraftTransmittal,
  issueTransmittal,
  removeTransmittalLine,
  updateDraftTransmittal,
} from "@/lib/design-management/actions";
import type { TransmittalCandidate } from "@/lib/design-management/queries";
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
 * Adds one more drawing to the draft, at its current revision. The list
 * has already had the drawings on this transmittal taken out of it, so
 * the unique constraint is a backstop rather than the everyday path.
 */
export function AddLinePicker({
  transmittalId,
  candidates,
}: {
  transmittalId: string;
  candidates: TransmittalCandidate[];
}) {
  const [revisionId, setRevisionId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  if (candidates.length === 0) {
    return (
      <p className="text-muted text-sm">
        No other current drawing on this villa to add. Start a revision on the villa&apos;s design
        page first.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="add-line">Add a drawing</Label>
          <Select
            id="add-line"
            value={revisionId}
            disabled={pending}
            onChange={(event) => setRevisionId(event.target.value)}
          >
            <option value="">Choose a drawing set…</option>
            {candidates.map((candidate) => (
              <option key={candidate.revisionId} value={candidate.revisionId}>
                {candidateLabel(candidate)}
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

/** "WD-GF — Working Drawings — R2 (draft) · 2 files", in one line
 *  because a <select> option can only ever be one line of text. */
function candidateLabel(candidate: TransmittalCandidate): string {
  const set = candidate.setCode ? `${candidate.setCode} — ${candidate.setName}` : candidate.setName;
  const files = `${candidate.fileCount} ${candidate.fileCount === 1 ? "file" : "files"}`;
  return `${set} — R${candidate.revisionNo} (${candidate.status}) · ${files}`;
}

export function RemoveLineButton({ lineId, label }: { lineId: string; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex items-center justify-end gap-2">
      <FormMessage error={error} size="xs" />
      <IconButton
        aria-label={`Take ${label} off this transmittal`}
        tone="danger"
        disabled={pending}
        onClick={() => {
          setError(undefined);
          startTransition(async () => {
            const result = await removeTransmittalLine(lineId);
            if (result?.error) setError(result.error);
          });
        }}
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

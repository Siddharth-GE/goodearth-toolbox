"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteDraftTransmittal,
  issueTransmittal,
  setDraftTransmittalNote,
} from "@/lib/design-management/actions";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "../../../_components/confirm-dialog";

/**
 * The note for site on a DRAFT transmittal, saved when the person leaves
 * the field. The stage and the set are not here: they were chosen when
 * the transmittal started and never move (0099). Once issued, nothing in
 * this file renders — the guard trigger in 0091 refuses these writes
 * anyway, and an issued transmittal that looks editable is worse than
 * one that plainly isn't.
 */
export function TransmittalNote({
  transmittalId,
  note,
}: {
  transmittalId: string;
  note: string | null;
}) {
  const [value, setValue] = useState(note ?? "");
  const save = useSaveOnBlur<string>({
    initial: note ?? "",
    save: (next) => setDraftTransmittalNote(transmittalId, next),
  });

  return (
    <div className="space-y-1.5">
      <Label htmlFor="transmittal-note">Note for site (optional)</Label>
      <Textarea
        id="transmittal-note"
        rows={2}
        value={value}
        maxLength={1000}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => save.flush(value)}
        placeholder="Anything site should know about this issue…"
      />
      <FormMessage error={save.error} success={save.saved ? "Saved" : null} size="xs" />
    </div>
  );
}

/**
 * The row under the title: whether this draft is ready to go, and Issue.
 *
 * The readiness line is worked out from the page's own data
 * (lib/design-management/readiness.ts) so the problem is named before
 * the press. Issue stays pressable either way: `issue_transmittal` is
 * the rule, and if it refuses, its own sentence replaces the readiness
 * line at full size, right where the eye already is — not in small
 * print beside the button.
 */
export function IssueBar({
  transmittalId,
  problem,
  sheetCount,
}: {
  transmittalId: string;
  problem: string | null;
  sheetCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3">
      <div className="min-w-0 flex-1">
        {error ? (
          <FormMessage error={error} />
        ) : problem ? (
          <p className="text-warning text-sm font-medium">{problem}</p>
        ) : (
          <FormMessage
            success={`Ready to issue · ${sheetCount} ${sheetCount === 1 ? "sheet" : "sheets"}`}
          />
        )}
      </div>
      <Button
        type="button"
        disabled={pending}
        className="w-full sm:w-auto"
        onClick={() => {
          setError(undefined);
          startTransition(async () => {
            const result = await issueTransmittal(transmittalId);
            if (result?.error) setError(result.error);
          });
        }}
      >
        {pending ? "Issuing…" : "Issue to site"}
      </Button>
    </div>
  );
}

/** The whole draft, gone — said out loud first, with what goes with it. */
export function DeleteDraftTransmittalButton({
  transmittalId,
  draft,
}: {
  transmittalId: string;
  /** The draft revision on it, which is deleted too; null when there is none. */
  draft: { label: string; revisionNo: number; sheetCount: number } | null;
}) {
  const goesWithIt = !draft
    ? "Nothing has been sent, so nothing on site changes."
    : draft.sheetCount === 0
      ? `${draft.label} R${draft.revisionNo} is deleted with it. Nothing on site changes.`
      : `${draft.label} R${draft.revisionNo} and its ${
          draft.sheetCount === 1 ? "sheet are" : `${draft.sheetCount} sheets are`
        } deleted with it. Nothing on site changes.`;
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

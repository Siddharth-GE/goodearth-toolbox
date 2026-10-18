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
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";

/** The note for site on a DRAFT, saved when the field is left. Stage and set never move (0099). Once issued nothing here renders: an issued transmittal that looks editable is worse than one that plainly isn't. */
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

/** Readiness is worked out from the page's own data (readiness.ts) so the problem is named before the press. Issue stays pressable: issue_transmittal is the rule, and its refusal replaces the readiness line at full size. */
export function IssueBar({
  transmittalId,
  problem,
  sheetCount,
}: {
  transmittalId: string;
  problem: string | null;
  sheetCount: number;
}) {
  const { pending, error, run } = useActionRunner();

  return (
    <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3">
      <div className="min-w-0 flex-1">
        {error ? (
          <FormMessage error={error} />
        ) : problem ? (
          <p className="text-warning text-sm font-medium">{problem}</p>
        ) : (
          <FormMessage
            success={
              sheetCount === 0
                ? "Ready to issue"
                : `Ready to issue · ${sheetCount} ${sheetCount === 1 ? "sheet" : "sheets"}`
            }
          />
        )}
      </div>
      <Button
        type="button"
        disabled={pending}
        className="w-full sm:w-auto"
        onClick={() => run(() => issueTransmittal(transmittalId))}
      >
        {pending ? "Issuing…" : "Issue to site"}
      </Button>
    </div>
  );
}

export function DeleteDraftTransmittalButton({
  transmittalId,
  draft,
}: {
  transmittalId: string;
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

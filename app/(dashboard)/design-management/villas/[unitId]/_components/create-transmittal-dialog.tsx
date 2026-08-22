"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createTransmittal } from "@/lib/design-management/actions";
import type { TransmittalCandidate } from "@/lib/design-management/queries";

/**
 * Raise a transmittal for this villa: the design stage it goes out at, a
 * note, and which drawings ride on it.
 *
 * The drawings are PICKED, never typed, and each one is offered at its
 * CURRENT revision only — the draft if the designer has one open, else
 * the released one. A superseded revision is never in this list; sending
 * a retired drawing to site is the mistake this tool exists to prevent.
 *
 * Issuing is a separate press on the transmittal's own page, because
 * issuing is what releases the drawings and it should never happen as a
 * side effect of filling in a form.
 */
export function CreateTransmittalDialog({
  unitId,
  stages,
  candidates,
}: {
  unitId: string;
  stages: { id: string; name: string }[];
  candidates: TransmittalCandidate[];
}) {
  // Nothing to send, or nowhere to send it against: say why rather than
  // offering a dialog that can only fail.
  if (stages.length === 0 || candidates.length === 0) {
    return (
      <Button variant="secondary" disabled>
        {stages.length === 0 ? "No design stages yet" : "No drawings to send yet"}
      </Button>
    );
  }

  return (
    <RecordFormDialog
      label="Transmittal"
      isEdit={false}
      action={createTransmittal.bind(null, unitId)}
      trigger={<Button>New transmittal</Button>}
    >
      <div className="space-y-1.5">
        <Label htmlFor="design_stage_id">Design stage</Label>
        <Select id="design_stage_id" name="design_stage_id" required defaultValue="">
          <option value="" disabled>
            Choose a stage…
          </option>
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
          placeholder="Anything site should know about this issue…"
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-muted text-xs font-semibold tracking-widest uppercase">Drawings</p>
        <ul className="border-border divide-border max-h-56 divide-y overflow-y-auto rounded-xl border">
          {candidates.map((candidate) => (
            <li key={candidate.revisionId}>
              <label className="flex cursor-pointer items-start gap-2 p-2.5">
                <Checkbox name="revision_id" value={candidate.revisionId} className="mt-0.5" />
                <span className="min-w-0">
                  <span className="text-foreground block text-sm">
                    {candidate.setCode
                      ? `${candidate.setCode} — ${candidate.setName}`
                      : candidate.setName}{" "}
                    — R{candidate.revisionNo} ({candidate.status})
                  </span>
                  <span className="text-muted block text-xs">
                    {candidate.fileCount} {candidate.fileCount === 1 ? "file" : "files"}
                    {candidate.note ? ` · ${candidate.note}` : ""}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </RecordFormDialog>
  );
}

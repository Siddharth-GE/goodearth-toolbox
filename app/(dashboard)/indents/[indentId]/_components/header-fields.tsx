"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { updateIndentHeader } from "@/lib/indents/actions";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import { useState } from "react";

/**
 * The indent's own fields — stage, required-by, note — editable on blur
 * while it's a draft, read-only text once submitted. The database guard
 * refuses header edits past draft, so read-only here is honesty, not
 * enforcement. Stage is picked from the construction stages master
 * (0053), never typed.
 */
export function HeaderFields({
  indentId,
  stage,
  stages,
  requiredBy,
  note,
  editable,
}: {
  indentId: string;
  stage: string | null;
  /** Active stage names from the master list. */
  stages: string[];
  requiredBy: string | null;
  note: string | null;
  editable: boolean;
}) {
  const [stageValue, setStageValue] = useState(stage ?? "");
  const [requiredByValue, setRequiredByValue] = useState(requiredBy ?? "");
  const [noteValue, setNoteValue] = useState(note ?? "");

  const { flush, error, saved } = useSaveOnBlur({
    initial: { stage: stage ?? "", requiredBy: requiredBy ?? "", note: note ?? "" },
    save: (value) =>
      updateIndentHeader(indentId, {
        stage: value.stage || null,
        requiredBy: value.requiredBy || null,
        note: value.note || null,
      }),
  });

  const save = () => flush({ stage: stageValue, requiredBy: requiredByValue, note: noteValue });

  if (!editable) {
    return (
      <div className="border-border bg-surface grid gap-4 rounded-2xl border p-4 sm:grid-cols-3">
        <ReadOnlyField label="Stage" value={stage ?? "—"} />
        <ReadOnlyField label="Required by" value={formatDate(requiredBy)} />
        <ReadOnlyField label="Note" value={note ?? "—"} />
      </div>
    );
  }

  return (
    <div className="border-border bg-surface space-y-3 rounded-2xl border p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="header-stage">Stage</Label>
          <Select
            id="header-stage"
            value={stageValue}
            onChange={(event) => setStageValue(event.target.value)}
            onBlur={save}
          >
            <option value="">No stage</option>
            {/* A stage this indent already carries stays choosable even
                if it has since been deactivated — the select must never
                silently clear a saved value. */}
            {stageValue && !stages.includes(stageValue) && (
              <option value={stageValue}>{stageValue}</option>
            )}
            {stages.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="header-required-by">Required by</Label>
          <Input
            id="header-required-by"
            type="date"
            value={requiredByValue}
            onChange={(event) => setRequiredByValue(event.target.value)}
            onBlur={save}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="header-note">Note</Label>
          <Input
            id="header-note"
            value={noteValue}
            onChange={(event) => setNoteValue(event.target.value)}
            onBlur={save}
            placeholder="—"
            autoComplete="off"
          />
        </div>
      </div>
      <FormMessage error={error} success={saved ? "Saved" : undefined} size="xs" />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted text-xs font-semibold tracking-widest uppercase">{label}</p>
      <p className="text-foreground mt-1 text-sm">{value}</p>
    </div>
  );
}

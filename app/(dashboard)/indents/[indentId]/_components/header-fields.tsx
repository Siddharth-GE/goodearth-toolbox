"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { updateIndentHeader } from "@/lib/indents/actions";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import { useState } from "react";

// The database guard refuses header edits past draft, so read-only here is honesty, not enforcement.
export type WorkOption = { id: string; code: string; name: string; category: string };

/** "stage:<id>" for a stage (0158), "work:<id>" for an older indent's one work, "" for neither. */
const choiceOf = (workGroupId: string | null, workItemId: string | null) =>
  workGroupId ? `stage:${workGroupId}` : workItemId ? `work:${workItemId}` : "";

export function HeaderFields({
  indentId,
  stage,
  workItemId,
  workGroupId,
  works,
  stages,
  requiredBy,
  note,
  isUrgent,
  editable,
}: {
  indentId: string;
  /** A legacy stage (0053): display-only history. */
  stage: string | null;
  workItemId: string | null;
  workGroupId: string | null;
  works: WorkOption[];
  stages: WorkOption[];
  requiredBy: string | null;
  note: string | null;
  isUrgent: boolean;
  editable: boolean;
}) {
  const [forValue, setForValue] = useState(choiceOf(workGroupId, workItemId));
  const [requiredByValue, setRequiredByValue] = useState(requiredBy ?? "");
  const [noteValue, setNoteValue] = useState(note ?? "");
  const [urgentValue, setUrgentValue] = useState(isUrgent);

  const { flush, error, saved } = useSaveOnBlur({
    initial: {
      for: choiceOf(workGroupId, workItemId),
      requiredBy: requiredBy ?? "",
      note: note ?? "",
      urgent: isUrgent,
    },
    save: (value) =>
      updateIndentHeader(indentId, {
        workItemId: value.for.startsWith("work:") ? value.for.slice(5) : null,
        workGroupId: value.for.startsWith("stage:") ? value.for.slice(6) : null,
        requiredBy: value.requiredBy || null,
        note: value.note || null,
        isUrgent: value.urgent,
      }),
  });

  const saveWith = (urgent: boolean) =>
    flush({ for: forValue, requiredBy: requiredByValue, note: noteValue, urgent });
  const save = () => saveWith(urgentValue);

  const label = (rows: WorkOption[], id: string | null) => {
    const row = rows.find((candidate) => candidate.id === id);
    return row ? `${row.code} — ${row.name}` : "—";
  };
  const forLabel = workGroupId
    ? label(stages, workGroupId)
    : workItemId
      ? `${label(works, workItemId)} (one work)`
      : "—";
  const stageCategories = [...new Set(stages.map((row) => row.category))];

  if (!editable) {
    return (
      <div className="border-border bg-surface grid gap-4 rounded-2xl border p-4 sm:grid-cols-4">
        {stage && <ReadOnlyField label="Stage (old list)" value={stage} />}
        <ReadOnlyField label={workItemId ? "Work" : "Stage"} value={forLabel} />
        <ReadOnlyField label="Required by" value={formatDate(requiredBy)} />
        <ReadOnlyField label="Note" value={note ?? "—"} />
        {isUrgent && <ReadOnlyField label="Urgent" value="Yes — an emergency request" />}
      </div>
    );
  }

  return (
    <div className="border-border bg-surface space-y-3 rounded-2xl border p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="header-for">Stage</Label>
          <Select
            id="header-for"
            value={forValue}
            onChange={(event) => setForValue(event.target.value)}
            onBlur={save}
          >
            <option value="">No stage</option>
            {/* An older indent's one work stays choosable until a stage replaces it. */}
            {workItemId && (
              <option
                value={`work:${workItemId}`}
              >{`${label(works, workItemId)} (one work)`}</option>
            )}
            {/* A saved stage stays choosable even if deactivated. */}
            {workGroupId && !stages.some((row) => row.id === workGroupId) && (
              <option value={`stage:${workGroupId}`}>{forLabel}</option>
            )}
            {stageCategories.map((category) => (
              <optgroup key={category} label={category}>
                {stages
                  .filter((row) => row.category === category)
                  .map((row) => (
                    <option key={row.id} value={`stage:${row.id}`}>
                      {row.code} — {row.name}
                    </option>
                  ))}
              </optgroup>
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
      <label className="text-foreground flex items-center gap-2 text-sm">
        <Checkbox
          checked={urgentValue}
          onChange={(event) => {
            setUrgentValue(event.target.checked);
            saveWith(event.target.checked);
          }}
        />
        Urgent — the approver sees it first
      </label>
      <FormMessage error={error} success={saved ? "Saved" : undefined} size="xs" />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">{label}</p>
      <p className="text-foreground mt-1 text-sm">{value}</p>
    </div>
  );
}

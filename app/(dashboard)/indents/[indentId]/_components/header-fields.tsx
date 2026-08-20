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
export type WorkOption = { id: string; code: string; name: string; category: string };

export function HeaderFields({
  indentId,
  stage,
  stages,
  workItemId,
  works,
  requiredBy,
  note,
  editable,
}: {
  indentId: string;
  stage: string | null;
  /** Active stage names from the master list. */
  stages: string[];
  /** The work this request serves, from the works masters (0078). */
  workItemId: string | null;
  works: WorkOption[];
  requiredBy: string | null;
  note: string | null;
  editable: boolean;
}) {
  const [stageValue, setStageValue] = useState(stage ?? "");
  const [workValue, setWorkValue] = useState(workItemId ?? "");
  const [requiredByValue, setRequiredByValue] = useState(requiredBy ?? "");
  const [noteValue, setNoteValue] = useState(note ?? "");

  const { flush, error, saved } = useSaveOnBlur({
    initial: {
      stage: stage ?? "",
      work: workItemId ?? "",
      requiredBy: requiredBy ?? "",
      note: note ?? "",
    },
    save: (value) =>
      updateIndentHeader(indentId, {
        stage: value.stage || null,
        workItemId: value.work || null,
        requiredBy: value.requiredBy || null,
        note: value.note || null,
      }),
  });

  const save = () =>
    flush({ stage: stageValue, work: workValue, requiredBy: requiredByValue, note: noteValue });

  const workLabel = (id: string | null) => {
    const work = works.find((row) => row.id === id);
    return work ? `${work.code} — ${work.name}` : "—";
  };
  const workCategories = [...new Set(works.map((work) => work.category))];

  if (!editable) {
    return (
      <div className="border-border bg-surface grid gap-4 rounded-2xl border p-4 sm:grid-cols-4">
        <ReadOnlyField label="Stage" value={stage ?? "—"} />
        <ReadOnlyField label="Work" value={workLabel(workItemId)} />
        <ReadOnlyField label="Required by" value={formatDate(requiredBy)} />
        <ReadOnlyField label="Note" value={note ?? "—"} />
      </div>
    );
  }

  return (
    <div className="border-border bg-surface space-y-3 rounded-2xl border p-4">
      <div className="grid gap-4 sm:grid-cols-4">
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
          <Label htmlFor="header-work">Work</Label>
          <Select
            id="header-work"
            value={workValue}
            onChange={(event) => setWorkValue(event.target.value)}
            onBlur={save}
          >
            <option value="">No work</option>
            {/* A saved work stays choosable even if it has since been
                deactivated — same rule as the stage above. */}
            {workValue && !works.some((work) => work.id === workValue) && (
              <option value={workValue}>{workLabel(workValue)}</option>
            )}
            {workCategories.map((category) => (
              <optgroup key={category} label={category}>
                {works
                  .filter((work) => work.category === category)
                  .map((work) => (
                    <option key={work.id} value={work.id}>
                      {work.code} — {work.name}
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

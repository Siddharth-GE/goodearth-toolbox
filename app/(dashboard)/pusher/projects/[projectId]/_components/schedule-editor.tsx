"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addProjectStage,
  deleteProjectStage,
  moveProjectStage,
  setProjectStart,
  updateProjectStage,
} from "@/lib/pusher/actions";
import { formatDate } from "@/lib/format";
import type { PlannedStage } from "@/lib/pusher/schedule";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Setting a project's schedule. Two kinds of input and no more: the date
 * it starts, and how many weeks each stage takes.
 *
 * There is deliberately nowhere to type a stage's start or end date.
 * Those are shown, calculated, next to each row — and they move on their
 * own when anything above them changes, which is the whole reason they
 * are not stored.
 */
export function ScheduleEditor({
  projectId,
  startDate,
  stages,
}: {
  projectId: string;
  startDate: string | null;
  stages: PlannedStage[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [start, setStart] = useState(startDate ?? "");
  const [newName, setNewName] = useState("");
  const [newWeeks, setNewWeeks] = useState(4);

  // A plain boolean, not useTransition. router.refresh() inside an async
  // transition leaves isPending true for as long as the refresh is in
  // flight — and on this page, which stays mounted, that greyed the
  // whole editor out and never came back. Nothing here needs a
  // transition's interruptibility; it needs "is a save running".
  const run = async (action: () => Promise<{ error?: string } | undefined>) => {
    setPending(true);
    setError(null);
    try {
      const result = await action();
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="space-y-4 p-5">
      <div>
        <Label htmlFor="start-date">Project starts</Label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Input
            id="start-date"
            type="date"
            className="max-w-48 font-mono"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={pending || !start || start === startDate}
            onClick={() => run(() => setProjectStart(projectId, start))}
          >
            {startDate ? "Change" : "Set"}
          </Button>
          <p className="text-muted text-xs">
            The one date anyone types. Every other date is worked out from it.
          </p>
        </div>
      </div>

      <div>
        <Label>Stages — in order, with how long each one takes</Label>
        {stages.length === 0 ? (
          <p className="text-muted border-border mt-2 rounded-xl border border-dashed p-4 text-center text-sm">
            No stages yet. Add the first one below — Design, Approvals, Construction, Handover.
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {stages.map((stage, i) => (
              <StageRow
                key={stage.id}
                stage={stage}
                projectId={projectId}
                isFirst={i === 0}
                isLast={i === stages.length - 1}
                disabled={pending}
                run={run}
              />
            ))}
          </div>
        )}
      </div>

      <div className="border-border border-t pt-4">
        <Label htmlFor="new-stage">Add a stage</Label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Input
            id="new-stage"
            className="min-w-40 flex-1"
            placeholder="e.g. Construction"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Input
            aria-label="Weeks"
            type="number"
            min={1}
            step={1}
            className="max-w-24 text-center font-mono"
            value={newWeeks}
            onChange={(e) => setNewWeeks(Number(e.target.value))}
          />
          <span className="text-muted text-xs">weeks</span>
          <Button
            disabled={pending || !newName.trim()}
            onClick={() =>
              run(async () => {
                const result = await addProjectStage(projectId, newName, newWeeks);
                if (!result?.error) {
                  setNewName("");
                  setNewWeeks(4);
                }
                return result;
              })
            }
          >
            Add
          </Button>
        </div>
      </div>

      <FormMessage error={error} />
    </Card>
  );
}

function StageRow({
  stage,
  projectId,
  isFirst,
  isLast,
  disabled,
  run,
}: {
  stage: PlannedStage;
  projectId: string;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
  run: (action: () => Promise<{ error?: string } | undefined>) => void | Promise<void>;
}) {
  const [name, setName] = useState(stage.name);
  const [weeks, setWeeks] = useState(stage.weeks);
  const dirty = name !== stage.name || weeks !== stage.weeks;

  return (
    <div className="border-border flex flex-wrap items-center gap-2 rounded-xl border p-2">
      <div className="flex shrink-0 flex-col">
        <IconButton
          aria-label={`Move ${stage.name} earlier`}
          size="sm"
          disabled={disabled || isFirst}
          onClick={() => run(() => moveProjectStage(stage.id, projectId, "up"))}
        >
          <ChevronUp className="size-3.5" />
        </IconButton>
        <IconButton
          aria-label={`Move ${stage.name} later`}
          size="sm"
          disabled={disabled || isLast}
          onClick={() => run(() => moveProjectStage(stage.id, projectId, "down"))}
        >
          <ChevronDown className="size-3.5" />
        </IconButton>
      </div>

      <Input
        aria-label={`${stage.name} name`}
        className="min-w-32 flex-1"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        aria-label={`${stage.name} weeks`}
        type="number"
        min={1}
        step={1}
        className="max-w-20 text-center font-mono"
        value={weeks}
        onChange={(e) => setWeeks(Number(e.target.value))}
      />

      {/* Calculated, never typed — and it moves by itself when anything
          above this row changes. */}
      <span className="text-muted shrink-0 font-mono text-[11px]">
        {formatDate(stage.startDay)} → {formatDate(stage.endDay)}
      </span>

      {dirty && (
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => run(() => updateProjectStage(stage.id, projectId, name, weeks))}
        >
          Save
        </Button>
      )}

      <IconButton
        aria-label={`Remove ${stage.name}`}
        tone="danger"
        size="sm"
        disabled={disabled}
        onClick={() => run(() => deleteProjectStage(stage.id, projectId))}
      >
        <X className="size-4" />
      </IconButton>
    </div>
  );
}

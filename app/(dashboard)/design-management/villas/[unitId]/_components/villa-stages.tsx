"use client";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Pill, PillButton } from "@/components/ui/pill";
import { Textarea } from "@/components/ui/textarea";
import { useUndoBar } from "@/components/ui/undo-bar";
import {
  STEP_STATUSES,
  passTargets,
  revisingLabel,
  stepStatus,
  type StepStatus,
} from "@/lib/design-management/board";
import {
  addStepPerson,
  passStep,
  removeStepPerson,
  setStepNote,
  setStepStatus,
  setWhereItIs,
  startStep,
} from "@/lib/design-management/board-actions";
import type { Person, StepView } from "@/lib/design-management/board-queries";
import { daysBetween } from "@/lib/next-steps/rules";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArrowRight, MoreHorizontal, Play, Plus, Undo2, X } from "lucide-react";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useId, useState, useTransition } from "react";

import { useDesignBoard } from "../../../_components/board-context";
import { MenuLabel, NobodyOnTheTeam } from "../../../_components/menus";

/** The chips a person taps. Revising goes through Send back, which asks why. */
const TAPPABLE: StepStatus[] = ["working", "with_client", "waiting", "done"];

export function VillaStages({ unitId, steps }: { unitId: string; steps: StepView[] }) {
  const { stages } = useDesignBoard();
  const lite = steps.map((step) => ({ stageId: step.stageId, status: step.status }));
  const nothingStarted = steps.every((step) => step.status === "not_started");

  return (
    <div className="space-y-3">
      {nothingStarted ? <SetWhereItIs unitId={unitId} /> : null}
      <div className="grid items-start gap-3 md:grid-cols-2">
        {steps.map((step) => (
          <StageCard
            key={step.stageId}
            unitId={unitId}
            step={step}
            targets={passTargets(stages, lite, step.stageId)}
          />
        ))}
      </div>
    </div>
  );
}

function StageCard({
  unitId,
  step,
  targets,
}: {
  unitId: string;
  step: StepView;
  targets: { id: string; name: string }[];
}) {
  const { today } = useDesignBoard();
  const undoBar = useUndoBar();
  const [pending, startTransition] = useTransition();
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const started = step.status !== "not_started";
  const status = stepStatus(step.status);

  const setStatus = (next: StepStatus, message: string) =>
    startTransition(async () => {
      const previous = step.status;
      const result = await setStepStatus(unitId, step.stageId, next);
      if (result?.error) {
        undoBar(result.error);
        return;
      }
      // Undo cannot put back a revision (it needs its reason again), so it
      // is offered only for the plain moves.
      undoBar(
        message,
        previous === "revising"
          ? undefined
          : () =>
              startTransition(async () => {
                const back = await setStepStatus(unitId, step.stageId, previous);
                if (back?.error) undoBar(back.error);
              }),
      );
    });

  const since = step.startedOn ? daysBetween(step.startedOn, today) : null;
  const dates = !started
    ? "Not started"
    : step.status === "done" && step.doneOn
      ? `Done ${formatShortDate(step.doneOn)}`
      : step.startedOn
        ? `Started ${formatShortDate(step.startedOn)}${since ? ` · ${since} day${since === 1 ? "" : "s"}` : ""}`
        : "";

  return (
    <Card className={cn("space-y-3 p-4", !started && "bg-surface/60")}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-foreground text-[15px] font-semibold tracking-tight">
            {step.stageName}
          </h3>
          <p className="text-muted text-xs">
            {dates}
            {step.revisions > 0
              ? ` · sent back ${step.revisions} time${step.revisions === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>
        <span className="ml-auto flex items-center gap-1">
          <Pill tone={status.tone}>
            {step.status === "revising"
              ? revisingLabel(step.stageName, step.revisions || 1)
              : status.label}
          </Pill>
          {started ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`More for ${step.stageName}`}
                  className="text-muted hover:bg-foreground/[0.05] focus-visible:ring-accent/25 grid size-7 place-items-center rounded-full focus-visible:ring-4 focus-visible:outline-none"
                >
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuItem
                  onSelect={() => setStatus("not_started", `${step.stageName} start taken back`)}
                >
                  <Undo2 className="size-4" /> Take back the start
                  <span className="text-muted ml-auto text-xs">started by mistake</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </span>
      </div>

      {started ? (
        <>
          {step.status === "revising" && step.reason ? (
            <p className="bg-danger/10 text-danger dark:bg-danger/20 rounded-xl px-3 py-2 text-sm">
              {step.reason}
            </p>
          ) : null}

          <ChoiceChips
            label={`${step.stageName} status`}
            required
            disabled={pending}
            value={TAPPABLE.includes(step.status) ? step.status : null}
            onChange={(next) => {
              if (!next || next === step.status) return;
              const label = STEP_STATUSES.find((option) => option.value === next)?.label ?? next;
              setStatus(next, `${step.stageName}: ${label}`);
            }}
            options={TAPPABLE.map((value) => ({
              value,
              label: stepStatus(value).label,
              good: value === "done",
            }))}
          />

          <StagePeople step={step} />
          <StageNote step={step} />

          <div className="flex flex-wrap gap-2">
            {targets.length > 0 ? (
              <PassDialog unitId={unitId} step={step} targets={targets} />
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => setSendBackOpen(true)}>
              <Undo2 className="size-4" /> Send back for revision
            </Button>
            <ConfirmDialog
              open={sendBackOpen}
              onOpenChange={setSendBackOpen}
              title={`Send ${step.stageName} back for revision?`}
              description="The villa stays where it has got to; this stage shows as Revising until it is done again."
              confirmLabel="Send back"
              pendingLabel="Sending back…"
              tone="primary"
              reason={{ label: "Why?", placeholder: "Client changed the staircase" }}
              onConfirm={async (why) => {
                const result = await setStepStatus(unitId, step.stageId, "revising", why);
                if (!result?.error) undoBar(`${step.stageName} sent back for revision`);
                return result;
              }}
            />
          </div>
        </>
      ) : (
        <StartDialog unitId={unitId} step={step} />
      )}
    </Card>
  );
}

function StagePeople({ step }: { step: StepView }) {
  const { team } = useDesignBoard();
  const undoBar = useUndoBar();
  const [pending, startTransition] = useTransition();
  const stepId = step.stepId;
  if (!stepId) return null;
  const free = team.filter((person) => !step.people.some((on) => on.id === person.id));

  const add = (person: Person) =>
    startTransition(async () => {
      const result = await addStepPerson(stepId, person.id);
      if (result?.error) undoBar(result.error);
      else undoBar(`${person.name.split(" ")[0]} is on ${step.stageName}`);
    });
  const remove = (person: Person) =>
    startTransition(async () => {
      const result = await removeStepPerson(stepId, person.id);
      if (result?.error) {
        undoBar(result.error);
        return;
      }
      undoBar(`${person.name.split(" ")[0]} taken off ${step.stageName}`, () =>
        startTransition(async () => {
          const back = await addStepPerson(stepId, person.id);
          if (back?.error) undoBar(back.error);
        }),
      );
    });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {step.people.length === 0 ? (
        <span className="text-warning text-sm">Nobody on it</span>
      ) : (
        step.people.map((person) => (
          <span
            key={person.id}
            className="border-border bg-surface-raised inline-flex h-8 items-center gap-1.5 rounded-full border pr-1 pl-1"
          >
            <Avatar name={person.name} size={22} letters={2} />
            <span className="text-foreground/80 max-w-28 truncate text-xs font-medium">
              {person.name.split(" ")[0]}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => remove(person)}
              aria-label={`Take ${person.name} off ${step.stageName}`}
              className="text-muted hover:bg-foreground/[0.05] focus-visible:ring-accent/25 grid size-6 place-items-center rounded-full focus-visible:ring-4 focus-visible:outline-none"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <PillButton
            tone="dashed"
            disabled={pending}
            aria-label={`Put someone on ${step.stageName}`}
          >
            <Plus className="size-3.5" /> Add
          </PillButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <MenuLabel>Who else is on {step.stageName}?</MenuLabel>
          {team.length === 0 ? (
            <NobodyOnTheTeam />
          ) : free.length === 0 ? (
            <p className="text-muted px-2.5 py-2 text-sm">Everyone on the team is on it.</p>
          ) : (
            free.map((person) => (
              <DropdownMenuItem key={person.id} onSelect={() => add(person)}>
                <Avatar name={person.name} size={24} letters={2} />
                <span className="truncate">{person.name}</span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function StageNote({ step }: { step: StepView }) {
  const undoBar = useUndoBar();
  const [, startTransition] = useTransition();
  const id = useId();
  const stepId = step.stepId;
  if (!stepId) return null;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="sr-only">
        Note on {step.stageName}
      </label>
      <Textarea
        id={id}
        key={step.note ?? ""}
        defaultValue={step.note ?? ""}
        rows={1}
        maxLength={500}
        placeholder="A note — what it is waiting for, what was agreed…"
        onBlur={(event) => {
          const value = event.currentTarget.value.trim();
          if (value === (step.note ?? "")) return;
          startTransition(async () => {
            const result = await setStepNote(stepId, value);
            undoBar(result?.error ?? "Note saved");
          });
        }}
        className="field-sizing-content min-h-10 text-sm"
      />
    </div>
  );
}

function PeopleChips({
  value,
  onChange,
  label,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  label: string;
}) {
  const { team } = useDesignBoard();
  if (team.length === 0) {
    return (
      <p className="text-muted text-sm">
        Nobody holds Design Management yet — grant it in Settings → People.
      </p>
    );
  }
  return (
    <ChoiceChips
      multiple
      label={label}
      value={value}
      onChange={onChange}
      options={team.map((person) => ({
        value: person.id,
        label: (
          <>
            <Avatar name={person.name} size={20} letters={2} />
            {person.name}
          </>
        ),
      }))}
    />
  );
}

function PassDialog({
  unitId,
  step,
  targets,
}: {
  unitId: string;
  step: StepView;
  targets: { id: string; name: string }[];
}) {
  const undoBar = useUndoBar();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(targets[0].id);
  const [people, setPeople] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const { pending, error, run, clearError } = useActionRunner();
  const noteId = useId();
  const toName = targets.find((target) => target.id === to)?.name ?? targets[0].name;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) {
          clearError();
          setPeople([]);
          setNote("");
          setTo(targets[0].id);
        }
      }}
    >
      <Button size="sm" onClick={() => setOpen(true)}>
        Pass to {targets[0].name} <ArrowRight className="size-4" />
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Pass {step.stageName} on</DialogTitle>
          <DialogDescription>
            {step.status === "done"
              ? `${toName} starts with the people you pick.`
              : `${step.stageName} is marked done and ${toName} starts with the people you pick.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {targets.length > 1 ? (
            <div className="space-y-1.5">
              <Label>To which stage?</Label>
              <ChoiceChips
                label="To which stage"
                required
                value={to}
                onChange={(next) => next && setTo(next)}
                options={targets.map((target) => ({ value: target.id, label: target.name }))}
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label>Who takes {toName}?</Label>
            <PeopleChips value={people} onChange={setPeople} label={`Who takes ${toName}`} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={noteId}>A note for them (optional)</Label>
            <Textarea
              id={noteId}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={500}
              placeholder="Slab levels from the consultant are in the folder"
            />
          </div>
        </div>
        <FormMessage error={error} />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            disabled={pending || people.length === 0}
            onClick={async () => {
              const result = await run(() =>
                passStep({
                  unitId,
                  fromStageId: step.stageId,
                  toStageId: to,
                  peopleIds: people,
                  note,
                }),
              );
              if (result?.error) return;
              setOpen(false);
              undoBar(`Passed to ${toName}`);
            }}
          >
            {pending ? "Passing…" : `Pass to ${toName}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StartDialog({ unitId, step }: { unitId: string; step: StepView }) {
  const undoBar = useUndoBar();
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<string[]>([]);
  const { pending, error, run, clearError } = useActionRunner();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) {
          clearError();
          setPeople([]);
        }
      }}
    >
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Play className="size-4" /> Start {step.stageName}
      </Button>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Start {step.stageName}</DialogTitle>
          <DialogDescription>
            Stages can run side by side — starting this one leaves the others as they are.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label>Who takes it?</Label>
          <PeopleChips value={people} onChange={setPeople} label={`Who takes ${step.stageName}`} />
        </div>
        <FormMessage error={error} />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            disabled={pending || people.length === 0}
            onClick={async () => {
              const result = await run(() => startStep(unitId, step.stageId, people));
              if (result?.error) return;
              setOpen(false);
              undoBar(`${step.stageName} started`);
            }}
          >
            {pending ? "Starting…" : `Start ${step.stageName}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SetWhereItIs({ unitId }: { unitId: string }) {
  const { stages } = useDesignBoard();
  const undoBar = useUndoBar();
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [people, setPeople] = useState<string[]>([]);
  const { pending, error, run, clearError } = useActionRunner();
  const stageName = stages.find((s) => s.id === stage)?.name ?? null;
  const before = stage
    ? stages.slice(
        0,
        stages.findIndex((s) => s.id === stage),
      )
    : [];

  if (stages.length === 0) return null;

  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="text-foreground text-[15px] font-semibold tracking-tight">
          Nothing has started here yet
        </p>
        <p className="text-muted text-sm">
          Already under way? Set the stage it has reached — the ones before it are marked done.
        </p>
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setOpen(next);
          if (!next) {
            clearError();
            setStage(null);
            setPeople([]);
          }
        }}
      >
        <Button onClick={() => setOpen(true)}>Set where it is</Button>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Where is this villa?</DialogTitle>
            <DialogDescription>Pick the stage it is at now and who is on it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>The stage it is at</Label>
              <ChoiceChips
                label="The stage it is at"
                value={stage}
                onChange={setStage}
                options={stages.map((s) => ({ value: s.id, label: s.name }))}
              />
              {before.length > 0 ? (
                <p className="text-muted text-xs">
                  {before.map((s) => s.name).join(", ")} will be marked done.
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label>Who is on {stageName ?? "it"}?</Label>
              <PeopleChips value={people} onChange={setPeople} label="Who is on it" />
            </div>
          </div>
          <FormMessage error={error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              disabled={pending || !stage || people.length === 0}
              onClick={async () => {
                if (!stage) return;
                const result = await run(() => setWhereItIs(unitId, stage, people));
                if (result?.error) return;
                setOpen(false);
                undoBar(`Set at ${stageName}`);
              }}
            >
              {pending ? "Saving…" : stageName ? `Set at ${stageName}` : "Set where it is"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

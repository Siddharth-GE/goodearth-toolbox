"use client";

import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ChoiceChips } from "@/components/ui/choice-chips";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PillButton } from "@/components/ui/pill";
import { SearchSelect } from "@/components/ui/search-select";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUndoBar } from "@/components/ui/undo-bar";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import {
  restoreStage,
  setStageContractor,
  setStageDates,
  setStageStatus,
  setVillaSupervisor,
  type StageSnapshot,
} from "@/lib/supervisors/programme-actions";
import {
  STAGE_STATUS_LABEL,
  WAITING_ON,
  WAITING_ON_LABEL,
  type StageStatus,
  type WaitingOn,
} from "@/lib/supervisors/programme";
import { useState, type ReactNode } from "react";

/** What a status control needs to know about its stage, all plain data from the server. */
export type StageControlData = {
  plotId: string;
  groupId: string;
  code: string;
  name: string;
  snapshot: StageSnapshot;
  contractorId: string | null;
  /** Checklists this stage should be signed off with, by name, and whether each is. */
  checklists: { name: string; signedOff: boolean }[];
};

const MOVES: { value: StageStatus; label: string }[] = [
  { value: "working", label: "Working" },
  { value: "waiting", label: "Waiting" },
  { value: "done", label: "Done" },
];

/**
 * The stage's status in one tap, saved at once with Undo. Waiting asks on what; Done with an unsigned
 * checklist asks once (a nudge, never a block — founder 2026-10-23).
 */
export function StageStatusChips({
  stage,
  withNotStarted = false,
}: {
  stage: StageControlData;
  withNotStarted?: boolean;
}) {
  const { pending, error, run } = useActionRunner();
  const undo = useUndoBar();
  const [asking, setAsking] = useState<"waiting" | "done" | null>(null);
  // Opened from code, so Radix never reports the opening: a new key gives each ask a blank form.
  const [askKey, setAskKey] = useState(0);
  const unsigned = stage.checklists.filter((checklist) => !checklist.signedOff);

  const save = async (status: StageStatus, waitingOn?: WaitingOn, waitingNote?: string) => {
    const result = await run(() =>
      setStageStatus({
        plotId: stage.plotId,
        groupId: stage.groupId,
        status,
        current: stage.snapshot,
        waitingOn,
        waitingNote,
      }),
    );
    if (result?.error) return result;
    undo(`${stage.code} is ${STAGE_STATUS_LABEL[status].toLowerCase()}`, () => {
      void run(() =>
        restoreStage({ plotId: stage.plotId, groupId: stage.groupId, snapshot: stage.snapshot }),
      );
    });
    return undefined;
  };

  const choose = (status: StageStatus | null) => {
    if (!status || status === stage.snapshot.status) return;
    if (status === "waiting") {
      setAskKey((key) => key + 1);
      return setAsking("waiting");
    }
    if (status === "done" && unsigned.length > 0) return setAsking("done");
    void save(status);
  };

  const options = withNotStarted
    ? [{ value: "not_started" as const, label: "Not started" }, ...MOVES]
    : MOVES;

  return (
    <div className="space-y-1.5">
      <ChoiceChips
        label={`${stage.code} status`}
        options={options.map((option) => ({ ...option, good: option.value === "done" }))}
        value={stage.snapshot.status}
        onChange={choose}
        disabled={pending}
        required
      />
      <FormMessage error={error} />
      <WaitingDialog
        key={askKey}
        open={asking === "waiting"}
        onOpenChange={(open) => setAsking(open ? "waiting" : null)}
        stageLabel={`${stage.code} ${stage.name}`}
        onSave={async (on, note) => {
          const result = await save("waiting", on, note);
          if (!result) setAsking(null);
          return result;
        }}
      />
      <ConfirmDialog
        open={asking === "done"}
        onOpenChange={(open) => setAsking(open ? "done" : null)}
        title={`Done without signing off the ${unsigned.map((checklist) => checklist.name).join(" and ")} checklist?`}
        description="The stage can still be marked done. Sign the checklist off on site when you can."
        confirmLabel="Mark done"
        pendingLabel="Saving…"
        tone="primary"
        onConfirm={async () => save("done")}
      />
    </div>
  );
}

function WaitingDialog({
  open,
  onOpenChange,
  stageLabel,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stageLabel: string;
  onSave: (on: WaitingOn, note: string) => Promise<{ error?: string } | undefined>;
}) {
  const [on, setOn] = useState<WaitingOn | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Waiting on what?</DialogTitle>
          <DialogDescription>{stageLabel}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ChoiceChips
            label="Waiting on"
            options={WAITING_ON.map((value) => ({ value, label: WAITING_ON_LABEL[value] }))}
            value={on}
            onChange={setOn}
          />
          <div className="space-y-1.5">
            <Label htmlFor="waiting-note">Note (optional)</Label>
            <Textarea
              id="waiting-note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Steel promised for Thursday"
            />
          </div>
          <FormMessage error={error} />
          <Button
            variant="primary"
            className="w-full"
            disabled={!on || pending}
            onClick={async () => {
              if (!on) return;
              setPending(true);
              const result = await onSave(on, note);
              setPending(false);
              setError(result?.error);
            }}
          >
            {pending ? "Saving…" : "Mark waiting"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The contractor on a stage, saved as soon as it is picked. */
export function StageContractorSelect({
  stage,
  contractors,
  id,
}: {
  stage: StageControlData;
  contractors: { id: string; name: string }[];
  id: string;
}) {
  const { pending, error, run } = useActionRunner();
  return (
    <div className="space-y-1.5">
      <Select
        id={id}
        value={stage.contractorId ?? ""}
        disabled={pending}
        onChange={(event) =>
          run(() =>
            setStageContractor({
              plotId: stage.plotId,
              groupId: stage.groupId,
              contractorId: event.target.value,
            }),
          )
        }
      >
        <option value="">No contractor yet</option>
        {contractors.map((contractor) => (
          <option key={contractor.id} value={contractor.id}>
            {contractor.name}
          </option>
        ))}
      </Select>
      <FormMessage error={error} />
    </div>
  );
}

/** One stage in full: its status (Not started included), contractor and real dates. Opened from the programme. */
export function StageSheet({
  stage,
  contractors,
  trigger,
  waitingLine,
}: {
  stage: StageControlData;
  contractors: { id: string; name: string }[];
  trigger: ReactNode;
  waitingLine: string | null;
}) {
  const { snapshot } = stage;
  const started = snapshot.status !== "not_started";

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{stage.code}</DialogTitle>
          <DialogDescription>{stage.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">Status</p>
            <StageStatusChips stage={stage} withNotStarted />
            {waitingLine ? <p className="text-warning text-xs">{waitingLine}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`contractor-${stage.groupId}`}>Contractor</Label>
            <StageContractorSelect
              stage={stage}
              contractors={contractors}
              id={`contractor-${stage.groupId}`}
            />
          </div>
          {started ? (
            // Keyed on what the server holds, so a status tap in this sheet refills the dates.
            <StageDates
              key={`${snapshot.status}|${snapshot.startedOn}|${snapshot.finishedOn}`}
              stage={stage}
            />
          ) : (
            <p className="text-muted text-xs">
              The first labour logged on this stage starts it by itself.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StageDates({ stage }: { stage: StageControlData }) {
  const { snapshot } = stage;
  const { pending, error, run } = useActionRunner();
  const [startedOn, setStartedOn] = useState(snapshot.startedOn ?? "");
  const [finishedOn, setFinishedOn] = useState(snapshot.finishedOn ?? "");
  const done = snapshot.status === "done";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`started-${stage.groupId}`}>Started</Label>
          <Input
            id={`started-${stage.groupId}`}
            type="date"
            value={startedOn}
            onChange={(event) => setStartedOn(event.target.value)}
          />
        </div>
        {done ? (
          <div className="space-y-1.5">
            <Label htmlFor={`finished-${stage.groupId}`}>Finished</Label>
            <Input
              id={`finished-${stage.groupId}`}
              type="date"
              value={finishedOn}
              onChange={(event) => setFinishedOn(event.target.value)}
            />
          </div>
        ) : null}
      </div>
      <FormMessage error={error} />
      <Button
        variant="secondary"
        size="sm"
        disabled={
          pending ||
          !startedOn ||
          (done && !finishedOn) ||
          (startedOn === (snapshot.startedOn ?? "") && finishedOn === (snapshot.finishedOn ?? ""))
        }
        onClick={() =>
          run(() =>
            setStageDates({
              plotId: stage.plotId,
              groupId: stage.groupId,
              startedOn,
              finishedOn: done ? finishedOn : "",
            }),
          )
        }
      >
        {pending ? "Saving…" : "Save the dates"}
      </Button>
    </div>
  );
}

/** Who runs the villa: a face and a name, tapped to change. A filter for the board, never a permission. */
export function SupervisorPicker({
  plotId,
  supervisor,
  people,
}: {
  plotId: string;
  supervisor: { id: string; name: string } | null;
  people: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(supervisor?.id ?? "");
  const { pending, error, run } = useActionRunner();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setChosen(supervisor?.id ?? "");
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <PillButton
          tone={supervisor ? "plain" : "dashed"}
          aria-label={supervisor ? `Run by ${supervisor.name} — change` : "Who runs this villa?"}
        >
          {supervisor ? (
            <>
              <Avatar name={supervisor.name} size={18} letters={2} />
              {supervisor.name}
            </>
          ) : (
            "Who runs it?"
          )}
        </PillButton>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Who runs this villa?</DialogTitle>
          <DialogDescription>
            The board&apos;s Mine shows them this villa. Everyone still sees every villa.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <SearchSelect
            options={people.map((person) => ({ value: person.id, label: person.name }))}
            value={chosen}
            onChange={setChosen}
            placeholder="Type a name…"
          />
          <FormMessage error={error} />
          <div className="flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              disabled={pending || !chosen || chosen === supervisor?.id}
              onClick={async () => {
                const result = await run(() =>
                  setVillaSupervisor({ plotId, supervisorId: chosen }),
                );
                if (!result?.error) setOpen(false);
              }}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
            {supervisor ? (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={async () => {
                  const result = await run(() => setVillaSupervisor({ plotId, supervisorId: "" }));
                  if (!result?.error) setOpen(false);
                }}
              >
                Nobody
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

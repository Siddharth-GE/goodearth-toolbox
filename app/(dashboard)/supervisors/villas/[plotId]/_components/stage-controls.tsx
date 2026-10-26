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
  setStageFollows,
  setStageNeeded,
  setStageOwner,
  setStagePlan,
  setStageStatus,
  setVillaSupervisor,
  type StageSnapshot,
} from "@/lib/supervisors/programme-actions";
import {
  dayInIndia,
  STAGE_STATUS_LABEL,
  WAITING_ON,
  WAITING_ON_LABEL,
  type StageStatus,
  type WaitingOn,
} from "@/lib/supervisors/programme";
import {
  SEQUENCE_LINK_LABEL,
  SEQUENCE_LINKS,
  type DaysSource,
  type SequenceLink,
} from "@/lib/supervisors/schedule";
import { formatShortDate } from "@/lib/format";
import { useState, type ReactNode } from "react";

/** What a status control needs to know about its stage, all plain data from the server. */
export type StageControlData = {
  plotId: string;
  groupId: string;
  code: string;
  name: string;
  snapshot: StageSnapshot;
  contractorId: string | null;
  /** Its owner: this villa's own pick, else the category's lead (0158). */
  owner: { id: string; name: string; fromLead: boolean } | null;
  /** Checklists this stage should be signed off with, by name, and whether each is. */
  checklists: { name: string; signedOff: boolean }[];
  /** The schedule: this villa's own days and pinned start, and the days and dates the forecast uses. */
  plan: {
    ownDays: number | null;
    pinnedStart: string | null;
    days: number | null;
    source: DaysSource | null;
    learnedFrom: number | null;
    start: string | null;
    finish: string | null;
    pinnedBehind: boolean;
  };
  /** What it follows on this villa: its own choice, or the sequence's. */
  follows: {
    own: { followsGroupId: string; link: SequenceLink } | null;
    sequenceLabel: string | null;
    sequenceLink: SequenceLink;
    inSequence: boolean;
  };
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

/** Who owns the stage on this villa: its own pick, or the work category's lead (set on Supervisors → Sequence). */
export function StageOwnerSelect({
  stage,
  people,
  id,
}: {
  stage: StageControlData;
  people: { id: string; name: string }[];
  id: string;
}) {
  const { pending, error, run } = useActionRunner();
  const own = stage.owner && !stage.owner.fromLead ? stage.owner.id : "";
  const lead = stage.owner?.fromLead ? stage.owner.name : null;
  return (
    <div className="space-y-1.5">
      <Select
        id={id}
        value={own}
        disabled={pending}
        onChange={(event) =>
          run(() =>
            setStageOwner({
              plotId: stage.plotId,
              groupId: stage.groupId,
              ownerId: event.target.value,
            }),
          )
        }
      >
        <option value="">{lead ? `The category lead, ${lead}` : "No owner yet"}</option>
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
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
  people,
  trigger,
  waitingLine,
  otherStages,
}: {
  stage: StageControlData;
  contractors: { id: string; name: string }[];
  /** Everyone who may own the stage; without it the sheet shows no owner picker. */
  people?: { id: string; name: string }[];
  trigger: ReactNode;
  waitingLine: string | null;
  /** The villa's other stages, for "on this villa it follows". */
  otherStages?: { id: string; label: string }[];
}) {
  const { snapshot } = stage;
  const started = snapshot.status !== "not_started";
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
          {people ? (
            <div className="space-y-1.5">
              <Label htmlFor={`owner-${stage.groupId}`}>Owner</Label>
              <StageOwnerSelect stage={stage} people={people} id={`owner-${stage.groupId}`} />
            </div>
          ) : null}
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
          {snapshot.status !== "done" ? <StagePlanFields stage={stage} /> : null}
          {otherStages ? (
            <StageVillaOrder
              stage={stage}
              otherStages={otherStages}
              onLeftOff={() => setOpen(false)}
            />
          ) : null}
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

const SOURCE_LABEL: Record<DaysSource, string> = {
  own: "set for this villa",
  learned: "learned",
  typical: "typical",
};

/** How long the stage takes on this villa, and a start fixed by hand. Blank goes back to the sequence's days and chain. */
function StagePlanFields({ stage }: { stage: StageControlData }) {
  const { plan } = stage;
  const notStarted = !stage.snapshot.startedOn;
  const [days, setDays] = useState(plan.ownDays ? String(plan.ownDays) : "");
  const [pinned, setPinned] = useState(plan.pinnedStart ?? "");
  // The fields follow what the server holds once it changes, without remounting away the "Saved".
  const held = `${plan.ownDays}|${plan.pinnedStart}`;
  const [seen, setSeen] = useState(held);
  if (seen !== held) {
    setSeen(held);
    setDays(plan.ownDays ? String(plan.ownDays) : "");
    setPinned(plan.pinnedStart ?? "");
  }
  const lapsed = Boolean(
    plan.pinnedStart && plan.pinnedStart < dayInIndia(new Date().toISOString()),
  );
  const { pending, error, run } = useActionRunner();
  const [saved, setSaved] = useState(false);
  const usedDays =
    plan.days === null
      ? "No days yet — set typical days under Sequence, or this villa's own here."
      : `Using ${plan.days} ${plan.days === 1 ? "day" : "days"} (${SOURCE_LABEL[plan.source!]}${plan.source === "learned" && plan.learnedFrom ? ` from ${plan.learnedFrom} villas` : ""})${plan.start && plan.finish ? ` · ${formatShortDate(plan.start)} – ${formatShortDate(plan.finish)}` : ""}.`;

  return (
    <div className="space-y-3">
      <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">Schedule</p>
      <p className="text-muted text-xs">{usedDays}</p>
      {plan.pinnedBehind && plan.pinnedStart ? (
        <p className="text-warning text-xs">
          {lapsed && plan.start && plan.start === dayInIndia(new Date().toISOString())
            ? `${formatShortDate(plan.pinnedStart)} has passed — save it to mark the stage started then, or tap Working.`
            : `Set to start ${formatShortDate(plan.pinnedStart)}, but the stages before it run until ${formatShortDate(plan.start)}.`}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`days-${stage.groupId}`}>Days on this villa</Label>
          <Input
            id={`days-${stage.groupId}`}
            type="number"
            inputMode="numeric"
            min={1}
            value={days}
            placeholder={plan.days && plan.source !== "own" ? String(plan.days) : "Not set"}
            onChange={(event) => setDays(event.target.value)}
          />
        </div>
        {notStarted ? (
          <div className="space-y-1.5">
            <Label htmlFor={`pinned-${stage.groupId}`}>Starts on</Label>
            <Input
              id={`pinned-${stage.groupId}`}
              type="date"
              value={pinned}
              onChange={(event) => setPinned(event.target.value)}
            />
          </div>
        ) : null}
      </div>
      {notStarted ? (
        <p className="text-muted text-xs">
          A day that has passed marks the stage started then. Leave it blank to follow the stages
          before it.
        </p>
      ) : null}
      <FormMessage error={error} success={saved && !pending ? "Saved" : undefined} />
      <Button
        variant="secondary"
        size="sm"
        disabled={
          pending ||
          (days === (plan.ownDays ? String(plan.ownDays) : "") &&
            pinned === (plan.pinnedStart ?? ""))
        }
        onClick={() =>
          run(() =>
            setStagePlan({
              plotId: stage.plotId,
              groupId: stage.groupId,
              days,
              pinnedStart: pinned,
            }),
          ).then((result) => setSaved(!result?.error))
        }
      >
        {pending ? "Saving…" : "Save the schedule"}
      </Button>
    </div>
  );
}

/**
 * This villa's own say on the stage: what it follows here instead of the sequence, and leaving it off altogether. Every other
 * villa keeps the sequence.
 */
function StageVillaOrder({
  stage,
  otherStages,
  onLeftOff,
}: {
  stage: StageControlData;
  otherStages: { id: string; label: string }[];
  onLeftOff: () => void;
}) {
  const { own, sequenceLabel, sequenceLink, inSequence } = stage.follows;
  const [follows, setFollows] = useState(own?.followsGroupId ?? "");
  const [link, setLink] = useState<SequenceLink>(own?.link ?? "after");
  const { pending, error, run } = useActionRunner();
  const [saved, setSaved] = useState(false);
  const unchanged =
    follows === (own?.followsGroupId ?? "") && (!follows || link === (own?.link ?? "after"));
  const sequenceSays = !inSequence
    ? "As the list: after the stage before it"
    : sequenceLabel
      ? `As the sequence: ${sequenceLink === "alongside" ? "alongside" : "after"} ${sequenceLabel.split(" ")[0]}`
      : "As the sequence: first";

  return (
    <div className="border-border space-y-3 border-t pt-4">
      <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
        On this villa
      </p>
      <div className="space-y-1.5">
        <Label htmlFor={`follows-${stage.groupId}`}>Follows</Label>
        <Select
          id={`follows-${stage.groupId}`}
          value={follows}
          onChange={(event) => setFollows(event.target.value)}
        >
          <option value="">{sequenceSays}</option>
          {otherStages.map((other) => (
            <option key={other.id} value={other.id}>
              {other.label}
            </option>
          ))}
        </Select>
      </div>
      {follows ? (
        <ChoiceChips
          label="How"
          options={SEQUENCE_LINKS.map((value) => ({ value, label: SEQUENCE_LINK_LABEL[value] }))}
          value={link}
          onChange={(value) => value && setLink(value)}
          required
        />
      ) : null}
      <FormMessage error={error} success={saved && !pending ? "Saved" : undefined} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={pending || unchanged}
          onClick={() =>
            run(() =>
              setStageFollows({
                plotId: stage.plotId,
                groupId: stage.groupId,
                followsGroupId: follows,
                link,
              }),
            ).then((result) => setSaved(!result?.error))
          }
        >
          {pending ? "Saving…" : "Save the order"}
        </Button>
        {stage.snapshot.status === "not_started" ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={async () => {
              const result = await run(() =>
                setStageNeeded({ plotId: stage.plotId, groupId: stage.groupId, needed: false }),
              );
              if (!result?.error) onLeftOff();
            }}
          >
            Not needed on this villa
          </Button>
        ) : null}
      </div>
      <p className="text-muted text-xs">
        Only this villa changes. A stage left off is listed under Every stage, to bring back.
      </p>
    </div>
  );
}

/**
 * Every stage of this villa in one list, each with what it follows here, to change its order or leave it off — and the stages
 * left off, to bring back. Only this villa changes.
 */
export function ArrangeStagesDialog({
  plotId,
  stages,
  leftOff,
}: {
  plotId: string;
  stages: StageControlData[];
  leftOff: { id: string; code: string; name: string }[];
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const codeOf = new Map(stages.map((stage) => [stage.groupId, stage.code]));
  const followsLine = (stage: StageControlData) => {
    const { own, sequenceLabel, sequenceLink, inSequence } = stage.follows;
    if (own) {
      return `${own.link === "alongside" ? "Alongside" : "After"} ${codeOf.get(own.followsGroupId) ?? "another stage"} · this villa only`;
    }
    if (!inSequence) return "After the stage before it";
    return sequenceLabel
      ? `${sequenceLink === "alongside" ? "Alongside" : "After"} ${sequenceLabel.split(" ")[0]}`
      : "First";
  };
  return (
    <Dialog onOpenChange={(open) => !open && setEditing(null)}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          Arrange stages
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>This villa&apos;s stages</DialogTitle>
          <DialogDescription>
            Change what a stage follows on this villa, or leave it off. Other villas keep the
            sequence.
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-border -mx-1 divide-y">
          {stages.map((stage) => (
            <li key={stage.groupId} className="px-1 py-2">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-foreground truncate text-sm font-medium">
                    <span className="text-muted font-mono text-xs">{stage.code}</span> {stage.name}
                  </p>
                  <p
                    className={`truncate text-xs ${stage.follows.own ? "text-accent" : "text-muted"}`}
                  >
                    {`${followsLine(stage)} · ${STAGE_STATUS_LABEL[stage.snapshot.status]}`}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(editing === stage.groupId ? null : stage.groupId)}
                >
                  {editing === stage.groupId ? "Close" : "Change"}
                </Button>
              </div>
              {editing === stage.groupId ? (
                <StageVillaOrder
                  stage={stage}
                  otherStages={stages
                    .filter((other) => other.groupId !== stage.groupId)
                    .map((other) => ({ id: other.groupId, label: `${other.code} ${other.name}` }))}
                  onLeftOff={() => setEditing(null)}
                />
              ) : null}
            </li>
          ))}
        </ul>
        {leftOff.length > 0 ? (
          <div className="space-y-1">
            <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
              Not needed on this villa
            </p>
            <ul className="divide-border divide-y">
              {leftOff.map((stage) => (
                <li key={stage.id} className="flex items-center gap-2 py-1.5">
                  <span className="text-muted min-w-0 flex-1 truncate text-sm">
                    <span className="font-mono text-xs">{stage.code}</span> {stage.name}
                  </span>
                  <BringBackButton plotId={plotId} groupId={stage.id} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/** Puts a stage left off this villa back in its programme. */
export function BringBackButton({ plotId, groupId }: { plotId: string; groupId: string }) {
  const { pending, error, run } = useActionRunner();
  return (
    <div className="flex flex-col items-end">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run(() => setStageNeeded({ plotId, groupId, needed: true }))}
      >
        {pending ? "Bringing back…" : "Bring back"}
      </Button>
      <FormMessage error={error} />
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

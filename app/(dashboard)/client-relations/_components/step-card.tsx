"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { closeRight, dueLabel, ownerOfSide, type DueTone } from "@/lib/client-relations/next-steps";
import { updateNextStep, type StepPatch } from "@/lib/client-relations/next-steps-actions";
import type { NextStep } from "@/lib/client-relations/next-steps-queries";
import { ACTION_STATUSES, ACTION_TRACKS, optionFor } from "@/lib/client-relations/stages";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CalendarDays, Check, MoreHorizontal, StickyNote } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { useBoard } from "./board-context";
import { useUndoBar } from "@/components/ui/undo-bar";
import { Pill, PillButton, PersonName, PlotChip, type PillTone } from "@/components/ui/pill";
import { SideIcon, SideMark, sideLabel } from "./side-mark";
import { DueMenu, MenuCheck, MenuLabel, OwnerMenu, PlotList } from "./step-menus";

const DUE_TONE: Record<DueTone, PillTone> = {
  danger: "danger",
  info: "info",
  neutral: "plain",
  success: "success",
};

export function StepCard({
  step,
  showPlot = true,
  hideWhenDone = false,
}: {
  step: NextStep;
  showPlot?: boolean;
  /** On the Actions list a ticked card leaves; on a plot's page it stays, struck through. */
  hideWhenDone?: boolean;
}) {
  const { today, meId, isManager, team } = useBoard();
  const toast = useUndoBar();
  const [, startTransition] = useTransition();
  // The tick shows at once; the guess is dropped when the saved status moves, so the card ends on the server's word.
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [seenStatus, setSeenStatus] = useState(step.status);
  if (seenStatus !== step.status) {
    setSeenStatus(step.status);
    setOptimistic(null);
  }
  const [notesOpen, setNotesOpen] = useState(false);
  const [moreMode, setMoreMode] = useState<"menu" | "move">("menu");

  const status = optimistic ?? step.status;
  const done = status === "done";
  const finished = status === "awaiting_confirmation";
  const due = dueLabel({ ...step, status }, today);
  const urgent = !done && !finished && (due.tone === "danger" || status === "waiting_management");
  // Only the setter or a manager closes it; its owner marks it finished (0121).
  const right = closeRight(step, { id: meId, isManager });
  const setter = step.createdBy === meId ? "you" : step.setterName.split(" ")[0];

  const save = (patch: StepPatch, message?: string, undo?: StepPatch) =>
    startTransition(async () => {
      const result = await updateNextStep(step.id, patch);
      if (result?.error) {
        setOptimistic(null);
        toast(result.error);
        return;
      }
      if (message) {
        toast(
          message,
          undo
            ? () =>
                startTransition(async () => {
                  const back = await updateNextStep(step.id, undo);
                  if (back?.error) toast(back.error);
                })
            : undefined,
        );
      }
    });

  const tick = () => {
    if (done) {
      if (right !== "close") return;
      setOptimistic("open");
      save({ status: "open" }, "Back on the list");
    } else if (right === "close") {
      setOptimistic("done");
      save({ status: "done" }, "Marked done", { status: step.status });
    } else if (right === "finish" && finished) {
      setOptimistic("open");
      save({ status: "open" }, "Taken back — still yours");
    } else if (right === "finish") {
      setOptimistic("awaiting_confirmation");
      save({ status: "awaiting_confirmation" }, `Sent to ${setter} to confirm`, {
        status: step.status,
      });
    }
  };
  const locked = right === "none" || (done && right !== "close");
  const tickLabel = locked
    ? done
      ? `Closed by ${setter}`
      : `Only ${setter} or a manager can close this`
    : done
      ? "Open it again"
      : right === "close"
        ? finished
          ? "Confirm it is done"
          : "Mark done"
        : finished
          ? "Take it back — not finished yet"
          : `Mark finished — ${setter} confirms`;

  if (hideWhenDone && done) return null;

  const statusOption = optionFor(ACTION_STATUSES, step.status);
  const stamp = `${step.stamp.edited ? "Edited" : "Added"} ${formatShortDate(step.stamp.on)}${
    step.stamp.by ? ` by ${step.stamp.by}` : ""
  }`;

  return (
    <article
      className={cn(
        "border-border bg-surface grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-2xl border px-3 pt-3 pb-2.5",
        done && "bg-surface/60",
      )}
    >
      <button
        type="button"
        onClick={tick}
        disabled={locked}
        aria-label={tickLabel}
        title={tickLabel}
        className="group focus-visible:ring-accent/25 -m-1.5 grid size-9 place-items-center rounded-full focus-visible:ring-4 focus-visible:outline-none disabled:cursor-not-allowed"
      >
        <span
          className={cn(
            "grid size-6 place-items-center rounded-full border-2",
            done
              ? "border-success bg-success text-success-foreground"
              : finished
                ? "border-success bg-success/10 text-success"
                : locked
                  ? "border-foreground/15 border-dashed text-transparent"
                  : urgent
                    ? "border-danger group-hover:text-danger text-transparent"
                    : "border-foreground/25 group-hover:border-success group-hover:text-success text-transparent",
          )}
        >
          <Check className="size-3.5" strokeWidth={3} />
        </span>
      </button>

      <StepText step={step} done={done} onSave={(action) => save({ action })} />

      <div className="col-start-2 mt-1.5 flex flex-wrap items-center gap-1.5">
        {showPlot ? (
          step.plot ? (
            <PlotChip
              number={step.plot.number}
              clientName={step.plot.clientName}
              href={`/client-relations/plots/${step.plot.engagementId}`}
            />
          ) : step.engagementId ? (
            // On a plot this viewer does not see (0123) — say so, never "General".
            <Pill tone="dashed">A colleague&apos;s plot</Pill>
          ) : (
            <Pill tone="dashed">General</Pill>
          )
        ) : null}

        <DueMenu
          value={step.dueOn}
          onPick={(date) =>
            save(
              { dueOn: date },
              date ? `Due ${formatShortDate(date)}` : "Date cleared",
              step.dueAssumed ? undefined : { dueOn: step.dueOn },
            )
          }
        >
          <PillButton tone={DUE_TONE[due.tone]} aria-label={`Due: ${due.text}. Change the date`}>
            <CalendarDays className="size-3.5 shrink-0" />
            <span className="truncate">{due.text}</span>
          </PillButton>
        </DueMenu>

        {step.engagementId ? (
          // On a plot a step is its side's owner's (0125): shown, not picked; a closed step keeps who did it.
          <span
            title={
              done
                ? undefined
                : `Every ${sideLabel(step.track).toLowerCase()} step on this plot is its owner's. Change the owner on the plot to hand them over.`
            }
          >
            <Pill>
              <PersonName name={step.ownerName} />
              {step.ownerId === meId ? <span className="text-muted">· you</span> : null}
            </Pill>
          </span>
        ) : (
          <OwnerMenu
            value={step.ownerId}
            onPick={(ownerId) => {
              if (ownerId === step.ownerId) return;
              const name = team.find((person) => person.id === ownerId)?.name.split(" ")[0];
              save({ ownerId }, name ? `Given to ${name}` : "Owner changed", {
                ownerId: step.ownerId,
              });
            }}
          >
            <PillButton aria-label={`Owner: ${step.ownerName}. Hand it to someone else`}>
              <PersonName name={step.ownerName} />
              {step.ownerId === meId ? <span className="text-muted">· you</span> : null}
            </PillButton>
          </OwnerMenu>
        )}

        {step.track === "kaadal" ? (
          <Pill tone="info">
            <SideMark track="kaadal" />
          </Pill>
        ) : null}
        {step.status === "waiting_client" || step.status === "waiting_management" ? (
          <Pill tone={step.status === "waiting_management" ? "ink" : "warning"}>
            {statusOption?.label}
          </Pill>
        ) : null}
        {finished ? <Pill tone="success">Waiting for {setter} to confirm</Pill> : null}

        {step.notes && !notesOpen ? (
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            aria-label="Show notes"
            title="Show notes"
            className="text-muted hover:bg-foreground/[0.05] focus-visible:ring-accent/25 grid size-7 place-items-center rounded-full focus-visible:ring-4 focus-visible:outline-none"
          >
            <StickyNote className="size-4" />
          </button>
        ) : null}

        <DropdownMenu onOpenChange={(open) => !open && setMoreMode("menu")}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More: status, side, notes, plot"
              title="Status, side, notes, plot"
              className="text-muted hover:bg-foreground/[0.05] focus-visible:ring-accent/25 grid size-7 place-items-center rounded-full focus-visible:ring-4 focus-visible:outline-none"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            {moreMode === "move" ? (
              <>
                <MenuLabel>Move to which plot?</MenuLabel>
                <PlotList
                  current={step.engagementId}
                  onPick={(engagementId) =>
                    save({ engagementId }, "Moved", { engagementId: step.engagementId })
                  }
                />
              </>
            ) : (
              <>
                <MenuLabel>Status</MenuLabel>
                {ACTION_STATUSES.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    // Closing is the setter's or a manager's; marking finished is its owner's (0121).
                    disabled={
                      ((option.value === "done" || step.status === "done") && right !== "close") ||
                      (option.value === "awaiting_confirmation" && right !== "finish")
                    }
                    className="data-[disabled]:opacity-45"
                    onSelect={() => {
                      if (option.value === step.status) return;
                      save(
                        { status: option.value },
                        option.value === "waiting_management"
                          ? "Flagged for management"
                          : option.value === "done"
                            ? "Marked done"
                            : `Status: ${option.label}`,
                        { status: step.status },
                      );
                    }}
                  >
                    <span>{option.label}</span>
                    {option.value === "waiting_management" ? (
                      <span className="text-muted ml-auto text-xs">a manager clears it</span>
                    ) : null}
                    <MenuCheck on={step.status === option.value} />
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <MenuLabel>Side</MenuLabel>
                {ACTION_TRACKS.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    onSelect={() => {
                      if (option.value === step.track) return;
                      // On a plot it goes to that side's owner (0125) — say who.
                      const to = step.plot ? ownerOfSide(step.plot, option.value) : null;
                      const name = team.find((person) => person.id === to)?.name.split(" ")[0];
                      save(
                        { track: option.value },
                        name
                          ? `Moved to ${option.label} · ${name}'s now`
                          : `Moved to ${option.label}`,
                        { track: step.track },
                      );
                    }}
                  >
                    <SideIcon track={option.value} className="text-muted" />
                    <span>{option.label}</span>
                    <MenuCheck on={step.track === option.value} />
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setNotesOpen((open) => !open)}>
                  {notesOpen ? "Hide notes" : step.notes ? "Show notes" : "Add notes"}
                </DropdownMenuItem>
                {step.plot && showPlot ? (
                  <DropdownMenuItem asChild>
                    <Link href={`/client-relations/plots/${step.plot.engagementId}`}>
                      Open plot {step.plot.number}
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    setMoreMode("move");
                  }}
                >
                  Move to another plot…
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-muted ml-auto pl-1 text-[11px] whitespace-nowrap max-sm:w-full max-sm:pl-0">
          {stamp}
        </span>
      </div>

      {notesOpen ? <StepNotes step={step} onSave={(notes) => save({ notes })} /> : null}
    </article>
  );
}

function StepText({
  step,
  done,
  onSave,
}: {
  step: NextStep;
  done: boolean;
  onSave: (action: string) => void;
}) {
  const toast = useUndoBar();
  return (
    <textarea
      key={step.action}
      defaultValue={step.action}
      rows={1}
      aria-label="Action"
      maxLength={500}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.currentTarget.value = step.action;
          event.currentTarget.blur();
        }
      }}
      onBlur={(event) => {
        const value = event.currentTarget.value.trim();
        if (value === step.action) return;
        if (!value) {
          event.currentTarget.value = step.action;
          toast("An action needs some words. Tick it done instead.");
          return;
        }
        onSave(value);
      }}
      className={cn(
        "text-foreground hover:bg-foreground/[0.03] focus:bg-surface-raised focus:ring-accent/15 -ml-1 field-sizing-content min-h-6 w-full resize-none rounded-lg border-0 bg-transparent px-1 py-0.5 text-[15px] leading-snug font-medium focus:ring-4 focus:outline-none",
        done && "text-muted line-through",
      )}
    />
  );
}

function StepNotes({ step, onSave }: { step: NextStep; onSave: (notes: string) => void }) {
  return (
    <div className="col-start-2 mt-2">
      <Textarea
        key={step.notes ?? ""}
        autoFocus={!step.notes}
        defaultValue={step.notes ?? ""}
        aria-label="Notes"
        placeholder="Call outcome, what the client said, what was promised…"
        maxLength={4000}
        onBlur={(event) => {
          const value = event.currentTarget.value.trim();
          if (value !== (step.notes ?? "")) onSave(value);
        }}
        className="min-h-20 text-sm"
      />
    </div>
  );
}

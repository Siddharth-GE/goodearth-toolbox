"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Pill, PillButton, PersonName, PlotChip, type PillTone } from "@/components/ui/pill";
import { DeleteOrCancel } from "@/components/ui/delete-or-cancel";
import { Textarea } from "@/components/ui/textarea";
import { useUndoBar } from "@/components/ui/undo-bar";
import {
  cancelDesignAction,
  deleteDesignAction,
  updateDesignAction,
  type DesignActionPatch,
} from "@/lib/design-management/board-actions";
import type { DesignAction } from "@/lib/design-management/board-queries";
import { formatShortDate } from "@/lib/format";
import {
  ACTION_STATUSES,
  actionRemoval,
  closeRight,
  dueLabel,
  type DueTone,
} from "@/lib/next-steps/rules";
import { cn } from "@/lib/utils";
import { CalendarDays, Check, Layers, MoreHorizontal, StickyNote, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import { useDesignBoard } from "./board-context";
import { DueMenu, MenuCheck, MenuLabel, OwnerMenu, StageMenu, VillaList } from "./menus";

const DUE_TONE: Record<DueTone, PillTone> = {
  danger: "danger",
  info: "info",
  neutral: "plain",
  success: "success",
};

export function ActionCard({
  action,
  showVilla = true,
  hideWhenDone = false,
}: {
  action: DesignAction;
  showVilla?: boolean;
  /** On the Actions list a ticked card leaves; on a villa's page it stays, struck through. */
  hideWhenDone?: boolean;
}) {
  const { today, meId, isManager, team } = useDesignBoard();
  const undoBar = useUndoBar();
  const [, startTransition] = useTransition();
  // The tick shows at once; the guess is dropped when the saved status moves, so the card ends on the server's word.
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [seenStatus, setSeenStatus] = useState(action.status);
  if (seenStatus !== action.status) {
    setSeenStatus(action.status);
    setOptimistic(null);
  }
  const [notesOpen, setNotesOpen] = useState(false);
  const [moreMode, setMoreMode] = useState<"menu" | "move">("menu");
  const [removing, setRemoving] = useState(false);

  const status = optimistic ?? action.status;
  const done = status === "done";
  const finished = status === "awaiting_confirmation";
  const due = dueLabel({ ...action, status }, today);
  const urgent = !done && !finished && (due.tone === "danger" || status === "waiting_management");
  // Only the setter or a manager closes it; its owner marks it finished (0126).
  const right = closeRight(action, { id: meId, isManager });
  const setter = action.createdBy === meId ? "you" : action.setterName.split(" ")[0];

  const save = (patch: DesignActionPatch, message?: string, undo?: DesignActionPatch) =>
    startTransition(async () => {
      const result = await updateDesignAction(action.id, patch);
      if (result?.error) {
        setOptimistic(null);
        undoBar(result.error);
        return;
      }
      if (message) {
        undoBar(
          message,
          undo
            ? () =>
                startTransition(async () => {
                  const back = await updateDesignAction(action.id, undo);
                  if (back?.error) undoBar(back.error);
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
      save({ status: "done" }, "Marked done", { status: action.status });
    } else if (right === "finish" && finished) {
      setOptimistic("open");
      save({ status: "open" }, "Taken back — still yours");
    } else if (right === "finish") {
      setOptimistic("awaiting_confirmation");
      save({ status: "awaiting_confirmation" }, `Sent to ${setter} to confirm`, {
        status: action.status,
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

  if (action.cancelled) {
    const { reason, by } = action.cancelled;
    return (
      <article className="border-border bg-surface/60 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-2xl border px-3 pt-3 pb-2.5">
        <span className="-m-1.5 grid size-9 place-items-center" title="Cancelled">
          <span className="border-foreground/15 text-muted grid size-6 place-items-center rounded-full border-2">
            <X className="size-3.5" strokeWidth={3} />
          </span>
        </span>
        <p className="text-muted px-1 py-0.5 text-[15px] leading-snug font-medium line-through">
          {action.action}
        </p>
        <div className="col-start-2 mt-1.5 flex flex-wrap items-center gap-1.5">
          {showVilla && action.villa ? (
            <PlotChip
              number={action.villa.number}
              clientName={action.villa.clientName}
              href={`/design-management/villas/${action.villa.unitId}`}
            />
          ) : null}
          <Pill>
            Cancelled{action.doneOn ? ` ${formatShortDate(action.doneOn)}` : ""}
            {by ? ` by ${by}` : ""}
          </Pill>
          <span className="text-muted text-sm">{reason}</span>
        </div>
      </article>
    );
  }
  const removal = actionRemoval(action, { id: meId, isManager });

  const statusLabel = ACTION_STATUSES.find((option) => option.value === action.status)?.label;
  const stamp = `${action.stamp.edited ? "Edited" : "Added"} ${formatShortDate(action.stamp.on)}${
    action.stamp.by ? ` by ${action.stamp.by}` : ""
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

      <ActionText action={action} done={done} onSave={(text) => save({ action: text })} />

      <div className="col-start-2 mt-1.5 flex flex-wrap items-center gap-1.5">
        {showVilla ? (
          action.villa ? (
            <PlotChip
              number={action.villa.number}
              clientName={action.villa.clientName}
              href={`/design-management/villas/${action.villa.unitId}`}
            />
          ) : (
            <Pill tone="dashed">General</Pill>
          )
        ) : null}

        <StageMenu
          value={action.stageId}
          onPick={(stageId) =>
            stageId !== action.stageId &&
            save({ stageId }, stageId ? "Stage set" : "Stage cleared", {
              stageId: action.stageId,
            })
          }
        >
          <PillButton
            tone={action.stageName ? "plain" : "dashed"}
            aria-label={`Stage: ${action.stageName ?? "none"}. Change it`}
          >
            <Layers className="size-3.5 shrink-0" />
            <span className="truncate">{action.stageName ?? "Stage"}</span>
          </PillButton>
        </StageMenu>

        <DueMenu
          value={action.dueOn}
          onPick={(date) =>
            save({ dueOn: date }, date ? `Due ${formatShortDate(date)}` : "Date cleared", {
              dueOn: action.dueOn,
            })
          }
        >
          <PillButton tone={DUE_TONE[due.tone]} aria-label={`Due: ${due.text}. Change the date`}>
            <CalendarDays className="size-3.5 shrink-0" />
            <span className="truncate">{due.text}</span>
          </PillButton>
        </DueMenu>

        <OwnerMenu
          value={action.ownerId}
          onPick={(ownerId) => {
            if (ownerId === action.ownerId) return;
            const name = team.find((person) => person.id === ownerId)?.name.split(" ")[0];
            save({ ownerId }, name ? `Given to ${name}` : "Owner changed", {
              ownerId: action.ownerId,
            });
          }}
        >
          <PillButton aria-label={`Owner: ${action.ownerName}. Hand it to someone else`}>
            <PersonName name={action.ownerName} />
            {action.ownerId === meId ? <span className="text-muted">· you</span> : null}
          </PillButton>
        </OwnerMenu>

        {action.status === "waiting_client" || action.status === "waiting_management" ? (
          <Pill tone={action.status === "waiting_management" ? "ink" : "warning"}>
            {statusLabel}
          </Pill>
        ) : null}
        {finished ? <Pill tone="success">Waiting for {setter} to confirm</Pill> : null}

        {action.notes && !notesOpen ? (
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
              aria-label="More: status, notes, villa"
              title="Status, notes, villa"
              className="text-muted hover:bg-foreground/[0.05] focus-visible:ring-accent/25 grid size-7 place-items-center rounded-full focus-visible:ring-4 focus-visible:outline-none"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            {moreMode === "move" ? (
              <>
                <MenuLabel>Move to which villa?</MenuLabel>
                <VillaList
                  current={action.unitId}
                  onPick={(unitId) => save({ unitId }, "Moved", { unitId: action.unitId })}
                />
              </>
            ) : (
              <>
                <MenuLabel>Status</MenuLabel>
                {ACTION_STATUSES.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    // Closing is the setter's or a manager's; marking finished is its owner's.
                    disabled={
                      ((option.value === "done" || action.status === "done") &&
                        right !== "close") ||
                      (option.value === "awaiting_confirmation" && right !== "finish")
                    }
                    className="data-[disabled]:opacity-45"
                    onSelect={() => {
                      if (option.value === action.status) return;
                      save(
                        { status: option.value },
                        option.value === "waiting_management"
                          ? "Flagged for management"
                          : option.value === "done"
                            ? "Marked done"
                            : `Status: ${option.label}`,
                        { status: action.status },
                      );
                    }}
                  >
                    <span>{option.label}</span>
                    {option.value === "waiting_management" ? (
                      <span className="text-muted ml-auto text-xs">a manager clears it</span>
                    ) : null}
                    <MenuCheck on={action.status === option.value} />
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setNotesOpen((open) => !open)}>
                  {notesOpen ? "Hide notes" : action.notes ? "Show notes" : "Add notes"}
                </DropdownMenuItem>
                {action.villa && showVilla ? (
                  <DropdownMenuItem asChild>
                    <Link href={`/design-management/villas/${action.villa.unitId}`}>
                      Open villa {action.villa.number}
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    setMoreMode("move");
                  }}
                >
                  Move to another villa…
                </DropdownMenuItem>
                {removal ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-danger" onSelect={() => setRemoving(true)}>
                      {removal === "delete" ? "Delete…" : "Cancel this action…"}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="text-muted ml-auto pl-1 text-[11px] whitespace-nowrap max-sm:w-full max-sm:pl-0">
          {stamp}
        </span>
      </div>

      <DeleteOrCancel
        open={removing}
        onOpenChange={setRemoving}
        noun="action"
        removal={removal ? { kind: removal } : null}
        onDelete={() => deleteDesignAction(action.id)}
        onCancel={(reason) => cancelDesignAction(action.id, reason)}
        deleteNote="Nobody has changed it since it was added, so it goes for good."
        cancelNote="It closes for good and stays among the done, struck through, with your reason. This can't be undone."
        reasonPlaceholder="Covered by another action"
      />

      {notesOpen ? <ActionNotes action={action} onSave={(notes) => save({ notes })} /> : null}
    </article>
  );
}

function ActionText({
  action,
  done,
  onSave,
}: {
  action: DesignAction;
  done: boolean;
  onSave: (text: string) => void;
}) {
  const undoBar = useUndoBar();
  return (
    <textarea
      key={action.action}
      defaultValue={action.action}
      rows={1}
      aria-label="Action"
      maxLength={500}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
        if (event.key === "Escape") {
          event.currentTarget.value = action.action;
          event.currentTarget.blur();
        }
      }}
      onBlur={(event) => {
        const value = event.currentTarget.value.trim();
        if (value === action.action) return;
        if (!value) {
          event.currentTarget.value = action.action;
          undoBar("An action needs some words. Tick it done instead.");
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

function ActionNotes({
  action,
  onSave,
}: {
  action: DesignAction;
  onSave: (notes: string) => void;
}) {
  return (
    <div className="col-start-2 mt-2">
      <Textarea
        key={action.notes ?? ""}
        autoFocus={!action.notes}
        defaultValue={action.notes ?? ""}
        aria-label="Notes"
        placeholder="What the client said, what was agreed, what is still missing…"
        maxLength={4000}
        onBlur={(event) => {
          const value = event.currentTarget.value.trim();
          if (value !== (action.notes ?? "")) onSave(value);
        }}
        className="min-h-20 text-sm"
      />
    </div>
  );
}

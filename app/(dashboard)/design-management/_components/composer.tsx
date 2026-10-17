"use client";

import { Button } from "@/components/ui/button";
import { PersonName, PillButton, type PillTone } from "@/components/ui/pill";
import { useUndoBar } from "@/components/ui/undo-bar";
import { addDesignAction } from "@/lib/design-management/board-actions";
import { dueLabel, type DueTone } from "@/lib/next-steps/rules";
import { CalendarDays, Layers, MapPin, Plus, UserRound } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { useDesignBoard } from "./board-context";
import { DueMenu, OwnerMenu, StageMenu, VillaMenu } from "./menus";

const DUE_TONE: Record<DueTone, PillTone> = {
  danger: "danger",
  info: "info",
  neutral: "plain",
  success: "success",
};

/**
 * The one-line composer: type the step, tap villa, stage, owner and date,
 * press Enter. On a villa's page the villa is fixed. No date is allowed —
 * it lands with the overdue ones, and the line says so, because every
 * promise should carry a real date.
 */
export function Composer({
  fixedVilla,
  defaultOwner,
  defaultStage = null,
}: {
  fixedVilla?: string;
  /** Who it goes to until someone picks: you, or the person being viewed. */
  defaultOwner: string | null;
  defaultStage?: string | null;
}) {
  const { villas, team, stages, today } = useDesignBoard();
  const undoBar = useUndoBar();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [villa, setVilla] = useState<string | null>(fixedVilla ?? null);
  const [owner, setOwner] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(defaultStage);
  const [due, setDue] = useState<string | null>(null);

  const ownerId = owner ?? (team.some((p) => p.id === defaultOwner) ? defaultOwner : null);
  const ownerName = team.find((person) => person.id === ownerId)?.name ?? null;
  const chosenVilla = villas.find((v) => v.unitId === villa) ?? null;
  const stageName = stages.find((s) => s.id === stage)?.name ?? null;
  const dueText = due ? dueLabel({ status: "open", dueOn: due }, today) : null;

  const submit = () => {
    const text = input.current?.value.trim() ?? "";
    if (!text) {
      undoBar("Write what needs to happen first.");
      input.current?.focus();
      return;
    }
    if (!ownerId) {
      undoBar("Pick who owns it.");
      return;
    }
    startTransition(async () => {
      const result = await addDesignAction({
        unitId: fixedVilla ?? villa,
        stageId: stage,
        action: text,
        ownerId,
        dueOn: due,
      });
      if (result?.error) {
        undoBar(result.error);
        return;
      }
      undoBar(
        due
          ? "Action added"
          : "Added with no date, so it shows as overdue. Tap its date to set one.",
      );
      if (input.current) input.current.value = "";
      setDue(null);
      setOwner(null);
      setStage(defaultStage);
      if (!fixedVilla) setVilla(null);
      input.current?.focus();
    });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="border-border bg-surface focus-within:border-accent focus-within:ring-accent/15 flex flex-wrap items-center gap-2 rounded-2xl border p-1.5 pl-3 focus-within:ring-4"
    >
      <span
        aria-hidden="true"
        className="border-foreground/20 text-muted grid size-6 shrink-0 place-items-center rounded-full border-2 border-dashed"
      >
        <Plus className="size-3.5" strokeWidth={2.5} />
      </span>
      <input
        ref={input}
        aria-label="New action"
        autoComplete="off"
        maxLength={500}
        placeholder={
          fixedVilla ? "Add the next step for this villa…" : "Add an action, e.g. Send revised plan"
        }
        className="text-foreground placeholder:text-muted/70 h-10 min-w-48 flex-1 border-0 bg-transparent px-1 text-[15px] focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {fixedVilla ? null : (
          <VillaMenu value={villa} onPick={setVilla}>
            <PillButton tone={chosenVilla ? "plain" : "dashed"} aria-label="Pick the villa">
              {chosenVilla ? (
                <>
                  <span className="text-foreground font-mono font-bold">{chosenVilla.number}</span>
                  <span className="text-muted max-w-32 truncate font-normal">
                    {chosenVilla.clientName ?? chosenVilla.villaName}
                  </span>
                </>
              ) : (
                <>
                  <MapPin className="size-3.5" /> Villa
                </>
              )}
            </PillButton>
          </VillaMenu>
        )}
        <StageMenu value={stage} onPick={setStage}>
          <PillButton tone={stageName ? "plain" : "dashed"} aria-label="Pick the stage">
            <Layers className="size-3.5" /> {stageName ?? "Stage"}
          </PillButton>
        </StageMenu>
        <OwnerMenu value={ownerId} onPick={setOwner}>
          <PillButton tone={ownerName ? "plain" : "dashed"} aria-label="Pick who owns it">
            {ownerName ? (
              <PersonName name={ownerName} />
            ) : (
              <>
                <UserRound className="size-3.5" /> Owner
              </>
            )}
          </PillButton>
        </OwnerMenu>
        <DueMenu value={due} onPick={setDue}>
          <PillButton tone={dueText ? DUE_TONE[dueText.tone] : "dashed"} aria-label="Pick the date">
            <CalendarDays className="size-3.5" />
            {dueText ? dueText.text : "Due"}
          </PillButton>
        </DueMenu>
        <Button type="submit" disabled={pending} className="h-9 px-4">
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
    </form>
  );
}

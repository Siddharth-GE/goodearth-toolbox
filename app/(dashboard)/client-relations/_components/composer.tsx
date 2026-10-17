"use client";

import { Button } from "@/components/ui/button";
import { dueLabel, ownerOfSide, type DueTone } from "@/lib/client-relations/next-steps";
import { addNextStep } from "@/lib/client-relations/next-steps-actions";
import type { ActionTrack } from "@/lib/client-relations/stages";
import { cn } from "@/lib/utils";
import { CalendarDays, MapPin, Plus, UserRound } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { useBoard, useToast } from "./board-context";
import { PersonName, Pill, PillButton, type PillTone } from "./pill";
import { SideMark, sideLabel } from "./side-mark";
import { DueMenu, OwnerMenu, PlotMenu } from "./step-menus";

const DUE_TONE: Record<DueTone, PillTone> = {
  danger: "danger",
  info: "info",
  neutral: "plain",
  success: "success",
};

/**
 * The tracker's one-line composer: type the step, tap plot, owner, date,
 * Construction or Interior, press Enter. On a plot's page the plot is
 * fixed. A step on a plot is its side's owner's and nobody else's (0125),
 * so once a plot is chosen the owner is shown, not picked; only a step
 * with no plot is given to whoever you choose.
 *
 * No date is allowed — it lands with the overdue ones, and the line says
 * so, because the tracker's rule is that every promise gets a real date.
 */
export function Composer({
  fixedPlot,
  defaultOwner,
  defaultTrack = "sales",
}: {
  /** A plot's page: every step it adds is that plot's. */
  fixedPlot?: string;
  /** Who it goes to until someone picks: you, the person being viewed, or the plot's owner. */
  defaultOwner: string | null;
  /** The side it starts on, and goes back to after each add. */
  defaultTrack?: ActionTrack;
}) {
  const { plots, team, today } = useBoard();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [plot, setPlot] = useState<string | null>(fixedPlot ?? null);
  const [owner, setOwner] = useState<string | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const [track, setTrack] = useState<ActionTrack>(defaultTrack);

  const onTeam = (id: string | null | undefined): id is string =>
    Boolean(id && team.some((p) => p.id === id));
  const chosenPlot = plots.find((p) => p.engagementId === (fixedPlot ?? plot)) ?? null;
  // On a plot, the step is its side's owner's; null when the side has none yet.
  const ownerId = chosenPlot
    ? ownerOfSide(chosenPlot, track)
    : (owner ?? (onTeam(defaultOwner) ? defaultOwner : null));
  const ownerName = ownerId
    ? (team.find((person) => person.id === ownerId)?.name ?? "Its owner")
    : null;
  const side = sideLabel(track).toLowerCase();
  const dueText = due ? dueLabel({ status: "open", dueOn: due }, today) : null;

  const submit = () => {
    const text = input.current?.value.trim() ?? "";
    if (!text) {
      toast("Write what needs to happen first.");
      input.current?.focus();
      return;
    }
    if (!ownerId) {
      toast(
        chosenPlot
          ? `This plot has no ${side} owner yet. Give it one on the plot first.`
          : "Pick who owns it.",
      );
      return;
    }
    startTransition(async () => {
      const result = await addNextStep({
        engagementId: fixedPlot ?? plot,
        action: text,
        ownerId,
        dueOn: due,
        track,
      });
      if (result?.error) {
        toast(result.error);
        return;
      }
      toast(
        due
          ? "Action added"
          : "Added with no date, so it shows as overdue. Tap its date to set one.",
      );
      if (input.current) input.current.value = "";
      setDue(null);
      setOwner(null);
      setTrack(defaultTrack);
      if (!fixedPlot) setPlot(null);
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
          fixedPlot
            ? "Add the next step for this plot…"
            : "Add an action, e.g. Share 3D with client"
        }
        className="text-foreground placeholder:text-muted/70 h-10 min-w-48 flex-1 border-0 bg-transparent px-1 text-[15px] focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {fixedPlot ? null : (
          <PlotMenu value={plot} onPick={setPlot}>
            <PillButton tone={chosenPlot ? "plain" : "dashed"} aria-label="Pick the plot">
              {chosenPlot ? (
                <>
                  <span className="text-foreground font-mono font-bold">{chosenPlot.number}</span>
                  <span className="text-muted max-w-32 truncate font-normal">
                    {chosenPlot.clientName ?? "No buyer"}
                  </span>
                </>
              ) : (
                <>
                  <MapPin className="size-3.5" /> Plot
                </>
              )}
            </PillButton>
          </PlotMenu>
        )}
        {chosenPlot ? (
          // The side's owner, shown and not picked: hand a side over on the plot.
          <span title={`Every ${side} step on this plot is its ${side} owner's`}>
            <Pill tone={ownerName ? "plain" : "warning"}>
              {ownerName ? (
                <PersonName name={ownerName} />
              ) : (
                <>
                  <UserRound className="size-3.5" /> No {side} owner
                </>
              )}
            </Pill>
          </span>
        ) : (
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
        )}
        <DueMenu value={due} onPick={setDue}>
          <PillButton tone={dueText ? DUE_TONE[dueText.tone] : "dashed"} aria-label="Pick the date">
            <CalendarDays className="size-3.5" />
            {dueText ? dueText.text : "Due"}
          </PillButton>
        </DueMenu>
        <PillButton
          tone={track === "kaadal" ? "info" : "plain"}
          onClick={() => setTrack((t) => (t === "kaadal" ? "sales" : "kaadal"))}
          aria-label={`Side: ${track === "kaadal" ? "Interior" : "Construction"}. Switch`}
          title="Switch between Construction and Interior"
        >
          <SideMark track={track} />
        </PillButton>
        <Button type="submit" disabled={pending} className={cn("h-9 px-4")}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
    </form>
  );
}

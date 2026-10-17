"use client";

import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { dueChoices } from "@/lib/client-relations/next-steps";
import { formatDayDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { useBoard } from "./board-context";

/**
 * The tracker's popovers, on the toolbox's DropdownMenu (Radix: focus,
 * Escape, arrow keys). Each takes its trigger — a pill — and says what was
 * picked; saving is the caller's.
 *
 * Inputs inside a menu stop their key presses reaching it, or Radix's
 * type-to-find would swallow the letters being typed.
 */

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-[0.14em] uppercase">
      {children}
    </p>
  );
}

export function MenuCheck({ on }: { on: boolean }) {
  return <Check className={cn("text-accent ml-auto size-4 shrink-0", !on && "invisible")} />;
}

export function DueMenu({
  value,
  onPick,
  children,
}: {
  value: string | null;
  onPick: (date: string | null) => void;
  /** The trigger, a pill. */
  children: ReactNode;
}) {
  const { today } = useBoard();
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <MenuLabel>Due</MenuLabel>
        {dueChoices(today).map((choice) => (
          <DropdownMenuItem key={choice.label} onSelect={() => onPick(choice.date)}>
            <span>{choice.label}</span>
            <span className="text-muted ml-auto text-xs">{formatDayDate(choice.date)}</span>
            <MenuCheck on={value === choice.date} />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <MenuLabel>Pick a date</MenuLabel>
        <div className="px-1.5 pb-1.5">
          <Input
            type="date"
            aria-label="Pick a date"
            defaultValue={value ?? ""}
            onKeyDown={(event) => event.stopPropagation()}
            onChange={(event) => {
              if (!event.target.value) return;
              onPick(event.target.value);
              setOpen(false);
            }}
            className="h-10"
          />
        </div>
        {value ? (
          <DropdownMenuItem onSelect={() => onPick(null)} className="text-muted">
            Clear the date
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function OwnerMenu({
  value,
  onPick,
  children,
  title = "Who owns this?",
}: {
  value: string | null;
  onPick: (personId: string) => void;
  children: ReactNode;
  title?: string;
}) {
  const { team, openByOwner, seesAll } = useBoard();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <MenuLabel>{title}</MenuLabel>
        {team.length === 0 ? (
          <p className="text-muted px-2.5 py-2 text-sm">
            Nobody holds Client Relations yet — grant it in Settings → People.
          </p>
        ) : (
          team.map((person) => (
            <DropdownMenuItem key={person.id} onSelect={() => onPick(person.id)}>
              <Avatar name={person.name} size={24} letters={2} />
              <span className="truncate">{person.name}</span>
              {seesAll ? (
                <span className="text-muted ml-auto text-xs whitespace-nowrap">
                  {openByOwner[person.id] ?? 0} open
                </span>
              ) : null}
              <MenuCheck on={value === person.id} />
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * A searchable list of plots, inside an open menu — the composer's plot
 * pill and an action's "Move to another plot". `general` offers "no plot".
 */
export function PlotList({
  onPick,
  general = true,
  current,
}: {
  onPick: (engagementId: string | null) => void;
  general?: boolean;
  current?: string | null;
}) {
  const { plots } = useBoard();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return plots
      .filter(
        (plot) =>
          !q ||
          plot.number.toLowerCase().includes(q) ||
          (plot.clientName ?? "").toLowerCase().includes(q) ||
          plot.projectName.toLowerCase().includes(q),
      )
      .slice(0, 60);
  }, [plots, query]);
  const projects = new Set(plots.map((plot) => plot.projectId)).size;

  return (
    <>
      <div className="px-1.5 pt-1.5 pb-1">
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter" && matches[0]) {
              event.preventDefault();
              onPick(matches[0].engagementId);
            }
          }}
          placeholder="Plot number or client"
          aria-label="Find a plot"
          className="h-10"
        />
      </div>
      <div className="max-h-72 overflow-y-auto">
        {general && !query ? (
          <DropdownMenuItem onSelect={() => onPick(null)}>
            <span className="text-muted">General — no plot</span>
            <MenuCheck on={current === null} />
          </DropdownMenuItem>
        ) : null}
        {matches.map((plot) => (
          <DropdownMenuItem key={plot.engagementId} onSelect={() => onPick(plot.engagementId)}>
            <span className="text-foreground min-w-12 font-mono text-xs font-bold">
              {plot.number}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {plot.clientName ?? <span className="text-muted">No buyer</span>}
              {projects > 1 ? <span className="text-muted"> · {plot.projectName}</span> : null}
            </span>
            <MenuCheck on={current === plot.engagementId} />
          </DropdownMenuItem>
        ))}
        {matches.length === 0 ? (
          <p className="text-muted px-2.5 py-2 text-sm">No plot matches that.</p>
        ) : null}
      </div>
    </>
  );
}

export function PlotMenu({
  value,
  onPick,
  children,
}: {
  value: string | null;
  onPick: (engagementId: string | null) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <MenuLabel>Which plot?</MenuLabel>
        <PlotList
          current={value}
          onPick={(id) => {
            onPick(id);
            setOpen(false);
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

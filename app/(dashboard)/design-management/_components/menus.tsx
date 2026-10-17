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
import { dueChoices } from "@/lib/next-steps/rules";
import { formatDayDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { useDesignBoard } from "./board-context";

/**
 * The board's chip menus, on the toolbox's DropdownMenu (Radix: focus,
 * Escape, arrow keys). Each takes its trigger — a pill — and says what was
 * picked; saving is the caller's. Inputs inside a menu stop their key
 * presses reaching it, or Radix's type-to-find would swallow the letters.
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
  children: ReactNode;
}) {
  const { today } = useDesignBoard();
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
  const { team, openByOwner } = useDesignBoard();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <MenuLabel>{title}</MenuLabel>
        {team.length === 0 ? (
          <NobodyOnTheTeam />
        ) : (
          team.map((person) => (
            <DropdownMenuItem key={person.id} onSelect={() => onPick(person.id)}>
              <Avatar name={person.name} size={24} letters={2} />
              <span className="truncate">{person.name}</span>
              <span className="text-muted ml-auto text-xs whitespace-nowrap">
                {openByOwner[person.id] ?? 0} open
              </span>
              <MenuCheck on={value === person.id} />
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function NobodyOnTheTeam() {
  return (
    <p className="text-muted px-2.5 py-2 text-sm">
      Nobody holds Design Management yet — grant it in Settings → People.
    </p>
  );
}

/**
 * A searchable list of villas inside an open menu — the composer's villa
 * pill and an action's "Move to another villa". `general` offers "no villa".
 */
export function VillaList({
  onPick,
  general = true,
  current,
}: {
  onPick: (unitId: string | null) => void;
  general?: boolean;
  current?: string | null;
}) {
  const { villas } = useDesignBoard();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return villas
      .filter(
        (villa) =>
          !q ||
          villa.number.toLowerCase().includes(q) ||
          villa.villaName.toLowerCase().includes(q) ||
          (villa.clientName ?? "").toLowerCase().includes(q) ||
          villa.projectName.toLowerCase().includes(q),
      )
      .slice(0, 60);
  }, [villas, query]);
  const projects = new Set(villas.map((villa) => villa.projectId)).size;

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
              onPick(matches[0].unitId);
            }
          }}
          placeholder="Plot number or client"
          aria-label="Find a villa"
          className="h-10"
        />
      </div>
      <div className="max-h-72 overflow-y-auto">
        {general && !query ? (
          <DropdownMenuItem onSelect={() => onPick(null)}>
            <span className="text-muted">General — no villa</span>
            <MenuCheck on={current === null} />
          </DropdownMenuItem>
        ) : null}
        {matches.map((villa) => (
          <DropdownMenuItem key={villa.unitId} onSelect={() => onPick(villa.unitId)}>
            <span className="text-foreground min-w-12 font-mono text-xs font-bold">
              {villa.number}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {villa.clientName ?? <span className="text-muted">No buyer</span>}
              {projects > 1 ? <span className="text-muted"> · {villa.projectName}</span> : null}
            </span>
            <MenuCheck on={current === villa.unitId} />
          </DropdownMenuItem>
        ))}
        {matches.length === 0 ? (
          <p className="text-muted px-2.5 py-2 text-sm">No villa matches that.</p>
        ) : null}
      </div>
    </>
  );
}

export function VillaMenu({
  value,
  onPick,
  children,
}: {
  value: string | null;
  onPick: (unitId: string | null) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <MenuLabel>Which villa?</MenuLabel>
        <VillaList
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

/** Which board stage an action belongs to — optional, so "No stage" clears it. */
export function StageMenu({
  value,
  onPick,
  children,
}: {
  value: string | null;
  onPick: (stageId: string | null) => void;
  children: ReactNode;
}) {
  const { stages } = useDesignBoard();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <MenuLabel>Which stage?</MenuLabel>
        {stages.map((stage) => (
          <DropdownMenuItem key={stage.id} onSelect={() => onPick(stage.id)}>
            <span>{stage.name}</span>
            <MenuCheck on={value === stage.id} />
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onPick(null)} className="text-muted">
          No stage
          <MenuCheck on={value === null} />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

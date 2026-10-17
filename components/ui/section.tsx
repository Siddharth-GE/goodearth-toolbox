"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

/**
 * A card with a heading, an optional `aside` docked right, and optionally collapsible for fields set once and rarely revisited.
 * The closed header keeps its `aside`, so a section can report its total without being opened.
 */
export function Section({
  title,
  note,
  aside,
  collapsible = false,
  defaultOpen = true,
  nested = false,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  note?: string;
  aside?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Inside another Card, so it recesses instead of lifting (surface and surface-raised are both white in light mode). */
  nested?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const shown = collapsible ? open : true;

  const heading = (
    <div className="min-w-0">
      <h2 className="text-foreground flex items-center gap-1.5 text-[15px] font-semibold tracking-tight">
        {collapsible ? (
          <ChevronDown
            className={cn("text-muted size-4 shrink-0 transition-transform", !open && "-rotate-90")}
            aria-hidden
          />
        ) : null}
        {title}
      </h2>
      {note ? <p className={cn("text-muted text-xs", collapsible && "pl-5.5")}>{note}</p> : null}
    </div>
  );

  return (
    <Card className={cn("p-5", nested && "bg-background", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-controls={bodyId}
            className="focus-visible:ring-accent -m-1 min-w-0 flex-1 rounded-lg p-1 text-left focus-visible:ring-2 focus-visible:outline-none"
          >
            {heading}
          </button>
        ) : (
          heading
        )}
        {aside ? <div className="flex items-center gap-3">{aside}</div> : null}
      </div>
      {shown ? (
        <div id={bodyId} className={cn("mt-3", bodyClassName)}>
          {children}
        </div>
      ) : null}
    </Card>
  );
}

/** A row of fields at a column count that suits how many there are; pick `cols` to match the group. */
export function FieldRow({
  cols = 4,
  className,
  children,
}: {
  cols?: 2 | 3 | 4 | 5 | 6;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2",
        cols === 2 && "lg:grid-cols-2",
        cols === 3 && "lg:grid-cols-3",
        cols === 4 && "lg:grid-cols-4",
        cols === 5 && "sm:grid-cols-3 lg:grid-cols-5",
        cols === 6 && "sm:grid-cols-3 lg:grid-cols-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

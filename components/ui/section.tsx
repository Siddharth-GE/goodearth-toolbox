"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

/**
 * A card with a heading, an optional figure or button docked to its right,
 * and — when the fields inside are ones you set once and rarely revisit —
 * the ability to stay shut until asked.
 *
 * Built for the same reason as Figure: the header-inside-a-Card block had
 * been hand-written five times in Business Planning and again in Budgets
 * and Purchase Orders, each with its own spacing.
 *
 * Collapsing matters more than it sounds. A screen that opens with forty
 * fields showing has no shape, and the two or three that get touched on a
 * normal visit are buried among the thirty-seven that do not. The closed
 * header keeps its `aside`, so a section can report its own total without
 * being opened.
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
  /** A running total, an Add button — anything that belongs in the header. */
  aside?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /**
   * This Section sits inside another Card, so it recesses instead of
   * lifting. `surface` and `surface-raised` are the same white in light
   * mode, so a card on a card would be told apart by its border alone.
   */
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
      <h2 className="text-foreground flex items-center gap-1.5 text-sm font-semibold">
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
    <Card className={cn("p-4", nested && "bg-background shadow-none", className)}>
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

/**
 * A row of fields inside a Section, at a column count that suits how many
 * there are rather than a fixed four.
 *
 * The `cols` prop exists because Business Planning laid out sixteen
 * consecutive groups on `lg:grid-cols-4` regardless of content, which is
 * what made the whole tool read as one undifferentiated matrix. Three
 * related fields on a four-track leave a hole; six on a four-track wrap
 * two onto a lonely second row. Pick the number that matches the group.
 */
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

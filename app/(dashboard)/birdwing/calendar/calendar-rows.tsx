import { addDays, type CalendarCell, type UnplacedBar } from "@/lib/birdwing/calendar";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The calendar's cells and rows (the page lays out the table). A room's
 * night is a link — to book it when free, to its stay when taken; a stay
 * with no room named is a dashed bar across its nights.
 */

export function Night({
  cell,
  roomId,
  roomCode,
  today,
}: {
  cell: CalendarCell;
  roomId: string;
  roomCode: string;
  today: string;
}) {
  const base =
    "relative flex h-9 items-center overflow-hidden rounded-md px-1 text-[11px] leading-tight focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none";

  if (!cell.night) {
    const past = cell.date < today;
    return (
      <Link
        href={`/birdwing/stays/new?arrival=${cell.date}&departure=${addDays(cell.date, 1)}&room=${roomId}`}
        className={cn(
          base,
          "hover:bg-foreground/[0.05] justify-center",
          past ? "text-muted/40" : "text-muted/70",
        )}
        title={`Book ${roomCode} from ${formatDate(cell.date)}`}
      >
        {cell.departingStayId ? (
          <span className="bg-warning size-1.5 rounded-full" aria-hidden />
        ) : null}
        <span className="sr-only">
          {roomCode} free on {formatDate(cell.date)}
          {cell.departingStayId ? ", a guest leaves that morning" : ""}
        </span>
      </Link>
    );
  }

  const { night } = cell;
  const tone = night.isBlock
    ? "bg-foreground/[0.08] text-muted"
    : night.status === "checked_in"
      ? "bg-success/15 text-success"
      : night.status === "enquiry"
        ? "bg-muted/15 text-muted"
        : night.status === "checked_out"
          ? "bg-foreground/[0.06] text-foreground"
          : "bg-info/15 text-info";
  return (
    <Link
      href={`/birdwing/stays/${night.stayId}`}
      className={cn(base, tone, "hover:brightness-95")}
      title={`${roomCode} · ${night.label}${cell.turnover ? " · turnover day" : ""}`}
    >
      {cell.turnover && (
        <span className="bg-warning absolute inset-y-1 left-0 w-1 rounded-full" aria-hidden />
      )}
      <span className={cn("truncate font-medium", cell.turnover && "pl-1.5")}>
        {night.arrives ? night.label : ""}
      </span>
      <span className="sr-only">
        {roomCode} on {formatDate(cell.date)}: {night.label}
        {cell.turnover ? ", turnover day" : ""}
      </span>
    </Link>
  );
}

/**
 * One row of stays with no room. Each bar spans its nights; the row is
 * filled with empty cells between bars so the days stay in their columns.
 */
export function UnplacedLane({ lane, dayCount }: { lane: UnplacedBar[]; dayCount: number }) {
  const cells: ReactNode[] = [];
  let cursor = 0;
  for (const bar of lane) {
    for (; cursor < bar.start; cursor += 1) {
      cells.push(<td key={`gap-${cursor}`} className="p-0.5" />);
    }
    cells.push(
      <td key={bar.stayId} colSpan={bar.span} className="p-0.5">
        <Link
          href={`/birdwing/stays/${bar.stayId}`}
          title={`${bar.label}${unplacedNote(bar)}`}
          className={cn(
            "border-border focus-visible:ring-accent flex h-8 items-center gap-1 overflow-hidden rounded-md border border-dashed px-1 text-[11px] leading-tight hover:brightness-95 focus-visible:ring-2 focus-visible:outline-none",
            // A day visit has no night: a hollow outline, not a filled bar.
            bar.dayVisit
              ? "text-foreground bg-transparent"
              : bar.status === "checked_out"
                ? "bg-foreground/[0.06] text-foreground"
                : bar.status === "checked_in"
                  ? "bg-success/15 text-success"
                  : "bg-info/10 text-info",
            bar.continuesBefore && "rounded-l-none border-l-0",
            bar.continuesAfter && "rounded-r-none border-r-0",
          )}
        >
          {/* The name comes first; a one-night bar is one column wide. */}
          {!bar.dayVisit && bar.span > 1 && bar.roomCount && bar.roomCount > 1 ? (
            <span className="text-muted shrink-0 tabular-nums">×{bar.roomCount}</span>
          ) : null}
          <span className="min-w-0 truncate font-medium">{bar.label}</span>
          <span className={bar.span >= 4 ? "text-muted shrink-0" : "sr-only"}>
            {unplacedNote(bar)}
          </span>
        </Link>
      </td>,
    );
    cursor = bar.start + bar.span;
  }
  for (; cursor < dayCount; cursor += 1) {
    cells.push(<td key={`gap-${cursor}`} className="p-0.5" />);
  }
  return (
    <tr>
      <th
        scope="row"
        className="bg-surface sticky left-0 z-10 px-3 py-1"
        aria-label="Rooms not named"
      />
      {cells}
    </tr>
  );
}

function unplacedNote(bar: UnplacedBar): string {
  if (bar.dayVisit) return " · day visit";
  if (bar.roomCount) return ` · ${bar.roomCount} room${bar.roomCount === 1 ? "" : "s"}`;
  return " · no room";
}

export function Legend() {
  const items: { label: string; swatch: string }[] = [
    { label: "Booked", swatch: "bg-info/15" },
    { label: "In the house", swatch: "bg-success/15" },
    { label: "Enquiry", swatch: "bg-muted/15" },
    { label: "Left", swatch: "bg-foreground/[0.06]" },
    { label: "Blocked", swatch: "bg-foreground/[0.08]" },
  ];
  return (
    <div className="text-muted flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
      {items.map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5">
          <span className={cn("border-border size-3 rounded border", item.swatch)} aria-hidden />
          {item.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="bg-warning h-3 w-1 rounded-full" aria-hidden />
        Turnover — someone leaves that morning, someone arrives
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="border-border size-3 rounded border border-dashed" aria-hidden />
        Rooms not named — the old sheet counted rooms, never which (×2: two rooms)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="border-border size-3 rounded border border-dashed bg-transparent"
          aria-hidden
        />
        Hollow: a day visit, no night
      </span>
      <span>Tap a free night to book it.</span>
    </div>
  );
}

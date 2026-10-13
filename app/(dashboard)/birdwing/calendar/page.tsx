import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NavTabs } from "@/components/ui/tabs";
import {
  addDays,
  buildCalendar,
  daysFrom,
  monthDays,
  roomsTaken,
  weekStart,
  type CalendarCell,
} from "@/lib/birdwing/calendar";
import { listBookings, listRooms } from "@/lib/birdwing/queries";
import { formatDate, todayInIndia } from "@/lib/format";
import { dateParam } from "@/lib/list-params";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { BlockRoomsDialog } from "./block-rooms-dialog";

/**
 * The rooms against the days: every cell is one room's NIGHT. A free
 * night is a link to book that room from that day; a taken one opens its
 * stay. A turnover — somebody leaving that morning and somebody arriving
 * that afternoon — is marked, because housekeeping has hours, not a day.
 *
 * Month by default; a week at a time fits a phone without scrolling.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string; from?: string }>;
}) {
  const params = await searchParams;
  const today = todayInIndia();
  const week = params.view === "week";
  const month =
    params.month && /^\d{4}-\d{2}$/.test(params.month) && dateParam(`${params.month}-01`)
      ? params.month
      : today.slice(0, 7);
  const days = week ? daysFrom(weekStart(dateParam(params.from) ?? today), 7) : monthDays(month);
  const first = days[0];
  const last = days[days.length - 1];

  const [rooms, bookings] = await Promise.all([listRooms(), listBookings(first, addDays(last, 1))]);
  // A switched-off room still shows while it holds a booking in view.
  const booked = new Set(bookings.map((booking) => booking.roomId));
  const shown = rooms.filter((room) => room.isActive || booked.has(room.id));
  const grid = buildCalendar(
    shown.map((room) => room.id),
    days,
    bookings,
  );

  const prevHref = week
    ? `/birdwing/calendar?view=week&from=${addDays(first, -7)}`
    : `/birdwing/calendar?month=${addDays(first, -1).slice(0, 7)}`;
  const nextHref = week
    ? `/birdwing/calendar?view=week&from=${addDays(first, 7)}`
    : `/birdwing/calendar?month=${addDays(last, 1).slice(0, 7)}`;
  const title = week
    ? `${formatDate(first)} – ${formatDate(last)}`
    : new Date(`${first}T00:00:00Z`).toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <LinkButton href={prevHref} variant="secondary" size="sm" className="px-2">
            <ChevronLeft className="size-4" aria-hidden />
            <span className="sr-only">Earlier</span>
          </LinkButton>
          <h2 className="text-foreground min-w-40 text-center text-[15px] font-semibold tracking-tight">
            {title}
          </h2>
          <LinkButton href={nextHref} variant="secondary" size="sm" className="px-2">
            <ChevronRight className="size-4" aria-hidden />
            <span className="sr-only">Later</span>
          </LinkButton>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NavTabs
            active={week ? "week" : "month"}
            tabs={[
              {
                key: "month",
                href: `/birdwing/calendar?month=${first.slice(0, 7)}`,
                label: "Month",
              },
              { key: "week", href: `/birdwing/calendar?view=week&from=${first}`, label: "Week" },
            ]}
          />
          <BlockRoomsDialog
            rooms={shown.filter((room) => room.isActive).map(({ id, code }) => ({ id, code }))}
            defaultFrom={today}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="text-muted text-sm">No rooms yet — an admin adds them in Settings.</p>
        </Card>
      ) : (
        <div className="border-border bg-surface overflow-x-auto rounded-2xl border">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-border border-b">
                <th className="bg-surface text-muted sticky left-0 z-10 px-3 py-2 text-left text-[11px] font-medium tracking-[0.14em] uppercase">
                  Room
                </th>
                {days.map((day) => {
                  const date = new Date(`${day}T00:00:00Z`);
                  const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
                  return (
                    <th
                      key={day}
                      scope="col"
                      className={cn(
                        "min-w-9 px-0.5 py-2 text-center font-medium tabular-nums",
                        day === today ? "text-accent" : weekend ? "text-foreground" : "text-muted",
                      )}
                    >
                      <span className="block text-[10px] uppercase">
                        {date.toLocaleDateString("en-IN", { weekday: "narrow", timeZone: "UTC" })}
                      </span>
                      {date.getUTCDate()}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {shown.map((room) => (
                <tr key={room.id}>
                  <th
                    scope="row"
                    className="bg-surface text-foreground sticky left-0 z-10 px-3 py-1.5 text-left text-sm font-semibold"
                  >
                    {room.code}
                  </th>
                  {(grid.get(room.id) ?? []).map((cell) => (
                    <td key={cell.date} className="p-0.5">
                      <Night cell={cell} roomId={room.id} roomCode={room.code} today={today} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-border bg-foreground/[0.02] border-t">
              <tr>
                <th className="bg-surface text-muted sticky left-0 z-10 px-3 py-2 text-left text-[11px] font-medium tracking-[0.14em] uppercase">
                  Taken
                </th>
                {days.map((day, index) => (
                  <td key={day} className="text-muted px-0.5 py-2 text-center tabular-nums">
                    {roomsTaken(grid, index)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Legend />
    </div>
  );
}

function Night({
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

function Legend() {
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
      <span>Tap a free night to book it.</span>
    </div>
  );
}

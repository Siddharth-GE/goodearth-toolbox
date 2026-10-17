import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NavTabs } from "@/components/ui/tabs";
import {
  addDays,
  buildCalendar,
  daysFrom,
  monthDays,
  packUnplaced,
  roomsTaken,
  unnamedRoomsByDay,
  weekStart,
} from "@/lib/birdwing/calendar";
import { listBookings, listRooms, listUnplacedStays } from "@/lib/birdwing/queries";
import { formatDate, todayInIndia } from "@/lib/format";
import { dateParam } from "@/lib/list-params";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BlockRoomsDialog } from "./block-rooms-dialog";
import { Legend, Night, UnplacedLane } from "./calendar-rows";

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

  const [rooms, bookings, unplaced] = await Promise.all([
    listRooms(),
    listBookings(first, addDays(last, 1)),
    listUnplacedStays(first, addDays(last, 1)),
  ]);
  const lanes = packUnplaced(unplaced, days);
  const unnamed = unnamedRoomsByDay(lanes, days.length);
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
          <form action="/birdwing/calendar" className="flex items-center gap-1.5">
            <label htmlFor="jump-month" className="sr-only">
              Go to a month
            </label>
            <Input
              id="jump-month"
              name="month"
              type="month"
              defaultValue={first.slice(0, 7)}
              className="h-8 w-40 text-xs"
            />
            <Button type="submit" variant="secondary" size="sm">
              Go
            </Button>
          </form>
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
          {/* Fixed layout keeps day columns equal; a long name truncates and a wide month scrolls. */}
          <table
            className="w-full table-fixed border-collapse text-xs"
            style={{ minWidth: 104 + days.length * 36 }}
          >
            <thead>
              <tr className="border-border border-b">
                <th className="bg-surface text-muted sticky left-0 z-10 w-26 px-3 py-2 text-left text-[11px] font-medium tracking-[0.14em] uppercase">
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
              {lanes.length > 0 && (
                <tr>
                  <th
                    colSpan={days.length + 1}
                    scope="colgroup"
                    className="text-muted bg-foreground/[0.02] px-3 pt-3 pb-1.5 text-left text-[11px] font-medium tracking-[0.14em] uppercase"
                  >
                    Rooms not named — the old sheet&rsquo;s stays, or booked without a room
                  </th>
                </tr>
              )}
              {lanes.map((lane, index) => (
                <UnplacedLane key={index} lane={lane} dayCount={days.length} />
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
              {unnamed.some((count) => count > 0) && (
                <tr>
                  <th className="bg-surface text-muted sticky left-0 z-10 px-3 py-2 text-left text-[11px] font-medium tracking-[0.14em] whitespace-nowrap uppercase">
                    + not named
                  </th>
                  {unnamed.map((count, index) => (
                    <td
                      key={days[index]}
                      className="text-muted px-0.5 py-2 text-center tabular-nums"
                      title="Rooms the old sheet counted for that night, never named"
                    >
                      {count > 0 ? count : ""}
                    </td>
                  ))}
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      )}

      <Legend />
    </div>
  );
}

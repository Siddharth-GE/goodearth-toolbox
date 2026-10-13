import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addDays } from "@/lib/birdwing/calendar";
import { parseStayDates } from "@/lib/birdwing/forms";
import { nightsBetween } from "@/lib/birdwing/money";
import { listBookings, listCostCentres, listGuestOptions, listRooms } from "@/lib/birdwing/queries";
import { todayInIndia } from "@/lib/format";
import { NewStayForm } from "./new-stay-form";

/**
 * A new stay in two steps, neither needing JavaScript to begin: the dates
 * first (a plain GET), so the page can say which rooms are free on those
 * nights and who holds the rest; then the guest and the rooms. A free
 * night on the calendar lands straight on the second step.
 */
export default async function NewStayPage({
  searchParams,
}: {
  searchParams: Promise<{ arrival?: string; departure?: string; room?: string }>;
}) {
  const params = await searchParams;
  const today = todayInIndia();
  const arrival = params.arrival ?? "";
  const departure = params.departure ?? "";
  const dates = arrival || departure ? parseStayDates(arrival, departure) : null;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className="text-foreground text-[15px] font-semibold tracking-tight">
          When are they coming?
        </h2>
        <form action="/birdwing/stays/new" className="mt-3 flex flex-wrap items-end gap-3">
          <div className="w-[calc(50%-0.375rem)] space-y-1.5 sm:w-44">
            <Label htmlFor="arrival">Arrival</Label>
            <Input
              id="arrival"
              name="arrival"
              type="date"
              defaultValue={arrival || today}
              required
            />
          </div>
          <div className="w-[calc(50%-0.375rem)] space-y-1.5 sm:w-44">
            <Label htmlFor="departure">Departure</Label>
            <Input
              id="departure"
              name="departure"
              type="date"
              defaultValue={departure || addDays(arrival || today, 1)}
              required
            />
          </div>
          {params.room && <input type="hidden" name="room" value={params.room} />}
          <Button type="submit" variant={dates?.ok ? "secondary" : "primary"}>
            {dates?.ok ? "Change dates" : "See free rooms"}
          </Button>
        </form>
        {dates && !dates.ok && <p className="text-danger mt-2 text-sm">{dates.error}</p>}
      </Card>

      {dates?.ok && <StepTwo {...dates.value} preselect={params.room} />}
    </div>
  );
}

async function StepTwo({
  arrival,
  departure,
  preselect,
}: {
  arrival: string;
  departure: string;
  preselect?: string;
}) {
  const nights = nightsBetween(arrival, departure);
  const [rooms, bookings, guests, centres] = await Promise.all([
    listRooms(),
    nights > 0 ? listBookings(arrival, departure) : Promise.resolve([]),
    listGuestOptions(),
    listCostCentres(),
  ]);

  const takenBy = new Map(
    bookings.map((booking) => [
      booking.roomId,
      booking.isBlock ? `blocked — ${booking.label}` : `${booking.ref} · ${booking.label}`,
    ]),
  );

  return (
    <NewStayForm
      arrival={arrival}
      departure={departure}
      nights={nights}
      rooms={rooms
        .filter((room) => room.isActive)
        .map((room) => ({
          id: room.id,
          code: room.code,
          name: room.name,
          maxGuests: room.maxGuests,
          takenBy: takenBy.get(room.id) ?? null,
        }))}
      preselect={preselect && !takenBy.has(preselect) ? preselect : undefined}
      guests={guests.map((guest) => ({
        value: guest.id,
        label: guest.name,
        hint: [guest.phone, guest.city].filter(Boolean).join(" · ") || undefined,
      }))}
      costCentres={centres
        .filter((centre) => centre.isActive)
        .map((centre) => ({ id: centre.id, name: centre.name }))}
    />
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect, type SearchOption } from "@/components/ui/search-select";
import { FieldRow, Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createStay } from "@/lib/birdwing/actions";
import {
  CHANNELS,
  CHANNEL_LABELS,
  STAY_USES,
  USE_LABELS,
  isInternalUse,
  type StayUse,
} from "@/lib/birdwing/shared";
import { formatDate } from "@/lib/format";
import { useActionState, useState } from "react";

type RoomChoice = {
  id: string;
  code: string;
  name: string;
  maxGuests: number | null;
  takenBy: string | null;
};

export function NewStayForm({
  arrival,
  departure,
  nights,
  rooms,
  preselect,
  guests,
  costCentres,
}: {
  arrival: string;
  departure: string;
  nights: number;
  rooms: RoomChoice[];
  preselect?: string;
  guests: SearchOption[];
  costCentres: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(createStay, undefined);
  const [guestId, setGuestId] = useState("");
  const [newGuest, setNewGuest] = useState(guests.length === 0);
  const [use, setUse] = useState<StayUse>("guest");
  const free = rooms.filter((room) => !room.takenBy).length;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="arrival" value={arrival} />
      <input type="hidden" name="departure" value={departure} />

      <Section
        title="Rooms"
        note={
          nights === 0
            ? `${formatDate(arrival)} — a day visit, so no room`
            : `${formatDate(arrival)} to ${formatDate(departure)} · ${nights} night${nights === 1 ? "" : "s"} · ${free} of ${rooms.length} free`
        }
      >
        {nights === 0 ? (
          <p className="text-muted text-sm">
            Meals or an event on the day — add the charges once the stay is saved.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {rooms.map((room) => (
              <label
                key={room.id}
                className={
                  room.takenBy
                    ? "border-border text-muted flex items-start gap-3 rounded-xl border p-3 text-sm"
                    : "border-border hover:bg-foreground/[0.025] flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm"
                }
              >
                <Checkbox
                  name="room_id"
                  value={room.id}
                  disabled={room.takenBy !== null}
                  defaultChecked={room.id === preselect}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="text-foreground font-medium">{room.code}</span>
                  {room.name !== room.code && <span className="text-muted"> · {room.name}</span>}
                  {room.maxGuests && <span className="text-muted"> · up to {room.maxGuests}</span>}
                  <span className="block text-xs">
                    {room.takenBy ? `Taken: ${room.takenBy}` : "Free"}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Guest"
        aside={
          guests.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setNewGuest(!newGuest);
                setGuestId("");
              }}
            >
              {newGuest ? "Pick a returning guest" : "New guest"}
            </Button>
          ) : null
        }
      >
        {newGuest ? (
          <FieldRow cols={2}>
            <div className="space-y-1.5">
              <Label htmlFor="guest-name">Name</Label>
              <Input id="guest-name" name="guest_name" required maxLength={120} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guest-phone">Phone</Label>
              <Input
                id="guest-phone"
                name="guest_phone"
                type="tel"
                inputMode="tel"
                maxLength={30}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guest-email">Email</Label>
              <Input id="guest-email" name="guest_email" type="email" maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guest-city">From</Label>
              <Input id="guest-city" name="guest_city" maxLength={80} placeholder="City" />
            </div>
          </FieldRow>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="guest-pick">Guest</Label>
            <SearchSelect
              id="guest-pick"
              name="guest_id"
              options={guests}
              value={guestId}
              onChange={setGuestId}
              placeholder="Type a name or phone…"
              emptyHint={`${guests.length} guests have stayed before`}
            />
          </div>
        )}
      </Section>

      <Section title="The booking">
        <FieldRow cols={3}>
          <div className="space-y-1.5">
            <Label htmlFor="use">Who it is for</Label>
            <Select
              id="use"
              name="use"
              value={use}
              onChange={(event) => setUse(event.target.value as StayUse)}
            >
              {STAY_USES.map((value) => (
                <option key={value} value={value}>
                  {USE_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
          {isInternalUse(use) && (
            <div className="space-y-1.5">
              <Label htmlFor="cost-centre">Charged to</Label>
              <Select id="cost-centre" name="cost_centre_id" defaultValue="">
                <option value="">Decide later</option>
                {costCentres.map((centre) => (
                  <option key={centre.id} value={centre.id}>
                    {centre.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="channel">Booked through</Label>
            <Select id="channel" name="channel" defaultValue="direct">
              {CHANNELS.map((value) => (
                <option key={value} value={value}>
                  {CHANNEL_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="referred-by">Referred by</Label>
            <Input id="referred-by" name="referred_by" maxLength={120} placeholder="Optional" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="status">Status</Label>
            <Select id="status" name="status" defaultValue="confirmed">
              <option value="confirmed">Confirmed</option>
              <option value="enquiry">Enquiry — holds the rooms, not yet confirmed</option>
            </Select>
          </div>
        </FieldRow>
        <FieldRow cols={3} className="mt-3">
          <div className="space-y-1.5">
            <Label htmlFor="adults">Adults</Label>
            <Input id="adults" name="adults" inputMode="numeric" defaultValue="2" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="children">Children</Label>
            <Input id="children" name="children" inputMode="numeric" defaultValue="0" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pets">Pets</Label>
            <Input id="pets" name="pets" inputMode="numeric" defaultValue="0" />
          </div>
        </FieldRow>
        <div className="mt-3 space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" name="notes" rows={2} maxLength={1000} />
        </div>
      </Section>

      <FormMessage error={state?.error} />
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Saving…" : "Book the stay"}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { addStayRoom, removeStayRoom } from "@/lib/birdwing/actions";
import type { StayRoomLine } from "@/lib/birdwing/queries";
import { formatDate } from "@/lib/format";
import { Trash2 } from "lucide-react";
import { useActionState, useState, useTransition } from "react";

export function RoomsPanel({
  stayId,
  arrival,
  departure,
  rooms,
  options,
  editable,
  legacyRoomCount,
}: {
  stayId: string;
  arrival: string;
  departure: string;
  rooms: StayRoomLine[];
  options: { id: string; code: string }[];
  editable: boolean;
  legacyRoomCount: number | null;
}) {
  const [adding, setAdding] = useState(false);
  const live = rooms.filter((room) => !room.released);
  const released = rooms.filter((room) => room.released);
  const dayVisit = arrival === departure;

  return (
    <Section
      title="Rooms"
      note={
        dayVisit
          ? "A day visit — no night, so no room."
          : live.length === 0 && legacyRoomCount
            ? `From the old sheet: ${legacyRoomCount} room${legacyRoomCount === 1 ? "" : "s"}, never named.`
            : undefined
      }
      aside={
        editable && !dayVisit && !adding ? (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            Add a room
          </Button>
        ) : null
      }
    >
      {live.length === 0 && released.length === 0 && !adding ? (
        <p className="text-muted text-sm">No room on this stay.</p>
      ) : (
        <ul className="divide-border divide-y">
          {live.map((room) => (
            <RoomLine key={room.id} room={room} editable={editable} />
          ))}
          {released.map((room) => (
            <RoomLine key={room.id} room={room} editable={false} />
          ))}
        </ul>
      )}
      {adding && (
        <AddRoomForm
          stayId={stayId}
          arrival={arrival}
          departure={departure}
          options={options}
          onDone={() => setAdding(false)}
        />
      )}
    </Section>
  );
}

function RoomLine({ room, editable }: { room: StayRoomLine; editable: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2.5">
      <div className="min-w-0 text-sm">
        <span className={room.released ? "text-muted line-through" : "text-foreground font-medium"}>
          {room.roomCode}
        </span>
        <span className="text-muted">
          {" "}
          · {formatDate(room.from)} → {formatDate(room.to)} · {room.nights} night
          {room.nights === 1 ? "" : "s"}
          {room.extraBeds > 0
            ? ` · ${room.extraBeds} extra bed${room.extraBeds === 1 ? "" : "s"}`
            : ""}
          {room.released ? " · let go when cancelled" : ""}
        </span>
        <FormMessage error={error} size="xs" />
      </div>
      {editable && !room.released && (
        <IconButton
          aria-label={`Remove ${room.roomCode}`}
          tone="danger"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await removeStayRoom(room.id);
              if (result?.error) setError(result.error);
            })
          }
        >
          <Trash2 className="size-4" />
        </IconButton>
      )}
    </li>
  );
}

function AddRoomForm({
  stayId,
  arrival,
  departure,
  options,
  onDone,
}: {
  stayId: string;
  arrival: string;
  departure: string;
  options: { id: string; code: string }[];
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    async (prev: { error?: string } | undefined, formData: FormData) => {
      const result = await addStayRoom(stayId, prev, formData);
      if (!result?.error) onDone();
      return result;
    },
    undefined,
  );
  return (
    <form action={formAction} className="border-border mt-3 space-y-3 border-t pt-3">
      <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="room-pick">Room</Label>
          <Select id="room-pick" name="room_id" required defaultValue="">
            <option value="" disabled>
              Pick…
            </option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.code}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="room-from">First night</Label>
          <Input
            id="room-from"
            name="from"
            type="date"
            defaultValue={arrival}
            min={arrival}
            max={departure}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="room-to">Leaves on</Label>
          <Input
            id="room-to"
            name="to"
            type="date"
            defaultValue={departure}
            min={arrival}
            max={departure}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="room-beds">Extra beds</Label>
          <Input id="room-beds" name="extra_beds" inputMode="numeric" defaultValue="0" />
        </div>
      </fieldset>
      <FormMessage error={state?.error} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Adding…" : "Add room"}
        </Button>
      </div>
    </form>
  );
}

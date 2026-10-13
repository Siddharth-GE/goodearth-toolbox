"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBlock } from "@/lib/birdwing/actions";
import { addDays } from "@/lib/birdwing/calendar";

/**
 * Taking rooms out of use — painting, a leak, the owner's own nights. A
 * block holds the rooms like a stay does (nobody can book over it) and
 * carries no guest and no money.
 */
export function BlockRoomsDialog({
  rooms,
  defaultFrom,
}: {
  rooms: { id: string; code: string }[];
  defaultFrom: string;
}) {
  return (
    <RecordFormDialog
      label="room block"
      isEdit={false}
      action={createBlock}
      trigger={
        <Button variant="secondary" size="sm">
          Block rooms
        </Button>
      }
    >
      <fieldset className="space-y-1.5">
        <legend className="text-foreground mb-1.5 text-sm font-medium">Rooms</legend>
        <div className="flex flex-wrap gap-4">
          {rooms.map((room) => (
            <label key={room.id} className="inline-flex items-center gap-2 text-sm">
              <Checkbox name="room_id" value={room.id} />
              {room.code}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="block-from">First night</Label>
          <Input id="block-from" name="from" type="date" defaultValue={defaultFrom} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="block-to">Free again on</Label>
          <Input
            id="block-to"
            name="to"
            type="date"
            defaultValue={addDays(defaultFrom, 1)}
            required
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="block-note">Why</Label>
        <Input id="block-note" name="note" required maxLength={200} placeholder="e.g. Painting" />
      </div>
    </RecordFormDialog>
  );
}

"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import type { CostCentreRow, RateCardRow, RoomRow } from "@/lib/birdwing/queries";
import { CHARGE_KINDS, KIND_LABELS } from "@/lib/birdwing/shared";
import { saveCostCentre, saveRateCardItem, saveRoom } from "@/lib/birdwing/settings-actions";
import { formatMoney, formatQuantity } from "@/lib/format";

const editTrigger = (
  <Button variant="ghost" size="sm">
    Edit
  </Button>
);

function OnOff({ active, off = "Switched off" }: { active: boolean; off?: string }) {
  return active ? <Badge variant="success">On</Badge> : <Badge variant="neutral">{off}</Badge>;
}

function ActiveBox({ defaultChecked }: { defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox name="is_active" defaultChecked={defaultChecked} />
      In use
    </label>
  );
}

// ---------------------------------------------------------------------
// The rate card
// ---------------------------------------------------------------------

/**
 * What each thing costs BEFORE GST, its GST and its SAC. The old laptop
 * app's thirteen heads arrive switched off: read each, correct it, and
 * switch on the ones that are right — only those are offered on a stay.
 */
export function RateCardSection({ items }: { items: RateCardRow[] }) {
  const off = items.filter((item) => !item.isActive).length;
  return (
    <Section
      title="Rate card"
      note={
        off > 0
          ? `${off} switched off — staff can only charge what is on. Rates are before GST.`
          : "Rates are before GST."
      }
      aside={
        <RecordFormDialog label="charge" isEdit={false} action={saveRateCardItem.bind(null, null)}>
          <RateCardFields />
        </RecordFormDialog>
      }
    >
      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell>Charge</TableHeaderCell>
            <TableHeaderCell className="text-right">Rate</TableHeaderCell>
            <TableHeaderCell className="text-right">GST</TableHeaderCell>
            <TableHeaderCell className="hidden sm:table-cell">SAC</TableHeaderCell>
            <TableHeaderCell />
            <TableHeaderCell />
          </tr>
        </TableHead>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <span className="font-medium">{item.head}</span>
                <div className="text-muted text-xs">{KIND_LABELS[item.kind]}</div>
              </TableCell>
              <TableCell className="text-right font-mono">
                {item.defaultRate ? formatMoney(item.defaultRate) : "On the day"}
              </TableCell>
              <TableCell className="text-right">{formatQuantity(item.gstPct)}%</TableCell>
              <TableCell className="text-muted hidden font-mono sm:table-cell">
                {item.sac ?? "—"}
              </TableCell>
              <TableCell>
                <OnOff active={item.isActive} />
              </TableCell>
              <TableCell className="text-right">
                <RecordFormDialog
                  label="charge"
                  isEdit
                  trigger={editTrigger}
                  action={saveRateCardItem.bind(null, item.id)}
                >
                  <RateCardFields item={item} />
                </RecordFormDialog>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
}

function RateCardFields({ item }: { item?: RateCardRow }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="rc-head">Charge</Label>
        <Input id="rc-head" name="head" defaultValue={item?.head} required maxLength={80} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="rc-kind">Kind</Label>
          <Select id="rc-kind" name="kind" defaultValue={item?.kind ?? "food"}>
            {CHARGE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rc-rate">Rate before GST (₹)</Label>
          <Input
            id="rc-rate"
            name="default_rate"
            inputMode="decimal"
            defaultValue={item ? String(item.defaultRate) : ""}
            placeholder="0 if priced on the day"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rc-gst">GST %</Label>
          <Input
            id="rc-gst"
            name="gst_pct"
            inputMode="decimal"
            defaultValue={item ? String(item.gstPct) : "5"}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rc-sac">SAC</Label>
          <Input id="rc-sac" name="sac" defaultValue={item?.sac ?? ""} maxLength={12} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rc-sort">Order</Label>
          <Input
            id="rc-sort"
            name="sort_order"
            inputMode="numeric"
            defaultValue={String(item?.sortOrder ?? 200)}
          />
        </div>
      </div>
      <ActiveBox defaultChecked={item?.isActive ?? true} />
    </>
  );
}

// ---------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------

export function RoomsSection({ rooms }: { rooms: RoomRow[] }) {
  return (
    <Section
      title="Rooms"
      note="A room switched off can't be booked; its past stays keep it."
      aside={
        <RecordFormDialog label="room" isEdit={false} action={saveRoom.bind(null, null)}>
          <RoomFields />
        </RecordFormDialog>
      }
    >
      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell>Room</TableHeaderCell>
            <TableHeaderCell className="text-right">Most guests</TableHeaderCell>
            <TableHeaderCell />
            <TableHeaderCell />
          </tr>
        </TableHead>
        <TableBody>
          {rooms.map((room) => (
            <TableRow key={room.id}>
              <TableCell>
                <span className="font-medium">{room.code}</span>
                {room.name !== room.code && <span className="text-muted"> · {room.name}</span>}
              </TableCell>
              <TableCell className="text-right">{room.maxGuests ?? "—"}</TableCell>
              <TableCell>
                <OnOff active={room.isActive} />
              </TableCell>
              <TableCell className="text-right">
                <RecordFormDialog
                  label="room"
                  isEdit
                  trigger={editTrigger}
                  action={saveRoom.bind(null, room.id)}
                >
                  <RoomFields room={room} />
                </RecordFormDialog>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Section>
  );
}

function RoomFields({ room }: { room?: RoomRow }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="room-code">Code</Label>
          <Input
            id="room-code"
            name="code"
            defaultValue={room?.code}
            required
            maxLength={12}
            placeholder="R1"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="room-name">Name</Label>
          <Input id="room-name" name="name" defaultValue={room?.name} required maxLength={60} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="room-guests">Most guests</Label>
          <Input
            id="room-guests"
            name="max_guests"
            inputMode="numeric"
            defaultValue={room?.maxGuests ? String(room.maxGuests) : ""}
            placeholder="Not set"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="room-sort">Order</Label>
          <Input
            id="room-sort"
            name="sort_order"
            inputMode="numeric"
            defaultValue={String(room?.sortOrder ?? 100)}
          />
        </div>
      </div>
      <ActiveBox defaultChecked={room?.isActive ?? true} />
    </>
  );
}

// ---------------------------------------------------------------------
// Cost centres
// ---------------------------------------------------------------------

/** Who carries a Goodearth stay: Marketing for a prospect, Directors for theirs. */
export function CostCentresSection({ centres }: { centres: CostCentreRow[] }) {
  return (
    <Section
      title="Cost centres"
      note="A Goodearth stay is charged to one of these."
      aside={
        <RecordFormDialog
          label="cost centre"
          isEdit={false}
          action={saveCostCentre.bind(null, null)}
        >
          <CentreFields />
        </RecordFormDialog>
      }
    >
      <ul className="divide-border divide-y">
        {centres.map((centre) => (
          <li key={centre.id} className="flex items-center justify-between gap-3 py-2">
            <span className="text-sm font-medium">{centre.name}</span>
            <span className="flex items-center gap-2">
              <OnOff active={centre.isActive} />
              <RecordFormDialog
                label="cost centre"
                isEdit
                trigger={editTrigger}
                action={saveCostCentre.bind(null, centre.id)}
              >
                <CentreFields centre={centre} />
              </RecordFormDialog>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function CentreFields({ centre }: { centre?: CostCentreRow }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="cc-name">Name</Label>
        <Input id="cc-name" name="name" defaultValue={centre?.name} required maxLength={60} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="cc-sort">Order</Label>
        <Input
          id="cc-sort"
          name="sort_order"
          inputMode="numeric"
          defaultValue={String(centre?.sortOrder ?? 100)}
        />
      </div>
      <ActiveBox defaultChecked={centre?.isActive ?? true} />
    </>
  );
}

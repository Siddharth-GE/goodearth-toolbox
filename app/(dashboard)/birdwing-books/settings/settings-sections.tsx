"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import type { HeadRow, PayRuleRow, StaffRow } from "@/lib/birdwing-books/queries";
import { saveHead, savePayRule, saveStaff } from "@/lib/birdwing-books/settings-actions";
import { formatDate, formatMoney } from "@/lib/format";

const money = (value: number) => formatMoney(value, { paise: value % 1 !== 0 });

function ActiveBox({ defaultChecked }: { defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox name="is_active" defaultChecked={defaultChecked} />
      Working here now
    </label>
  );
}

/** Each person and their rules, newest first. A raise is a new rule from its first day, so last year's salaries read last year's rule. No shift means a fixed salary. */
export function StaffSection({
  staff,
  rules,
  profiles,
}: {
  staff: StaffRow[];
  rules: PayRuleRow[];
  profiles: { id: string; name: string }[];
}) {
  return (
    <Section
      title="Staff and pay"
      note="Pay is base + overtime outside the shift + room-days and guest-days on days worked."
      aside={
        <RecordFormDialog label="person" isEdit={false} action={saveStaff.bind(null, null)}>
          <StaffFields profiles={profiles} />
        </RecordFormDialog>
      }
    >
      {staff.length === 0 ? (
        <p className="text-muted text-sm">Nobody yet.</p>
      ) : (
        <ul className="divide-border divide-y">
          {staff.map((person) => {
            const theirs = rules.filter((rule) => rule.staffId === person.id);
            return (
              <li key={person.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm">
                    <span className="font-medium">{person.name}</span>
                    {person.role && <span className="text-muted"> · {person.role}</span>}
                    {!person.isActive && (
                      <Badge variant="neutral" className="ml-2">
                        Left
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <RecordFormDialog
                      label="pay rule"
                      isEdit={false}
                      action={savePayRule.bind(null, null)}
                      trigger={
                        <Button variant="secondary" size="sm">
                          New pay rule
                        </Button>
                      }
                    >
                      <PayRuleFields staffId={person.id} />
                    </RecordFormDialog>
                    <RecordFormDialog
                      label="person"
                      isEdit
                      action={saveStaff.bind(null, person.id)}
                      trigger={
                        <Button variant="ghost" size="sm">
                          Edit
                        </Button>
                      }
                    >
                      <StaffFields person={person} profiles={profiles} />
                    </RecordFormDialog>
                  </div>
                </div>
                {theirs.length === 0 ? (
                  <p className="text-warning text-xs">No pay rule — no salary can be worked out.</p>
                ) : (
                  <ul className="space-y-1">
                    {theirs.map((rule) => (
                      <li
                        key={rule.id}
                        className="text-muted flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <span>
                          From {formatDate(rule.effectiveFrom)}: {money(rule.baseSalary)} a month
                          {rule.shiftStart
                            ? ` · shift ${rule.shiftStart}–${rule.shiftEnd}`
                            : " · fixed"}
                          {rule.otRatePerHr ? ` · ${money(rule.otRatePerHr)}/hr OT` : ""}
                          {rule.roomDayRate ? ` · ${money(rule.roomDayRate)} a room-day` : ""}
                          {rule.guestDayRate ? ` · ${money(rule.guestDayRate)} a guest-day` : ""}
                          {rule.notes ? ` · ${rule.notes}` : ""}
                        </span>
                        <RecordFormDialog
                          label="pay rule"
                          isEdit
                          action={savePayRule.bind(null, rule.id)}
                          trigger={
                            <Button variant="ghost" size="sm">
                              Edit
                            </Button>
                          }
                        >
                          <PayRuleFields staffId={person.id} rule={rule} />
                        </RecordFormDialog>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function StaffFields({
  person,
  profiles,
}: {
  person?: StaffRow;
  profiles: { id: string; name: string }[];
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="st-name">Name</Label>
          <Input id="st-name" name="name" defaultValue={person?.name} required maxLength={80} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="st-role">Job</Label>
          <Input
            id="st-role"
            name="role"
            defaultValue={person?.role ?? ""}
            maxLength={60}
            placeholder="Caretaker, cook…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="st-joined">Joined</Label>
          <Input
            id="st-joined"
            name="joined_on"
            type="date"
            defaultValue={person?.joinedOn ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="st-order">Order</Label>
          <Input
            id="st-order"
            name="sort_order"
            inputMode="numeric"
            defaultValue={String(person?.sortOrder ?? 100)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="st-profile">Their toolbox account</Label>
        <Select id="st-profile" name="profile_id" defaultValue={person?.profileId ?? ""}>
          <option value="">None</option>
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </Select>
      </div>
      <ActiveBox defaultChecked={person?.isActive ?? true} />
    </>
  );
}

function PayRuleFields({ staffId, rule }: { staffId: string; rule?: PayRuleRow }) {
  return (
    <>
      <input type="hidden" name="staff_id" value={staffId} />
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pr-from">Starts on</Label>
          <Input
            id="pr-from"
            name="effective_from"
            type="date"
            defaultValue={rule?.effectiveFrom ?? ""}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-base">Base a month (₹)</Label>
          <Input
            id="pr-base"
            name="base_salary"
            inputMode="decimal"
            defaultValue={rule ? String(rule.baseSalary) : ""}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-start">Shift starts</Label>
          <Input
            id="pr-start"
            name="shift_start"
            type="time"
            defaultValue={rule?.shiftStart ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-end">Shift ends</Label>
          <Input id="pr-end" name="shift_end" type="time" defaultValue={rule?.shiftEnd ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-ot">Overtime ₹ an hour</Label>
          <Input
            id="pr-ot"
            name="ot_rate_per_hr"
            inputMode="decimal"
            defaultValue={rule?.otRatePerHr ? String(rule.otRatePerHr) : ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-room">₹ a room-day</Label>
          <Input
            id="pr-room"
            name="room_day_rate"
            inputMode="decimal"
            defaultValue={rule?.roomDayRate ? String(rule.roomDayRate) : ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pr-guest">₹ a guest-day</Label>
          <Input
            id="pr-guest"
            name="guest_day_rate"
            inputMode="decimal"
            defaultValue={rule?.guestDayRate ? String(rule.guestDayRate) : ""}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="pr-notes">Note</Label>
        <Input id="pr-notes" name="notes" defaultValue={rule?.notes ?? ""} maxLength={200} />
      </div>
      <p className="text-muted text-xs">
        Leave the shift empty for a fixed salary. A room-day is one occupied room on a day they
        worked; a guest-day, one guest in the house on such a day.
      </p>
    </>
  );
}

export function HeadsSection({ heads }: { heads: HeadRow[] }) {
  return (
    <Section
      title="Expense heads"
      note="Staff Salaries is where confirmed salaries go."
      aside={
        <RecordFormDialog label="head" isEdit={false} action={saveHead.bind(null, null)}>
          <HeadFields />
        </RecordFormDialog>
      }
    >
      <ul className="divide-border divide-y">
        {heads.map((head) => (
          <li key={head.id} className="flex items-center justify-between gap-3 py-2">
            <span className="text-sm font-medium">
              {head.name}
              {head.isSalary && (
                <Badge variant="info" className="ml-2">
                  Salaries
                </Badge>
              )}
              {!head.isActive && (
                <Badge variant="neutral" className="ml-2">
                  Switched off
                </Badge>
              )}
            </span>
            <RecordFormDialog
              label="head"
              isEdit
              action={saveHead.bind(null, head.id)}
              trigger={
                <Button variant="ghost" size="sm">
                  Edit
                </Button>
              }
            >
              <HeadFields head={head} />
            </RecordFormDialog>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function HeadFields({ head }: { head?: HeadRow }) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="h-name">Name</Label>
        <Input id="h-name" name="name" defaultValue={head?.name} required maxLength={60} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="h-order">Order</Label>
        <Input
          id="h-order"
          name="sort_order"
          inputMode="numeric"
          defaultValue={String(head?.sortOrder ?? 100)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="is_active" defaultChecked={head?.isActive ?? true} />
        In use
      </label>
    </>
  );
}

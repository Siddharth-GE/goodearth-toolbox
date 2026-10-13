"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldRow, Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveCheckinDetails, updateStay } from "@/lib/birdwing/actions";
import type { StayDetail } from "@/lib/birdwing/queries";
import {
  CHANNELS,
  CHANNEL_LABELS,
  ID_TYPES,
  ID_TYPE_LABELS,
  STAY_USES,
  USE_LABELS,
  isInternalUse,
  type StayUse,
} from "@/lib/birdwing/shared";
import { useActionState, useEffect, useRef, useState } from "react";

/** "Saved" for a moment after a save that worked — a form that stays open needs it. */
function useSaved(pending: boolean, error: string | undefined) {
  const [saved, setSaved] = useState(false);
  const was = useRef(false);
  useEffect(() => {
    const finished = was.current && !pending;
    was.current = pending;
    if (!finished || error) return;
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [pending, error]);
  return saved;
}

/** Who, when, how many, and the money adjustments. */
export function StayDetailsForm({
  stay,
  costCentres,
}: {
  stay: StayDetail;
  costCentres: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(updateStay.bind(null, stay.id), undefined);
  const saved = useSaved(pending, state?.error);
  const [use, setUse] = useState<StayUse>(stay.use ?? "guest");

  return (
    <Section title="Booking details" collapsible defaultOpen={false}>
      <form action={formAction} className="space-y-3">
        <fieldset disabled={pending} className="space-y-3">
          <FieldRow cols={3}>
            <div className="space-y-1.5">
              <Label htmlFor="d-use">Who it is for</Label>
              <Select
                id="d-use"
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
                <Label htmlFor="d-centre">Charged to</Label>
                <Select id="d-centre" name="cost_centre_id" defaultValue={stay.costCentreId ?? ""}>
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
              <Label htmlFor="d-channel">Booked through</Label>
              <Select id="d-channel" name="channel" defaultValue={stay.channel}>
                {CHANNELS.map((value) => (
                  <option key={value} value={value}>
                    {CHANNEL_LABELS[value]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-ref">Referred by</Label>
              <Input
                id="d-ref"
                name="referred_by"
                defaultValue={stay.referredBy ?? ""}
                maxLength={120}
              />
            </div>
          </FieldRow>
          <FieldRow cols={3}>
            <div className="space-y-1.5">
              <Label htmlFor="d-arrival">Arrival</Label>
              <Input
                id="d-arrival"
                name="arrival"
                type="date"
                defaultValue={stay.arrival}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-departure">Departure</Label>
              <Input
                id="d-departure"
                name="departure"
                type="date"
                defaultValue={stay.departure}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-month">Counted in</Label>
              <Input
                id="d-month"
                name="accounting_month"
                type="month"
                defaultValue={stay.accountingMonth.slice(0, 7)}
                required
              />
            </div>
          </FieldRow>
          <FieldRow cols={3}>
            <div className="space-y-1.5">
              <Label htmlFor="d-adults">Adults</Label>
              <Input
                id="d-adults"
                name="adults"
                inputMode="numeric"
                defaultValue={String(stay.adults)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-children">Children</Label>
              <Input
                id="d-children"
                name="children"
                inputMode="numeric"
                defaultValue={String(stay.children)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-pets">Pets</Label>
              <Input id="d-pets" name="pets" inputMode="numeric" defaultValue={String(stay.pets)} />
            </div>
          </FieldRow>
          <FieldRow cols={2}>
            <div className="space-y-1.5">
              <Label htmlFor="d-ota">OTA commission (₹)</Label>
              <Input
                id="d-ota"
                name="ota_commission"
                inputMode="decimal"
                defaultValue={stay.otaCommission ? String(stay.otaCommission) : ""}
                placeholder="What Airbnb, Booking.com or MMT kept"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-discount">Discount (₹)</Label>
              <Input
                id="d-discount"
                name="discount"
                inputMode="decimal"
                defaultValue={stay.discount ? String(stay.discount) : ""}
                placeholder="Given to the guest"
              />
            </div>
          </FieldRow>
          <div className="space-y-1.5">
            <Label htmlFor="d-notes">Notes</Label>
            <Textarea
              id="d-notes"
              name="notes"
              rows={2}
              maxLength={1000}
              defaultValue={stay.notes ?? ""}
            />
          </div>
        </fieldset>
        <FormMessage error={state?.error} success={saved ? "Saved." : null} />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save details"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

/**
 * Check-in: the guest's contact, their ID — its kind and last four
 * characters only, never the number — and what the kitchen and the room
 * need to know. Staff type it at arrival (the guest's own form waits for
 * a security decision, plan.md).
 */
export function CheckinForm({ stay }: { stay: StayDetail }) {
  const guest = stay.guest;
  const [state, formAction, pending] = useActionState(
    saveCheckinDetails.bind(null, stay.id, guest?.id ?? null),
    undefined,
  );
  const saved = useSaved(pending, state?.error);
  const filled = Boolean(
    stay.guestNames || stay.foodPreferences || stay.allergies || stay.requirements,
  );

  return (
    <Section
      title="Check-in details"
      note={stay.idVerified ? "ID seen" : "ID not yet seen"}
      collapsible
      defaultOpen={stay.status === "confirmed" && !filled}
    >
      <form action={formAction} className="space-y-3">
        <fieldset disabled={pending} className="space-y-3">
          {guest && (
            <FieldRow cols={3}>
              <div className="space-y-1.5">
                <Label htmlFor="c-name">Guest</Label>
                <Input
                  id="c-name"
                  name="guest_name"
                  defaultValue={guest.name}
                  required
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-phone">Phone</Label>
                <Input
                  id="c-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  defaultValue={guest.phone ?? ""}
                  maxLength={30}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-email">Email</Label>
                <Input
                  id="c-email"
                  name="email"
                  type="email"
                  defaultValue={guest.email ?? ""}
                  maxLength={120}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-city">From</Label>
                <Input id="c-city" name="city" defaultValue={guest.city ?? ""} maxLength={80} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-idtype">ID</Label>
                <Select id="c-idtype" name="id_type" defaultValue={guest.idType ?? ""}>
                  <option value="">Not given</option>
                  {ID_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {ID_TYPE_LABELS[type]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-last4">Last 4 of the ID</Label>
                <Input
                  id="c-last4"
                  name="id_last4"
                  defaultValue={guest.idLast4 ?? ""}
                  maxLength={4}
                  placeholder="Never the whole number"
                />
              </div>
            </FieldRow>
          )}
          <FieldRow cols={2}>
            <div className="space-y-1.5">
              <Label htmlFor="c-party">Everyone staying</Label>
              <Textarea
                id="c-party"
                name="guest_names"
                rows={2}
                maxLength={1000}
                defaultValue={stay.guestNames ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-food">Food</Label>
              <Textarea
                id="c-food"
                name="food_preferences"
                rows={2}
                maxLength={1000}
                defaultValue={stay.foodPreferences ?? ""}
                placeholder="Vegetarian, no onion…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-allergies">Allergies</Label>
              <Textarea
                id="c-allergies"
                name="allergies"
                rows={2}
                maxLength={1000}
                defaultValue={stay.allergies ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-needs">Anything else</Label>
              <Textarea
                id="c-needs"
                name="requirements"
                rows={2}
                maxLength={1000}
                defaultValue={stay.requirements ?? ""}
                placeholder="Arrival time, a cot, a cake…"
              />
            </div>
          </FieldRow>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox name="id_verified" defaultChecked={stay.idVerified} />I have seen the
            guest&rsquo;s ID
          </label>
        </fieldset>
        <FormMessage error={state?.error} success={saved ? "Saved." : null} />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save check-in details"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

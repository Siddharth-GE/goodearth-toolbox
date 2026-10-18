"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFoot,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableTotalCell,
} from "@/components/ui/table";
import { addCharge, deleteCharge } from "@/lib/birdwing/actions";
import { chargeAmount } from "@/lib/birdwing/money";
import type { RateCardRow, StayCharge } from "@/lib/birdwing/queries";
import { CHARGE_KINDS, KIND_LABELS } from "@/lib/birdwing/shared";
import { parseNumber } from "@/lib/form-data";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

const OTHER = "__other";

/** A rate-card head brings its rate, GST and SAC, copied onto the line. Rates are before GST unless the box says
 * otherwise (an OTA's payout is usually GST-inclusive). An issued invoice freezes them. */
export function ChargesPanel({
  stayId,
  charges,
  rateCard,
  editable,
  frozenBy,
  roomNights,
}: {
  stayId: string;
  charges: StayCharge[];
  rateCard: RateCardRow[];
  editable: boolean;
  frozenBy: string | null;
  roomNights: number;
}) {
  const [adding, setAdding] = useState(false);
  const total = charges.reduce((sum, charge) => sum + charge.amount, 0);

  return (
    <Section
      title="Charges"
      note={
        frozenBy
          ? `Invoice ${frozenBy} has been issued — cancel it to change the charges.`
          : "Rates are before GST unless marked."
      }
      aside={
        editable && !adding ? (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            Add a charge
          </Button>
        ) : null
      }
    >
      {charges.length === 0 && !adding ? (
        <p className="text-muted text-sm">Nothing charged yet.</p>
      ) : charges.length > 0 ? (
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Charge</TableHeaderCell>
              <TableHeaderCell className="text-right">Qty × rate</TableHeaderCell>
              <TableHeaderCell className="hidden text-right sm:table-cell">GST</TableHeaderCell>
              <TableHeaderCell className="text-right">Amount</TableHeaderCell>
              {editable && <TableHeaderCell className="w-10" />}
            </tr>
          </TableHead>
          <TableBody>
            {charges.map((charge) => (
              <ChargeRow key={charge.id} charge={charge} editable={editable} />
            ))}
          </TableBody>
          <TableFoot>
            <tr>
              <TableTotalCell>Total, with GST</TableTotalCell>
              <TableTotalCell />
              <TableTotalCell className="hidden sm:table-cell" />
              <TableTotalCell className="text-right font-mono">{formatMoney(total)}</TableTotalCell>
              {editable && <TableTotalCell />}
            </tr>
          </TableFoot>
        </Table>
      ) : null}
      {adding && (
        <AddChargeForm
          stayId={stayId}
          rateCard={rateCard}
          roomNights={roomNights}
          onDone={() => setAdding(false)}
        />
      )}
    </Section>
  );
}

function ChargeRow({ charge, editable }: { charge: StayCharge; editable: boolean }) {
  const { pending, error, run } = useActionRunner();
  return (
    <TableRow>
      <TableCell>
        <span className="font-medium">{charge.head}</span>
        {charge.description && <div className="text-muted text-xs">{charge.description}</div>}
        <FormMessage error={error} size="xs" />
      </TableCell>
      <TableCell className="text-right font-mono whitespace-nowrap">
        {formatQuantity(charge.qty)} × {formatMoney(charge.rate, { paise: charge.rate % 1 !== 0 })}
        {charge.rateIncludesGst && <div className="text-muted font-sans text-xs">GST included</div>}
      </TableCell>
      <TableCell className="text-muted hidden text-right sm:table-cell">
        {formatQuantity(charge.gstPct)}%
      </TableCell>
      <TableCell className="text-right font-mono whitespace-nowrap">
        {formatMoney(charge.amount, { paise: charge.amount % 1 !== 0 })}
      </TableCell>
      {editable && (
        <TableCell className="py-2">
          <IconButton
            aria-label={`Remove ${charge.head}`}
            tone="danger"
            size="sm"
            disabled={pending}
            onClick={() => run(() => deleteCharge(charge.id))}
          >
            <Trash2 className="size-4" />
          </IconButton>
        </TableCell>
      )}
    </TableRow>
  );
}

function AddChargeForm({
  stayId,
  rateCard,
  roomNights,
  onDone,
}: {
  stayId: string;
  rateCard: RateCardRow[];
  roomNights: number;
  onDone: () => void;
}) {
  const active = rateCard.filter((item) => item.isActive);
  const [headId, setHeadId] = useState(active[0]?.id ?? OTHER);
  const picked = active.find((item) => item.id === headId) ?? null;
  const defaultQty = (item: RateCardRow | null) =>
    item?.kind === "room" && roomNights > 0 ? String(roomNights) : "1";
  const [qty, setQty] = useState(defaultQty(picked));
  const [rate, setRate] = useState(picked ? String(picked.defaultRate) : "");
  const [gst, setGst] = useState(picked ? String(picked.gstPct) : "0");
  const [inclusive, setInclusive] = useState(false);

  const [state, formAction, pending] = useActionState(
    async (prev: { error?: string } | undefined, formData: FormData) => {
      const result = await addCharge(stayId, prev, formData);
      if (!result?.error) onDone();
      return result;
    },
    undefined,
  );

  const preview = chargeAmount({
    qty: parseNumber(qty) || 0,
    rate: parseNumber(rate) || 0,
    gstPct: (picked ? picked.gstPct : parseNumber(gst)) || 0,
    rateIncludesGst: inclusive,
  });

  return (
    <form action={formAction} className="border-border mt-3 space-y-3 border-t pt-3">
      <fieldset disabled={pending} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-1">
            <Label htmlFor="charge-head">Charge</Label>
            <Select
              id="charge-head"
              value={headId}
              onChange={(event) => {
                const next = active.find((item) => item.id === event.target.value) ?? null;
                setHeadId(event.target.value);
                setRate(next ? String(next.defaultRate) : "");
                setGst(next ? String(next.gstPct) : "0");
                setQty(defaultQty(next));
              }}
            >
              {active.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.head}
                </option>
              ))}
              <option value={OTHER}>Something else…</option>
            </Select>
            {picked && <input type="hidden" name="rate_card_id" value={picked.id} />}
            {active.length === 0 && (
              <p className="text-muted text-xs">
                The rate card has nothing switched on yet — an admin does that in Settings.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="charge-qty">Quantity</Label>
            <Input
              id="charge-qty"
              name="qty"
              inputMode="decimal"
              value={qty}
              onChange={(event) => setQty(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="charge-rate">Rate (₹)</Label>
            <Input
              id="charge-rate"
              name="rate"
              inputMode="decimal"
              value={rate}
              onChange={(event) => setRate(event.target.value)}
              required
            />
          </div>
        </div>

        {!picked && (
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="charge-name">What it is</Label>
              <Input id="charge-name" name="head" required maxLength={80} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="charge-kind">Kind</Label>
              <Select id="charge-kind" name="kind" defaultValue="other">
                {CHARGE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {KIND_LABELS[kind]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="charge-gst">GST %</Label>
              <Input
                id="charge-gst"
                name="gst_pct"
                inputMode="decimal"
                value={gst}
                onChange={(event) => setGst(event.target.value)}
              />
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="charge-note">Note on the invoice</Label>
            <Input
              id="charge-note"
              name="description"
              maxLength={160}
              placeholder="Optional, e.g. 2 rooms × 3 nights"
            />
          </div>
          <label className="flex items-center gap-2 self-end pb-3 text-sm">
            <Checkbox
              name="rate_includes_gst"
              checked={inclusive}
              onChange={(event) => setInclusive(event.target.checked)}
            />
            The rate already includes GST
          </label>
        </div>
      </fieldset>
      <FormMessage error={state?.error} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted text-sm">
          Comes to{" "}
          <span className="text-foreground font-mono font-medium">
            {formatMoney(preview, { paise: preview % 1 !== 0 })}
          </span>{" "}
          with {picked ? formatQuantity(picked.gstPct) : gst || "0"}% GST
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Adding…" : "Add charge"}
          </Button>
        </div>
      </div>
    </form>
  );
}

"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { sendLabourToBill } from "@/lib/bills/labour-actions";
import {
  dailyWagesTotal,
  describeEntry,
  dayRatesProblem,
  entriesProblem,
  headsOf,
  pieceWorkTotal,
  suggestedPieceRate,
  type LabourEntry,
} from "@/lib/bills/labour-billing";
import type { LabourBillingOptions, UnbilledEntry } from "@/lib/bills/labour-queries";
import { formatCount, formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { useMemo, useState, useTransition } from "react";

/**
 * Send to Bill: tick the entries, give the rates, press once. Daily
 * wages: a day rate per trade (the contractor's last bill's suggested),
 * heads × rates, and a total that may be set by hand with a reason.
 * Piece-work: the contractor's approved work order, and a rate per entry
 * (the work order's for that work, else the rate book's; a lump sum
 * typed). The figure shown is the figure the bill will carry.
 */

const asEntry = (row: UnbilledEntry): LabourEntry => ({
  id: row.id,
  kind: row.kind,
  contractorId: row.contractor_id,
  projectId: row.project_id,
  workItemId: row.work_item_id,
  masons: row.masons,
  helpers: row.helpers,
  others: row.others,
  quantity: row.quantity,
});

const typed = (text: string) => (text.trim() === "" ? null : Number(text.trim()));
const show = (value: number | null | undefined) => (value == null ? "" : String(value));

export function SendToBill({
  entries,
  options,
  gstRates,
}: {
  entries: UnbilledEntry[];
  options: LabourBillingOptions;
  gstRates: number[];
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [dayRates, setDayRates] = useState({ mason: "", helper: "", other: "" });
  const [pieceRates, setPieceRates] = useState<Record<string, string>>({});
  const [workOrderId, setWorkOrderId] = useState("");
  const [gst, setGst] = useState("0");
  const [override, setOverride] = useState("");
  const [overrideNote, setOverrideNote] = useState("");
  const [reference, setReference] = useState("");
  const [billDate, setBillDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [sending, startSending] = useTransition();

  const rateBook = useMemo(() => new Map(Object.entries(options.rateBook)), [options.rateBook]);
  const chosen = entries.filter((entry) => ticked.has(entry.id));
  const chosenEntries = chosen.map(asEntry);
  const groupProblem = chosen.length ? entriesProblem(chosenEntries) : undefined;
  const first = chosen[0];
  const isDaily = first?.kind === "nmr";
  const gstPct = Number(gst);

  // Suggestions arrive the moment the first entry of a group is ticked.
  const suggestFor = (entry: UnbilledEntry, next: Set<string>) => {
    if (next.size !== 1) return;
    if (entry.kind === "nmr") {
      const last = options.dayRates[entry.contractor_id];
      setDayRates({
        mason: show(last?.mason),
        helper: show(last?.helper),
        other: show(last?.other),
      });
    } else {
      const order = options.workOrders.find(
        (candidate) =>
          candidate.vendor_id === entry.contractor_id && candidate.project_id === entry.project_id,
      );
      setWorkOrderId(order?.id ?? "");
    }
  };

  const toggle = (entry: UnbilledEntry, on: boolean) => {
    const next = new Set(ticked);
    if (on) next.add(entry.id);
    else next.delete(entry.id);
    setTicked(next);
    setError(undefined);
    if (on) suggestFor(entry, next);
  };

  const workOrders = first
    ? options.workOrders.filter(
        (order) => order.vendor_id === first.contractor_id && order.project_id === first.project_id,
      )
    : [];
  const workOrder = workOrders.find((order) => order.id === workOrderId);
  const rateFor = (entry: UnbilledEntry): string =>
    pieceRates[entry.id] ??
    show(suggestedPieceRate(asEntry(entry), workOrder?.lines ?? [], rateBook));

  const rates = {
    mason: typed(dayRates.mason),
    helper: typed(dayRates.helper),
    other: typed(dayRates.other),
  };
  const heads = headsOf(chosenEntries);
  const pieceRateValues = Object.fromEntries(
    chosen.map((entry) => [entry.id, typed(rateFor(entry))]),
  );
  const computed = isDaily
    ? dailyWagesTotal(heads, rates, gstPct)
    : pieceWorkTotal(chosenEntries, pieceRateValues, gstPct);
  const overrideValue = typed(override);

  const problem =
    groupProblem ??
    (chosen.length === 0
      ? "Tick the labour entries to bill."
      : isDaily
        ? (dayRatesProblem(heads, rates) ??
          (overrideValue !== null && !overrideNote.trim()
            ? "Say why the total differs from heads × rates."
            : undefined))
        : !workOrderId
          ? "Piece-work is billed against the contractor's approved work order — pick one."
          : Object.values(pieceRateValues).some((rate) => rate === null)
            ? "Give a rate for every piece-work entry."
            : undefined) ??
    (!reference.trim()
      ? "Type the muster roll or bill reference."
      : !billDate
        ? "Pick the bill date."
        : undefined);

  const send = () =>
    startSending(async () => {
      setError(undefined);
      // A success lands on the new bill; only a refusal comes back.
      const result = await sendLabourToBill({
        logIds: chosen.map((entry) => entry.id),
        kind: isDaily ? "nmr" : "pw",
        labourContractId: isDaily ? null : workOrderId,
        billReference: reference,
        billDate,
        dayRates: isDaily ? rates : null,
        pieceRates: isDaily ? null : pieceRateValues,
        gstPct,
        totalOverride: isDaily ? overrideValue : null,
        overrideNote: isDaily ? overrideNote || null : null,
        note: note || null,
      });
      if (result?.error) setError(result.error);
    });

  return (
    <div className="space-y-4 pb-6">
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell className="w-10"></TableHeaderCell>
            <TableHeaderCell>Day</TableHeaderCell>
            <TableHeaderCell>Contractor</TableHeaderCell>
            <TableHeaderCell>Villa</TableHeaderCell>
            <TableHeaderCell>Work</TableHeaderCell>
            <TableHeaderCell>Logged</TableHeaderCell>
            {chosen.length > 0 && !isDaily && !groupProblem && (
              <TableHeaderCell className="w-36">Rate</TableHeaderCell>
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {entries.map((entry) => {
            const on = ticked.has(entry.id);
            return (
              <TableRow key={entry.id} className="align-top">
                <TableCell>
                  <Checkbox
                    checked={on}
                    onChange={(event) => toggle(entry, event.target.checked)}
                    aria-label={`Bill ${entry.contractor_name}, ${formatDate(entry.log_date)}`}
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(entry.log_date)}</TableCell>
                <TableCell className="text-foreground">{entry.contractor_name}</TableCell>
                <TableCell>
                  {entry.place}
                  <div className="text-muted text-xs">{entry.project_name}</div>
                </TableCell>
                <TableCell className="text-muted">{entry.work_label}</TableCell>
                <TableCell>
                  <Badge variant={entry.kind === "nmr" ? "neutral" : "info"}>
                    {entry.kind === "nmr" ? "Daily wages" : "Piece-work"}
                  </Badge>
                  <div className="text-muted mt-1 text-xs">
                    {describeEntry({
                      kind: entry.kind,
                      masons: entry.masons,
                      helpers: entry.helpers,
                      others: entry.others,
                      quantity: entry.quantity,
                      uom: entry.uom,
                      description: entry.description,
                    })}
                  </div>
                </TableCell>
                {chosen.length > 0 && !isDaily && !groupProblem && (
                  <TableCell>
                    {on && (
                      <>
                        <Input
                          type="number"
                          step="any"
                          min="0"
                          value={rateFor(entry)}
                          onChange={(event) =>
                            setPieceRates((current) => ({
                              ...current,
                              [entry.id]: event.target.value,
                            }))
                          }
                          placeholder="—"
                          className="h-9"
                          aria-label="Rate"
                        />
                        <p className="text-muted mt-1 text-xs">
                          {entry.kind === "pw_lump" ? "the amount" : `per ${entry.uom ?? "unit"}`}
                        </p>
                      </>
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {chosen.length > 0 && (
        <div className="border-border bg-surface space-y-4 rounded-2xl border p-5">
          <p className="text-foreground text-[15px] font-semibold tracking-tight">
            {`${formatCount(chosen.length)} ${chosen.length === 1 ? "entry" : "entries"} → one ${isDaily ? "daily-wages" : "piece-work"} bill`}
            {first && (
              <span className="text-muted font-normal">{` · ${first.contractor_name} · ${first.project_name}`}</span>
            )}
          </p>

          {!groupProblem && isDaily && (
            <div className="space-y-2">
              <p className="text-muted text-sm">
                {`${formatQuantity(heads.masons)} mason, ${formatQuantity(heads.helpers)} helper and ${formatQuantity(heads.others)} other man-days. Day rates from their last bill are filled in where there was one.`}
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {(["mason", "helper", "other"] as const).map((trade) => (
                  <div key={trade} className="space-y-1.5">
                    <Label htmlFor={`rate-${trade}`}>
                      {trade === "mason"
                        ? "Mason, per day"
                        : trade === "helper"
                          ? "Helper, per day"
                          : "Other, per day"}
                    </Label>
                    <Input
                      id={`rate-${trade}`}
                      type="number"
                      step="any"
                      min="0"
                      value={dayRates[trade]}
                      onChange={(event) =>
                        setDayRates((current) => ({ ...current, [trade]: event.target.value }))
                      }
                      placeholder="—"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {!groupProblem && !isDaily && (
            <div className="max-w-md space-y-1.5">
              <Label htmlFor="work-order">Work order</Label>
              <Select
                id="work-order"
                value={workOrderId}
                onChange={(event) => {
                  setWorkOrderId(event.target.value);
                  setPieceRates({});
                }}
              >
                <option value="">Pick the work order…</option>
                {workOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {`${order.reference ?? "No number"} · ${order.description}`}
                  </option>
                ))}
              </Select>
              {workOrders.length === 0 && (
                <p className="text-warning text-xs font-medium">
                  This contractor has no approved work order on this project. Make one under Bills →
                  Work orders, get it approved, then come back.
                </p>
              )}
            </div>
          )}

          {!groupProblem && (
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="labour-gst">GST</Label>
                <Select
                  id="labour-gst"
                  value={gst}
                  onChange={(event) => setGst(event.target.value)}
                >
                  {[...new Set([0, ...gstRates])]
                    .sort((a, b) => a - b)
                    .map((slab) => (
                      <option key={slab} value={String(slab)}>
                        {slab}%
                      </option>
                    ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="labour-reference">Muster roll / bill reference</Label>
                <Input
                  id="labour-reference"
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="e.g. NMR week 41"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="labour-date">Bill date</Label>
                <Input
                  id="labour-date"
                  type="date"
                  value={billDate}
                  onChange={(event) => setBillDate(event.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="labour-note">Note (optional)</Label>
                <Input
                  id="labour-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          {!groupProblem && isDaily && (
            <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="labour-override">Total by hand (optional)</Label>
                <Input
                  id="labour-override"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={override}
                  onChange={(event) => setOverride(event.target.value)}
                  placeholder="—"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="labour-override-note">Why it differs from heads × rates</Label>
                <Input
                  id="labour-override-note"
                  value={overrideNote}
                  onChange={(event) => setOverrideNote(event.target.value)}
                  placeholder="Only when the muster roll's total differs"
                  disabled={overrideValue === null}
                  autoComplete="off"
                />
              </div>
            </div>
          )}

          <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-foreground text-sm">
              {"The bill: "}
              <span className="font-mono font-semibold">
                {formatMoney(isDaily && overrideValue !== null ? overrideValue : computed, {
                  paise: true,
                })}
              </span>
              {isDaily && overrideValue !== null && (
                <span className="text-muted">{` (heads × rates make ${formatMoney(computed, { paise: true })})`}</span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {!error && problem && <p className="text-muted text-xs">{problem}</p>}
              <FormMessage error={error} size="xs" />
              <Button onClick={send} disabled={sending || Boolean(problem)}>
                {sending ? "Making the bill…" : "Send to bill"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

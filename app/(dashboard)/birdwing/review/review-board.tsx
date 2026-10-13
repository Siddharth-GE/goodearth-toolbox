"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormMessage } from "@/components/ui/form-message";
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
import { assignCostCentre, markReviewed, settleStays } from "@/lib/birdwing/actions";
import type { ReviewRow } from "@/lib/birdwing/queries";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { UseBadge } from "../_components/stay-badges";

export function ReviewBoard({
  rows,
  costCentres,
}: {
  rows: ReviewRow[];
  costCentres: { id: string; name: string }[];
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [centreId, setCentreId] = useState("");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});

  const chosen = useMemo(() => rows.filter((row) => ticked.has(row.id)), [rows, ticked]);
  const chosenPending = chosen.reduce((sum, row) => sum + Math.max(0, row.pending), 0);
  const allTicked = ticked.size === rows.length;

  const run = (work: () => Promise<{ error?: string } | undefined>, done: string) => {
    setMessage({});
    startTransition(async () => {
      const result = await work();
      if (result?.error) setMessage({ error: result.error });
      else {
        setMessage({ success: done });
        setTicked(new Set());
      }
    });
  };

  const toggle = (id: string) =>
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ids = chosen.map((row) => row.id);

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-5">
        <p className="text-muted text-sm">
          {formatCount(rows.length)} stays need a look ·{" "}
          {formatCount(rows.filter((row) => row.flags.length > 0).length)} flagged by the import ·{" "}
          {formatMoney(rows.reduce((sum, row) => sum + Math.max(0, row.pending), 0))} pending on
          Goodearth stays. Tick some, then:
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-full space-y-1.5 sm:w-52">
            <Label htmlFor="bulk-centre">Cost centre</Label>
            <Select
              id="bulk-centre"
              value={centreId}
              onChange={(event) => setCentreId(event.target.value)}
            >
              <option value="">Pick…</option>
              {costCentres.map((centre) => (
                <option key={centre.id} value={centre.id}>
                  {centre.name}
                </option>
              ))}
            </Select>
          </div>
          <Button
            variant="secondary"
            disabled={pending || ids.length === 0 || !centreId}
            onClick={() =>
              run(() => assignCostCentre(ids, centreId), "Cost centre set on the ticked stays.")
            }
          >
            Set cost centre
          </Button>
          <ConfirmDialog
            tone="primary"
            trigger={
              <Button disabled={pending || ids.length === 0}>Charge pending to cost centres</Button>
            }
            title={`Charge ${formatCount(ids.length)} stays to Goodearth?`}
            description={`Each ticked stay's pending balance (${formatMoney(chosenPending)} in all) is charged to its own cost centre, in its own month. A stay without a cost centre is named and nothing is charged.`}
            confirmLabel="Charge them"
            pendingLabel="Charging…"
            onConfirm={async () => {
              const result = await settleStays(ids, "cross_charge", "");
              if (!result?.error) {
                setMessage({ success: "Charged to their cost centres." });
                setTicked(new Set());
              }
              return result;
            }}
          />
          <ConfirmDialog
            trigger={
              <Button variant="secondary" disabled={pending || ids.length === 0}>
                Write off
              </Button>
            }
            title={`Write off ${formatCount(ids.length)} stays?`}
            description={`${formatMoney(chosenPending)} in all stops showing as pending. Use this only for money that will never come.`}
            confirmLabel="Write off"
            pendingLabel="Writing off…"
            reason={{ label: "Why", placeholder: "e.g. Old sheet, never billed" }}
            onConfirm={async (why) => {
              const result = await settleStays(ids, "write_off", why);
              if (!result?.error) {
                setMessage({ success: "Written off." });
                setTicked(new Set());
              }
              return result;
            }}
          />
          <Button
            variant="ghost"
            disabled={pending || ids.length === 0}
            onClick={() => run(() => markReviewed(ids), "Marked reviewed.")}
          >
            Mark reviewed
          </Button>
        </div>
        <FormMessage error={message.error} success={message.success} />
      </Card>

      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell className="w-10">
              <Checkbox
                aria-label="Tick every stay"
                checked={allTicked}
                indeterminate={ticked.size > 0 && !allTicked}
                onChange={() =>
                  setTicked(allTicked ? new Set() : new Set(rows.map((row) => row.id)))
                }
              />
            </TableHeaderCell>
            <TableHeaderCell>Stay</TableHeaderCell>
            <TableHeaderCell className="hidden md:table-cell">What to check</TableHeaderCell>
            <TableHeaderCell className="text-right">Pending</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="py-3">
                <Checkbox
                  aria-label={`Tick ${row.ref}`}
                  checked={ticked.has(row.id)}
                  onChange={() => toggle(row.id)}
                />
              </TableCell>
              <TableCell>
                <Link
                  href={`/birdwing/stays/${row.id}`}
                  className="text-foreground hover:text-accent font-medium"
                >
                  {row.guestName ?? "—"}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-muted font-mono text-xs">{row.ref}</span>
                  <span className="text-muted text-xs">{formatDate(row.arrival)}</span>
                  <UseBadge use={row.use} />
                  {row.use !== "guest" && (
                    <span className="text-muted text-xs">
                      {row.costCentreName ? `→ ${row.costCentreName}` : "no cost centre"}
                    </span>
                  )}
                </div>
                {row.flags.length > 0 && (
                  <p className="text-warning mt-1 text-xs md:hidden">{row.flags.join(" · ")}</p>
                )}
              </TableCell>
              <TableCell className="text-muted hidden text-xs md:table-cell">
                {row.flags.length > 0 ? row.flags.join(" · ") : "Pending, never charged"}
              </TableCell>
              <TableCell className="text-right font-mono whitespace-nowrap">
                {formatMoney(row.pending)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

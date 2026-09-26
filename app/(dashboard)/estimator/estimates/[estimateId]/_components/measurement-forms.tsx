"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Figure } from "@/components/ui/figure";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { measurementQuantity, sheetTotal } from "@/lib/estimator/calc";
import { Select } from "@/components/ui/select";
import {
  addLineMeasurement,
  copyMeasurementRows,
  duplicateLineMeasurement,
  removeLineMeasurement,
  updateLineMeasurement,
  type MeasurementFields,
} from "@/lib/estimator/estimate-actions";
import type { MeasurementRow } from "@/lib/estimator/estimate-queries";
import { formatQuantity } from "@/lib/format";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";

type Box = "nos" | "length" | "breadth" | "depth";
const BOXES: { key: Box; label: string }[] = [
  { key: "nos", label: "Nos" },
  { key: "length", label: "Length" },
  { key: "breadth", label: "Breadth" },
  { key: "depth", label: "Depth" },
];

/**
 * The measurement sheet under one work (0096) — the QS layer the
 * founder asked for on 2026-09-25. One row per wall, slab or footing:
 * Nos × Length × Breadth × Depth, a blank box not used. The rows add up
 * to the work's quantity on the BOQ. Read-only once the estimate is
 * submitted, where it stands as the record of how the quantity was got.
 */
export function MeasurementSheetDialog({
  lineId,
  workName,
  workUom,
  rows,
  readOnly,
  otherLines = [],
}: {
  lineId: string;
  workName: string;
  workUom: string | null;
  rows: MeasurementRow[];
  readOnly: boolean;
  /** The estimate's other works, for "copy these rows to…". */
  otherLines?: { id: string; name: string; uom: string | null }[];
}) {
  const measured = rows.length > 0;
  const total = sheetTotal(rows);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">
          {measured ? (
            <span className="inline-flex items-center gap-1.5">
              {readOnly ? "Measurements" : "Measure"}
              <Badge variant="info">Measured</Badge>
            </span>
          ) : (
            "Measure"
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl sm:max-h-[90dvh] sm:overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{workName} — measurements</DialogTitle>
        </DialogHeader>

        {measured && !readOnly ? (
          <ul className="divide-border divide-y">
            {rows.map((row) => (
              <EditableMeasurementRow key={row.id} row={row} workUom={workUom} />
            ))}
          </ul>
        ) : measured ? (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Description</TableHeaderCell>
                {BOXES.map((box) => (
                  <TableHeaderCell key={box.key} className="text-right">
                    {box.label}
                  </TableHeaderCell>
                ))}
                <TableHeaderCell className="text-right">Quantity</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-foreground text-sm">
                    {row.description ?? "—"}
                  </TableCell>
                  {BOXES.map((box) => (
                    <TableCell key={box.key} className="text-right font-mono text-sm">
                      {row[box.key] === null ? "" : formatQuantity(row[box.key])}
                    </TableCell>
                  ))}
                  <TableCell className="text-foreground text-right font-mono text-sm">
                    {formatQuantity(measurementQuantity(row))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-muted text-sm">
            No measurements yet — the quantity on the estimate is typed. Add the first row below and
            the sheet&apos;s total becomes the quantity.
          </p>
        )}

        {measured && (
          <Figure
            label="Total"
            value={`${formatQuantity(total)}${workUom ? ` ${workUom}` : ""}`}
            hint="This is the work's quantity on the estimate."
            size="lg"
          />
        )}

        {!readOnly && <AddMeasurementForm lineId={lineId} />}

        {!readOnly && measured && otherLines.length > 0 && (
          <CopyRowsForm fromLineId={lineId} otherLines={otherLines} />
        )}

        <p className="text-muted text-xs">
          Blank means not used: 12 in Nos alone is 12; 1 × 4 × 3 × 0.15 is 1.8.
          {workUom ? ` Enter sizes so the result comes out in ${workUom}` : " Enter sizes"} — the
          app does not convert units.
          {!readOnly && measured && " Removing the last row keeps the total as a typed quantity."}
        </p>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Blank is "not used"; anything else is read the way people type it. */
function readBox(value: string): number | null {
  const cleaned = value.replace(/[,\s]/g, "");
  return cleaned === "" ? null : Number(cleaned);
}

const show = (value: number | null) => (value === null ? "" : String(value));

/**
 * One row, every box saved on blur or Enter — the ComponentQtyField
 * shape, with blank allowed because blank means "not used". A refused
 * save puts the row back as it was and says why.
 */
function EditableMeasurementRow({ row, workUom }: { row: MeasurementRow; workUom: string | null }) {
  const initial = {
    description: row.description ?? "",
    nos: show(row.nos),
    length: show(row.length),
    breadth: show(row.breadth),
    depth: show(row.depth),
  };
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const save = () => {
    const fields: MeasurementFields = {
      description: values.description.trim() || null,
      nos: readBox(values.nos),
      length: readBox(values.length),
      breadth: readBox(values.breadth),
      depth: readBox(values.depth),
    };
    const unchanged =
      fields.description === row.description &&
      fields.nos === row.nos &&
      fields.length === row.length &&
      fields.breadth === row.breadth &&
      fields.depth === row.depth;
    if (unchanged) return;
    startTransition(async () => {
      const result = await updateLineMeasurement(row.id, fields);
      if (result?.error) {
        setError(result.error);
        setValues(initial);
      } else setError(undefined);
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") (event.target as HTMLInputElement).blur();
    if (event.key === "Escape") setValues(initial);
  };

  const live = measurementQuantity({
    nos: readBox(values.nos),
    length: readBox(values.length),
    breadth: readBox(values.breadth),
    depth: readBox(values.depth),
  });

  return (
    <li className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Input
          aria-label="Description"
          placeholder="What it is — front wall, footing F1…"
          value={values.description}
          onChange={(event) => setValues({ ...values, description: event.target.value })}
          onBlur={save}
          onKeyDown={onKeyDown}
          disabled={pending}
          className="h-9 min-w-48 flex-1 text-sm"
        />
        <RowActionButton
          label="Duplicate"
          pendingLabel="Duplicating…"
          run={() => duplicateLineMeasurement(row.id)}
        />
        <RowActionButton
          label="Remove"
          pendingLabel="Removing…"
          run={() => removeLineMeasurement(row.id)}
        />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {BOXES.map((box) => (
          <label key={box.key} className="space-y-1">
            <span className="text-muted text-xs">{box.label}</span>
            <Input
              value={values[box.key]}
              inputMode="decimal"
              onChange={(event) => setValues({ ...values, [box.key]: event.target.value })}
              onBlur={save}
              onKeyDown={onKeyDown}
              disabled={pending}
              className="h-9 text-right text-sm"
            />
          </label>
        ))}
      </div>
      <p className="text-muted text-right text-sm">
        ={" "}
        <span className="text-foreground font-mono">
          {Number.isFinite(live) ? formatQuantity(live) : "—"}
        </span>
        {workUom ? ` ${workUom}` : ""}
      </p>
      <FormMessage error={error} size="xs" />
    </li>
  );
}

/** A one-tap action on a row — Duplicate or Remove — that says why when
 * it is refused. */
function RowActionButton({
  label,
  pendingLabel,
  run,
}: {
  label: string;
  pendingLabel: string;
  run: () => Promise<{ error?: string } | undefined>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <span className="inline-flex items-center gap-1">
      <FormMessage error={error} size="xs" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await run();
            setError(result?.error);
          })
        }
      >
        {pending ? pendingLabel : label}
      </Button>
    </span>
  );
}

/** Add a row — the AddComponentForm shape. Five boxes that wrap into
 * two columns on a phone, so the Add button stays reachable. */
function AddMeasurementForm({ lineId }: { lineId: string }) {
  const [state, formAction, pending] = useActionState(
    addLineMeasurement.bind(null, lineId),
    undefined,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) formRef.current?.reset();
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <div className="col-span-2 space-y-1.5">
          <Label htmlFor={`m-description-${lineId}`}>Description</Label>
          <Input
            id={`m-description-${lineId}`}
            name="description"
            autoComplete="off"
            placeholder="e.g. Front wall"
          />
        </div>
        {BOXES.map((box) => (
          <div key={box.key} className="space-y-1.5">
            <Label htmlFor={`m-${box.key}-${lineId}`}>{box.label}</Label>
            <Input
              id={`m-${box.key}-${lineId}`}
              name={box.key}
              autoComplete="off"
              inputMode="decimal"
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2">
        <FormMessage error={state?.error} />
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add row"}
        </Button>
      </div>
    </form>
  );
}

/**
 * Copy this sheet's rows onto another work of the estimate — measure a
 * wall once, and its plaster and paint start from the same rows. They
 * land at the bottom of the other sheet as they are, to be adjusted.
 */
function CopyRowsForm({
  fromLineId,
  otherLines,
}: {
  fromLineId: string;
  otherLines: { id: string; name: string; uom: string | null }[];
}) {
  const [target, setTarget] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ error?: string; done?: string }>();

  return (
    <div className="border-border space-y-2 border-t pt-3">
      <Label htmlFor={`copy-rows-${fromLineId}`}>Copy these rows to another work</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          id={`copy-rows-${fromLineId}`}
          value={target}
          onChange={(event) => setTarget(event.target.value)}
          className="min-w-56 flex-1"
        >
          <option value="" disabled>
            Choose a work on this estimate
          </option>
          {otherLines.map((line) => (
            <option key={line.id} value={line.id}>
              {line.name}
              {line.uom ? ` (${line.uom})` : ""}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="secondary"
          disabled={pending || !target}
          onClick={() =>
            startTransition(async () => {
              const outcome = await copyMeasurementRows(fromLineId, target);
              setResult(
                outcome?.error
                  ? { error: outcome.error }
                  : { done: "Copied — open that work's sheet to adjust the sizes." },
              );
            })
          }
        >
          {pending ? "Copying…" : "Copy rows"}
        </Button>
      </div>
      {result?.done && <p className="text-success text-sm">{result.done}</p>}
      <FormMessage error={result?.error} />
      <p className="text-muted text-xs">
        The sizes go across exactly as they are — plaster has no thickness, paint may count both
        faces — so check them there.
      </p>
    </div>
  );
}

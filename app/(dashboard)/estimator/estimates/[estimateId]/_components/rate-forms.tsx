"use client";

import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
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
import { SearchSelect } from "@/components/ui/search-select";
import {
  changeLineRecipe,
  resetEstimateLine,
  setEstimateItemRate,
  updateEstimateLineLabourRate,
  type RecipeChange,
} from "@/lib/estimator/estimate-actions";
import { setItemPrice } from "@/lib/masters/items-actions";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { chosenUom, componentOptions } from "../../../_components/component-options";

/** One row of what a unit of the work uses — a mix or a material, as
 * written in the list (mixes not expanded). `ref` is "mix:<id>" or
 * "material:<id>", the address the recipe action takes. */
export type RateComponentView = {
  ref: string;
  kind: "material" | "mix";
  name: string;
  uom: string;
  qtyPerUnit: number;
};

/** One material the rate is built from, mixes expanded — where the
 * money is. */
export type RatePriceView = {
  itemId: string;
  name: string;
  uom: string;
  qtyPerUnit: number;
  /** Masters' price; null = nobody has priced it. */
  mastersPrice: number | null;
  /** This villa's own price, when it has one. */
  villaPrice: number | null;
  /** qtyPerUnit × the price in use; null when unpriced. */
  cost: number | null;
};

export type LineRateView = {
  lineId: string;
  workItemId: string;
  workName: string;
  workUom: string | null;
  /** The villa has its own materials list for this work. */
  own: boolean;
  labour: { villa: number | null; rateBook: number | null; inUse: number | null };
  components: RateComponentView[];
  prices: RatePriceView[];
  /** Per one unit; null when anything is unpriced. */
  rate: number | null;
};

export type RateOptions = {
  materials: { id: string; name: string; uom: string; rate: number | null }[];
  mixes: { id: string; name: string; uom: string }[];
};

/** The rate in a BOQ row, and the button that explains it. */
function RateTrigger({ rate, uom }: { rate: number | null; uom: string | null }) {
  return (
    <DialogTrigger asChild>
      <button
        type="button"
        className="text-foreground decoration-muted/50 hover:decoration-foreground cursor-pointer text-right underline decoration-dotted underline-offset-4"
      >
        {rate === null ? <span className="text-warning">Not priced</span> : formatMoney(rate)}
        {uom && <span className="text-muted text-xs"> / {uom}</span>}
      </button>
    </DialogTrigger>
  );
}

/**
 * "Why is this rate what it is?" — the rate of one work on this villa,
 * built up in front of you: labour, then what one unit uses, then what
 * each material costs. Everything here is THIS VILLA's: an edit gives the
 * villa its own figure (black, with Back to the rate book), and a figure
 * that follows the rate book says so. The rate book itself — what every
 * villa starts from — is one link away.
 */
export function LineRateDialog({
  estimateId,
  view,
  options,
  canEditMasters,
}: {
  estimateId: string;
  view: LineRateView;
  options: RateOptions;
  canEditMasters: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const change = (next: RecipeChange) =>
    startTransition(async () => {
      const result = await changeLineRecipe(view.lineId, next);
      setError(result?.error);
    });

  const materialsCost = view.prices.every((row) => row.cost !== null)
    ? view.prices.reduce((sum, row) => sum + (row.cost ?? 0), 0)
    : null;
  const unit = view.workUom ?? "unit";

  return (
    <Dialog>
      <RateTrigger rate={view.rate} uom={view.workUom} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{view.workName} — rate for this villa</DialogTitle>
        </DialogHeader>

        <Figure
          label={`Rate per ${unit}`}
          value={formatMoney(view.rate)}
          hint={`Labour ${formatMoney(view.labour.inUse)} + materials ${formatMoney(materialsCost)}`}
          tone={view.rate === null ? "warn" : undefined}
          size="lg"
        />

        <LabourRateField
          lineId={view.lineId}
          villaRate={view.labour.villa}
          rateBookRate={view.labour.rateBook}
          unit={unit}
        />

        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
              What one {unit} uses
            </p>
            {view.own ? (
              <span className="flex items-center gap-2">
                <Badge variant="info">This villa&apos;s own</Badge>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await resetEstimateLine(view.lineId);
                      setError(result?.error);
                    })
                  }
                >
                  ↺ Back to the rate book
                </Button>
              </span>
            ) : (
              <Badge variant="neutral">From the rate book</Badge>
            )}
          </div>

          {view.components.length === 0 ? (
            <p className="text-muted text-sm">
              Labour only — nothing listed. Add a material below if this villa&apos;s version uses
              one.
            </p>
          ) : (
            <ul className="divide-border divide-y">
              {view.components.map((row) => (
                <ComponentRow
                  key={row.ref}
                  row={row}
                  unit={unit}
                  options={options}
                  pending={pending}
                  onChange={change}
                />
              ))}
            </ul>
          )}
          <AddComponentForm
            options={options}
            unit={unit}
            pending={pending}
            onAdd={(ref, qty) => change({ op: "add", ref, qty })}
          />
          <p className="text-muted text-xs">
            {view.own
              ? "This villa's list stands on its own — later changes to the rate book don't reach it. Removing every material puts it back on the rate book's."
              : "Changing anything here gives this villa its own list, starting from the rate book's. Other villas, and the rate book, stay as they are."}
          </p>
        </div>

        {view.prices.length > 0 && (
          <div className="space-y-2">
            <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">Prices</p>
            <ul className="divide-border divide-y">
              {view.prices.map((row) => (
                <li key={row.itemId} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="text-foreground min-w-0 flex-1 text-sm">
                    {row.name}
                    <span className="text-muted block text-xs">
                      {formatQuantity(row.qtyPerUnit)} {row.uom} per {unit}
                      {row.cost !== null && ` · ${formatMoney(row.cost)} per ${unit}`}
                    </span>
                  </span>
                  <VillaPriceField
                    estimateId={estimateId}
                    itemId={row.itemId}
                    villaPrice={row.villaPrice}
                    mastersPrice={row.mastersPrice}
                    label={row.name}
                  />
                  {row.mastersPrice === null && canEditMasters && (
                    <MastersPriceField itemId={row.itemId} label={row.name} uom={row.uom} />
                  )}
                </li>
              ))}
            </ul>
            <p className="text-muted text-xs">
              A price typed here is this villa&apos;s — every work in it that uses the material pays
              it. Leave it blank to use the price in Masters.
              {canEditMasters &&
                " Where Masters has no price yet, you can set it there for everyone, right here."}
            </p>
          </div>
        )}

        <FormMessage error={error} />
        <DialogFooter>
          <LinkButton href={`/estimator/works/${view.workItemId}`} variant="ghost">
            Open in the rate book
          </LinkButton>
          <DialogClose asChild>
            <Button variant="secondary">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A submitted estimate's rate, read back from what it froze: the same
 * build-up, nothing editable.
 */
export function FrozenRateDialog({
  workName,
  workUom,
  labourRate,
  rate,
  prices,
}: {
  workName: string;
  workUom: string | null;
  labourRate: number | null;
  rate: number | null;
  prices: {
    name: string;
    uom: string;
    qtyPerUnit: number;
    price: number | null;
    cost: number | null;
  }[];
}) {
  const unit = workUom ?? "unit";
  return (
    <Dialog>
      <RateTrigger rate={rate} uom={workUom} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{workName} — rate as frozen</DialogTitle>
        </DialogHeader>
        <Figure
          label={`Rate per ${unit}`}
          value={formatMoney(rate)}
          hint={`Labour ${formatMoney(labourRate)} per ${unit}`}
          tone={rate === null ? "warn" : undefined}
          size="lg"
        />
        {prices.length === 0 ? (
          <p className="text-muted text-sm">Labour only — no materials were listed.</p>
        ) : (
          <ul className="divide-border divide-y">
            {prices.map((row) => (
              <li key={row.name} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="text-foreground min-w-0">
                  {row.name}
                  <span className="text-muted block text-xs">
                    {formatQuantity(row.qtyPerUnit)} {row.uom} per {unit} at{" "}
                    {formatMoney(row.price)}
                  </span>
                </span>
                <span className="shrink-0">{formatMoney(row.cost)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted text-xs">
          These are the figures of the day it was submitted. A new official estimate is the way to
          change them.
        </p>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ComponentRow({
  row,
  unit,
  options,
  pending,
  onChange,
}: {
  row: RateComponentView;
  unit: string;
  options: RateOptions;
  pending: boolean;
  onChange: (change: RecipeChange) => void;
}) {
  const [value, setValue] = useState(String(row.qtyPerUnit));
  const [swapping, setSwapping] = useState(false);
  const [swapTo, setSwapTo] = useState("");
  const searchOptions = useMemo(
    () =>
      componentOptions(options.materials, options.mixes).filter(
        (option) => option.value !== row.ref,
      ),
    [options, row.ref],
  );

  const saveQty = () => {
    const next = Number(value.replace(/[,\s]/g, ""));
    if (!Number.isFinite(next) || next <= 0 || next === row.qtyPerUnit) {
      setValue(String(row.qtyPerUnit));
      return;
    }
    onChange({ op: "qty", ref: row.ref, qty: next });
  };

  return (
    <li className="space-y-2 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-foreground min-w-0 flex-1 text-sm">
          {row.name}
          {row.kind === "mix" && (
            <Badge variant="neutral" className="ml-1.5">
              Mix
            </Badge>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onBlur={saveQty}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
            disabled={pending}
            inputMode="decimal"
            aria-label={`${row.name} per ${unit}`}
            className="h-9 w-20 text-right"
          />
          <span className="text-muted text-xs">
            {row.uom} / {unit}
          </span>
        </span>
        <span className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setSwapping((open) => !open)}
          >
            Swap
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => onChange({ op: "remove", ref: row.ref })}
          >
            Remove
          </Button>
        </span>
      </div>
      {swapping && (
        <div className="flex flex-wrap items-start gap-2">
          <SearchSelect
            value={swapTo}
            onChange={setSwapTo}
            options={searchOptions}
            placeholder={`Use instead of ${row.name}…`}
            className="min-w-56 flex-1"
          />
          <Button
            type="button"
            disabled={pending || !swapTo}
            onClick={() => {
              onChange({ op: "swap", ref: row.ref, to: swapTo });
              setSwapping(false);
              setSwapTo("");
            }}
          >
            Swap
          </Button>
        </div>
      )}
    </li>
  );
}

function AddComponentForm({
  options,
  unit,
  pending,
  onAdd,
}: {
  options: RateOptions;
  unit: string;
  pending: boolean;
  onAdd: (ref: string, qty: number) => void;
}) {
  const [choice, setChoice] = useState("");
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string>();
  const searchOptions = useMemo(
    () => componentOptions(options.materials, options.mixes),
    [options],
  );
  const uomOfChoice = chosenUom(choice, options.materials, options.mixes);

  const add = () => {
    const amount = Number(qty.replace(/[,\s]/g, ""));
    if (!choice) return setError("Pick a material or a mix.");
    if (!Number.isFinite(amount) || amount <= 0) {
      return setError(`Enter how much of it one ${unit} needs.`);
    }
    setError(undefined);
    onAdd(choice, amount);
    setChoice("");
    setQty("");
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-start gap-2">
        <SearchSelect
          value={choice}
          onChange={setChoice}
          options={searchOptions}
          placeholder="Add a mix or material…"
          className="min-w-56 flex-1"
        />
        <Input
          value={qty}
          onChange={(event) => setQty(event.target.value)}
          inputMode="decimal"
          placeholder="Qty"
          aria-label={`How much per ${unit}`}
          className="w-24"
        />
        <Button type="button" disabled={pending} onClick={add}>
          Add
        </Button>
      </div>
      {uomOfChoice && (
        <p className="text-muted text-xs">
          How many {uomOfChoice} one {unit} of this work needs.
        </p>
      )}
      <FormMessage error={error} />
    </div>
  );
}

/**
 * This villa's labour rate for the work (0088) — blank follows the rate
 * book, and says what that is. Zero is a real rate, not "unpriced".
 */
function LabourRateField({
  lineId,
  villaRate,
  rateBookRate,
  unit,
}: {
  lineId: string;
  villaRate: number | null;
  rateBookRate: number | null;
  unit: string;
}) {
  const [value, setValue] = useState(villaRate === null ? "" : String(villaRate));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const save = (next: number | null) => {
    if (next === villaRate) return;
    startTransition(async () => {
      const result = await updateEstimateLineLabourRate(lineId, next);
      if (result?.error) {
        setError(result.error);
        setValue(villaRate === null ? "" : String(villaRate));
      } else setError(undefined);
    });
  };

  return (
    <div className="space-y-1.5">
      <Label htmlFor={`labour-${lineId}`}>Labour per {unit}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={`labour-${lineId}`}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => {
            const cleaned = value.replace(/[,\s₹]/g, "");
            const next = cleaned === "" ? null : Number(cleaned);
            if (next !== null && (!Number.isFinite(next) || next < 0)) {
              setValue(villaRate === null ? "" : String(villaRate));
              setError("The labour rate must be a number, or blank for the rate book's.");
              return;
            }
            save(next);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
          }}
          disabled={pending}
          inputMode="decimal"
          placeholder={
            rateBookRate === null ? "Not priced in the rate book" : `Rate book: ${rateBookRate}`
          }
          className="max-w-56"
        />
        {villaRate !== null ? (
          <>
            <Badge variant="info">This villa</Badge>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={() => {
                setValue("");
                save(null);
              }}
            >
              ↺
            </Button>
          </>
        ) : (
          <Badge variant="neutral">Rate book</Badge>
        )}
      </div>
      <FormMessage error={error} />
    </div>
  );
}

/** This villa's price for one material (0088) — per estimate, so every
 * work in the villa that uses it pays the same. Blank uses Masters'. */
export function VillaPriceField({
  estimateId,
  itemId,
  villaPrice,
  mastersPrice,
  label,
}: {
  estimateId: string;
  itemId: string;
  villaPrice: number | null;
  mastersPrice: number | null;
  label: string;
}) {
  const [value, setValue] = useState(villaPrice === null ? "" : String(villaPrice));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const save = () => {
    const cleaned = value.replace(/[,\s₹]/g, "");
    const next = cleaned === "" ? null : Number(cleaned);
    if (next !== null && (!Number.isFinite(next) || next < 0)) {
      setValue(villaPrice === null ? "" : String(villaPrice));
      setError("The price must be a number, or blank for the Masters price.");
      return;
    }
    if (next === villaPrice) return;
    startTransition(async () => {
      const result = await setEstimateItemRate(estimateId, itemId, next);
      if (result?.error) {
        setError(result.error);
        setValue(villaPrice === null ? "" : String(villaPrice));
      } else setError(undefined);
    });
  };

  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <FormMessage error={error} />
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
        }}
        disabled={pending}
        inputMode="decimal"
        aria-label={`This villa's price for ${label}`}
        placeholder={mastersPrice === null ? "Not priced" : `Masters: ${mastersPrice}`}
        className="h-9 w-28 text-right"
      />
      {villaPrice !== null && <Badge variant="info">This villa</Badge>}
    </span>
  );
}

/** Set a missing Masters price from here — for people who hold Masters.
 * It is the company's price, used by every villa and every tool. */
function MastersPriceField({ itemId, label, uom }: { itemId: string; label: string; uom: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <span className="flex w-full flex-wrap items-center gap-1.5 sm:w-auto">
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        inputMode="decimal"
        aria-label={`Masters price for ${label}`}
        placeholder={`Masters price / ${uom}`}
        className="h-9 w-36"
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={pending || value.trim() === ""}
        onClick={() => {
          const price = Number(value.replace(/[,\s₹]/g, ""));
          if (!Number.isFinite(price) || price < 0) {
            setError("The price must be a number.");
            return;
          }
          startTransition(async () => {
            const result = await setItemPrice(itemId, price);
            if (result?.error) setError(result.error);
            else {
              setError(undefined);
              router.refresh();
            }
          });
        }}
      >
        Set in Masters
      </Button>
      <FormMessage error={error} />
    </span>
  );
}

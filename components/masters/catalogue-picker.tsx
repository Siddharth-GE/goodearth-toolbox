"use client";

import { ItemThumb } from "@/components/masters/item-thumb";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { formatCount, formatMoney } from "@/lib/format";
import { useDebouncedSearch } from "@/lib/hooks/use-debounced-search";
// Types only — the contract of /api/catalogue, deliberately import-free
// (see the note at the top of that module), living on the shared
// masters surface every tool may read.
import type { CatalogueItem, CatalogueSearchResult } from "@/lib/masters/catalogue";
import { Minus, Plus, Search } from "lucide-react";
import { useMemo, useState, useTransition, type ReactNode } from "react";

export type PickedLine = { item: CatalogueItem; quantity: number };

/**
 * The catalogue picker — search, filters, thumbnail tiles, a local
 * basket and one commit bar — shared by Selections, the Construction
 * tree and the Indents direct-add (DESIGN.md's "build the third copy
 * into a shared component").
 *
 * Parent-controlled: the caller renders its own trigger and passes
 * open/onOpenChange, because what "Add items" means (which stage, which
 * indent, which spaces) is the caller's business — headerSlot and
 * extraAction are the hooks for that business, not for restyling. The
 * basket lives entirely in the browser and nothing is written until
 * onCommit — pressing + costs nothing.
 */
export function CataloguePickerDialog({
  open,
  onOpenChange,
  title,
  targetLabel,
  categories,
  brands,
  headerSlot,
  extraAction,
  valueMultiplier = 1,
  commitDisabled = false,
  onCommit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Where the basket lands, for the commit bar: "the Foundation stage". */
  targetLabel: string;
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  /** Rendered between the title and the search row — the caller's own
   * target controls (Selections' space chips). */
  headerSlot?: ReactNode;
  /** Rendered in the empty state and beside the footer count — an
   * escape hatch when the catalogue has no answer (Selections' "request
   * item"). `addToBasket` pushes an externally created item into the
   * basket; `search` is the current search text, for prefilling. */
  extraAction?: (addToBasket: (item: CatalogueItem) => void, search: string) => ReactNode;
  /** Multiplies the indicative basket value shown in the commit bar —
   * for callers whose basket lands in several places at once. */
  valueMultiplier?: number;
  /** The caller's veto on the Add button (no target selected). */
  commitDisabled?: boolean;
  /** Writes the whole basket in one call. Resolving without an error
   * clears the basket and closes the dialog. */
  onCommit: (lines: PickedLine[]) => Promise<{ error?: string } | undefined | void>;
}) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [placement, setPlacement] = useState("");
  const [page, setPage] = useState(1);

  const { result, loading } = useDebouncedSearch<CatalogueSearchResult>({
    url: "/api/catalogue",
    params: { page, q: search, category: categoryId, brand: brandId, placement },
    // Idle until the dialog opens: no reason to search a catalogue nobody
    // is looking at.
    enabled: open,
    initial: { items: [], total: 0, pageCount: 1 },
  });

  // Holds the item itself, not just a count, so the summary keeps working
  // after the item scrolls out of the current search results.
  const [basket, setBasket] = useState<Record<string, PickedLine>>({});
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();

  const applyFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const step = (item: CatalogueItem, by: number) =>
    setBasket((current) => {
      const next = { ...current };
      const quantity = (next[item.id]?.quantity ?? 0) + by;
      if (quantity <= 0) delete next[item.id];
      else next[item.id] = { item, quantity };
      return next;
    });

  const basketEntries = useMemo(() => Object.values(basket), [basket]);
  const distinctItems = basketEntries.length;

  const basketValue = useMemo(
    () =>
      basketEntries.reduce(
        (sum, entry) => sum + (entry.item.indicative_price ?? 0) * entry.quantity,
        0,
      ) * valueMultiplier,
    [basketEntries, valueMultiplier],
  );

  // A just-created external item (a Selections provisional) goes
  // straight into the basket at quantity 1. It won't be in the current
  // search results, which is exactly why the basket stores the item
  // itself rather than looking it up.
  const addToBasket = (item: CatalogueItem) => step(item, 1);

  const reset = () => {
    setBasket({});
    setError(undefined);
  };

  const commit = () =>
    startSaving(async () => {
      const outcome = await onCommit(basketEntries);
      if (outcome && outcome.error) {
        setError(outcome.error);
        return;
      }
      reset();
      onOpenChange(false);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="flex h-[88vh] max-w-6xl flex-col gap-3">
        <DialogHeader className="mb-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {headerSlot}

        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="text-muted absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(event) => applyFilter(() => setSearch(event.target.value))}
              placeholder="Search name, code or brand…"
              autoComplete="off"
              autoFocus
              className="pl-9"
            />
          </div>
          <Select
            value={categoryId}
            onChange={(event) => applyFilter(() => setCategoryId(event.target.value))}
            className="w-auto"
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <Select
            value={brandId}
            onChange={(event) => applyFilter(() => setBrandId(event.target.value))}
            className="w-auto"
          >
            <option value="">All brands</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </Select>
          <Select
            value={placement}
            onChange={(event) => applyFilter(() => setPlacement(event.target.value))}
            className="w-auto"
          >
            <option value="">Fixed &amp; loose</option>
            <option value="fixed">Fixed</option>
            <option value="loose">Loose</option>
            <option value="soft_furnishing">Soft furnishing</option>
          </Select>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading && result.items.length === 0 ? (
            <div className="text-muted flex h-full items-center justify-center">
              <Spinner className="size-5 border-2" />
            </div>
          ) : result.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12">
              <p className="text-muted text-center text-sm">
                Nothing matches that. Try a different search or filter.
              </p>
              {extraAction?.(addToBasket, search)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 pb-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {result.items.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  quantity={basket[item.id]?.quantity ?? 0}
                  onStep={(by) => step(item, by)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="border-border flex items-center justify-between gap-3 border-t pt-3">
          <div className="flex items-center gap-3">
            <p className="text-muted text-xs">
              {loading
                ? "Searching…"
                : `${formatCount(result.total)} ${result.total === 1 ? "item" : "items"}`}
            </p>
            {/* Also here, not only in the empty state: the caller's
                escape hatch is often wanted without searching first. */}
            {result.items.length > 0 && extraAction?.(addToBasket, search)}
          </div>
          <Pagination page={page} pageCount={result.pageCount} onPageChange={setPage} />
        </div>

        {/* Nothing has been written yet — this bar is the commit point. */}
        <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <div className="min-w-0">
            {distinctItems === 0 ? (
              <p className="text-muted text-sm">
                Use + to build up a list, then add it all at once.
              </p>
            ) : (
              <>
                <p className="text-foreground text-sm font-medium">
                  {distinctItems} {distinctItems === 1 ? "item" : "items"} into {targetLabel}
                </p>
                <p className="text-muted text-xs">
                  Anything already there has its quantity increased
                  {basketValue > 0 && ` · indicative ${formatMoney(basketValue)}`}
                </p>
              </>
            )}
            <FormMessage error={error} size="xs" />
          </div>
          <div className="flex items-center gap-2">
            {distinctItems > 0 && (
              <Button variant="ghost" onClick={reset} disabled={saving}>
                Clear
              </Button>
            )}
            <Button onClick={commit} disabled={saving || distinctItems === 0 || commitDisabled}>
              {saving ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ItemCard({
  item,
  quantity,
  onStep,
}: {
  item: CatalogueItem;
  quantity: number;
  onStep: (by: number) => void;
}) {
  const selected = quantity > 0;
  return (
    <div
      className={[
        "bg-surface flex flex-col rounded-2xl border p-2 transition-colors",
        selected ? "border-accent" : "border-border",
      ].join(" ")}
    >
      {/* The whole tile is the + target: one click to take one, which is
          the overwhelmingly common case. */}
      <button
        type="button"
        onClick={() => onStep(1)}
        className="focus-visible:ring-accent rounded-xl text-left focus-visible:ring-2 focus-visible:outline-none"
        aria-label={`Add one ${item.name}`}
      >
        <ItemThumb
          code={item.code}
          name={item.name}
          thumbUrl={item.thumb_url}
          sizes="(max-width: 640px) 45vw, 180px"
        />
        <p className="text-foreground mt-2 line-clamp-2 text-xs font-medium">{item.name}</p>
        {item.brand_name && (
          <p className="text-muted mt-0.5 truncate text-[11px] font-medium">{item.brand_name}</p>
        )}
        <p className="text-muted mt-0.5 text-[11px]">
          {item.code ?? "—"}
          {item.indicative_price != null && (
            <span className="ml-1 opacity-70">{formatMoney(item.indicative_price)}</span>
          )}
        </p>
      </button>

      <div className="mt-2 flex items-center justify-between gap-1">
        <Stepper
          direction="down"
          disabled={!selected}
          onClick={() => onStep(-1)}
          label={`Remove one ${item.name}`}
        />
        <span
          className={[
            "min-w-8 text-center text-sm font-semibold tabular-nums",
            selected ? "text-foreground" : "text-muted/40",
          ].join(" ")}
        >
          {quantity}
        </span>
        <Stepper direction="up" onClick={() => onStep(1)} label={`Add one ${item.name}`} />
      </div>
    </div>
  );
}

function Stepper({
  direction,
  onClick,
  disabled,
  label,
}: {
  direction: "up" | "down";
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  const Icon = direction === "up" ? Plus : Minus;
  return (
    <IconButton onClick={onClick} disabled={disabled} aria-label={label} bordered>
      <Icon className="size-4" />
    </IconButton>
  );
}

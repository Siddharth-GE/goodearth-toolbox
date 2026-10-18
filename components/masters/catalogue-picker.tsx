"use client";

import { ItemThumb } from "@/components/masters/item-thumb";
import { ProductLink } from "@/components/masters/product-link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { formatCount, formatMoney } from "@/lib/format";
import type { ActionState } from "@/lib/action-state";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useDebouncedSearch } from "@/lib/hooks/use-debounced-search";
// Types only: the import-free contract of /api/catalogue.
import type { CatalogueItem, CatalogueSearchResult } from "@/lib/masters/catalogue";
import { Minus, Plus, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

export type PickedLine = { item: CatalogueItem; quantity: number };

/**
 * Search, filters, tiles, a local basket and one commit bar, shared by Selections and Indents.
 * Parent-controlled: the caller owns the trigger and what "Add items" means. Nothing is written until onCommit.
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
  targetLabel: string;
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  /** Between the title and the search row: the caller's own target controls. */
  headerSlot?: ReactNode;
  /** Empty state and footer escape hatch; `addToBasket` pushes an external item, `search` prefills. */
  extraAction?: (addToBasket: (item: CatalogueItem) => void, search: string) => ReactNode;
  /** Multiplies the basket value, for callers whose basket lands in several places. */
  valueMultiplier?: number;
  /** The caller's veto on the Add button (no target selected). */
  commitDisabled?: boolean;
  /** Writes the whole basket; resolving without an error clears it and closes the dialog. */
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
    // Idle until the dialog opens.
    enabled: open,
    initial: { items: [], total: 0, pageCount: 1 },
  });

  // Holds the item, not a count, so the summary survives a scroll out of the results.
  const [basket, setBasket] = useState<Record<string, PickedLine>>({});
  const { pending: saving, error, run, clearError } = useActionRunner();

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

  // An external item is not in the search results, so the basket stores the item itself.
  const addToBasket = (item: CatalogueItem) => step(item, 1);

  const reset = () => {
    setBasket({});
    clearError();
  };

  const commit = async () => {
    const outcome = await run(async () => (await onCommit(basketEntries)) as ActionState);
    if (outcome?.error) return;
    reset();
    onOpenChange(false);
  };

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
              placeholder="Search name, description, code or brand…"
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
            {result.items.length > 0 && extraAction?.(addToBasket, search)}
          </div>
          <Pagination page={page} pageCount={result.pageCount} onPageChange={setPage} />
        </div>

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
        {/* The name alone cannot tell tiles apart; the description can. Clamped to keep the grid even. */}
        {item.description && (
          <p className="text-muted mt-1 line-clamp-3 text-[11px]" title={item.description}>
            {item.description}
          </p>
        )}
        <p className="text-muted mt-1 text-[11px]">
          {item.code ?? "—"}
          {item.indicative_price != null && (
            <span className="ml-1 opacity-70">{formatMoney(item.indicative_price)}</span>
          )}
        </p>
      </button>

      {/* Outside the button: a link inside it would nest controls. */}
      <ProductLink href={item.source_url} itemName={item.name} className="mt-1 self-start py-0.5" />

      <div className="mt-auto flex items-center justify-between gap-1 pt-2">
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

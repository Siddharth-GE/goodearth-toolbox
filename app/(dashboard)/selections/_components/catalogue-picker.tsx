"use client";

import { ItemThumb } from "@/components/masters/item-thumb";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { addLines } from "@/lib/selections/actions";
import type { CatalogueItem, CatalogueSearchResult } from "@/lib/selections/catalogue";
import { Loader2, Minus, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";

const inr = new Intl.NumberFormat("en-IN");

type Space = { id: string; label: string };

export function CataloguePicker({
  selectionId,
  unitId,
  spaces,
  currentSpaceId,
  categories,
  brands,
}: {
  selectionId: string;
  unitId: string;
  spaces: Space[];
  currentSpaceId: string;
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [placement, setPlacement] = useState("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<CatalogueSearchResult>({ items: [], total: 0, pageCount: 1 });
  const [loading, setLoading] = useState(false);

  // The basket lives entirely in the browser. Pressing + costs nothing —
  // no network, no re-render of the page behind — and the whole lot is
  // written in one call when the designer is done. It holds the item
  // itself, not just a count, so the summary keeps working after the item
  // scrolls out of the current search results.
  const [basket, setBasket] = useState<Record<string, { item: CatalogueItem; quantity: number }>>({});
  const [targetSpaces, setTargetSpaces] = useState<string[]>([currentSpaceId]);
  const [error, setError] = useState<string>();
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("q", search);
      if (categoryId) params.set("category", categoryId);
      if (brandId) params.set("brand", brandId);
      if (placement) params.set("placement", placement);
      try {
        const response = await fetch(`/api/catalogue?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("search failed");
        setResult((await response.json()) as CatalogueSearchResult);
        setLoading(false);
      } catch (fetchError) {
        // An aborted request is the expected outcome of typing another
        // character, not a failure worth showing.
        if ((fetchError as Error).name !== "AbortError") setLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [open, search, categoryId, brandId, placement, page]);

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
  const totalLines = distinctItems * targetSpaces.length;

  const basketValue = useMemo(
    () =>
      basketEntries.reduce(
        (sum, entry) => sum + (entry.item.indicative_price ?? 0) * entry.quantity,
        0,
      ) * targetSpaces.length,
    [basketEntries, targetSpaces.length],
  );

  const reset = () => {
    setBasket({});
    setTargetSpaces([currentSpaceId]);
    setError(undefined);
  };

  const commit = () =>
    startSaving(async () => {
      const outcome = await addLines(
        selectionId,
        unitId,
        targetSpaces,
        basketEntries.map((entry) => ({ itemId: entry.item.id, quantity: entry.quantity })),
      );
      if (outcome?.error) {
        setError(outcome.error);
        return;
      }
      reset();
      setOpen(false);
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <Button onClick={() => setOpen(true)}>Add items</Button>
      <DialogContent className="flex h-[88vh] max-w-6xl flex-col gap-3">
        <DialogHeader className="mb-0">
          <DialogTitle>Add items</DialogTitle>
        </DialogHeader>

        {/* Which spaces receive the basket. Defaults to the space you came
            from; tick more to specify four identical bathrooms at once. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted">Add to</span>
          {spaces.map((space) => {
            const on = targetSpaces.includes(space.id);
            return (
              <button
                key={space.id}
                type="button"
                onClick={() =>
                  setTargetSpaces((current) =>
                    current.includes(space.id)
                      ? current.filter((id) => id !== space.id)
                      : [...current, space.id],
                  )
                }
                className={[
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  on
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border text-muted hover:text-foreground",
                ].join(" ")}
              >
                {space.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
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
            <div className="flex h-full items-center justify-center text-muted">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : result.items.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">
              Nothing matches that. Try a different search or clear the filters.
            </p>
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

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-xs text-muted">
            {loading ? "Searching…" : `${inr.format(result.total)} ${result.total === 1 ? "item" : "items"}`}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-xs text-muted tabular-nums">
              {page} / {result.pageCount}
            </span>
            <Button
              variant="secondary"
              disabled={page >= result.pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>

        {/* Nothing has been written yet — this bar is the commit point. */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3">
          <div className="min-w-0">
            {distinctItems === 0 ? (
              <p className="text-sm text-muted">Use + to build up a list, then add it all at once.</p>
            ) : (
              <>
                <p className="text-sm font-medium text-foreground">
                  {distinctItems} {distinctItems === 1 ? "item" : "items"} × {targetSpaces.length}{" "}
                  {targetSpaces.length === 1 ? "space" : "spaces"} = {totalLines}{" "}
                  {totalLines === 1 ? "line" : "lines"}
                </p>
                {basketValue > 0 && (
                  <p className="text-xs text-muted">indicative ₹{inr.format(Math.round(basketValue))}</p>
                )}
              </>
            )}
            {error && <p className="text-xs font-medium text-danger">{error}</p>}
          </div>
          <div className="flex items-center gap-2">
            {distinctItems > 0 && (
              <Button variant="ghost" onClick={reset} disabled={saving}>
                Clear
              </Button>
            )}
            <Button onClick={commit} disabled={saving || totalLines === 0}>
              {saving ? "Adding…" : `Add ${totalLines || ""}`.trim()}
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
        "flex flex-col rounded-2xl border bg-surface p-2 transition-colors",
        selected ? "border-accent" : "border-border",
      ].join(" ")}
    >
      {/* The whole tile is the + target: one click to take one, which is
          the overwhelmingly common case. */}
      <button
        type="button"
        onClick={() => onStep(1)}
        className="rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={`Add one ${item.name}`}
      >
        <ItemThumb
          code={item.code}
          name={item.name}
          thumbUrl={item.thumb_url}
          sizes="(max-width: 640px) 45vw, 180px"
        />
        <p className="mt-2 line-clamp-2 text-xs font-medium text-foreground">{item.name}</p>
        {/* Brand is shown so a brand search visibly explains its results,
            rather than returning items whose names never mention it. */}
        {item.brand_name && (
          <p className="mt-0.5 truncate text-[11px] font-medium text-muted">{item.brand_name}</p>
        )}
        <p className="mt-0.5 text-[11px] text-muted">
          {item.code ?? "—"}
          {item.indicative_price != null && (
            <span className="ml-1 opacity-70">₹{inr.format(item.indicative_price)}</span>
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
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-8 items-center justify-center rounded-lg border border-border text-foreground transition-colors hover:bg-black/[0.04] disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent dark:hover:bg-white/[0.06]"
    >
      <Icon className="size-4" />
    </button>
  );
}

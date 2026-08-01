"use client";

import { ItemThumb } from "@/components/masters/item-thumb";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { addLines } from "@/lib/selections/actions";
import type { CatalogueItem, CatalogueSearchResult } from "@/lib/selections/catalogue";
import { RequestItemDialog } from "./request-item-dialog";
import { Minus, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { formatCount, formatMoney } from "@/lib/format";

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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [placement, setPlacement] = useState("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<CatalogueSearchResult>({
    items: [],
    total: 0,
    pageCount: 1,
  });
  const [loading, setLoading] = useState(false);

  // The basket lives entirely in the browser. Pressing + costs nothing —
  // no network, no re-render of the page behind — and the whole lot is
  // written in one call when the designer is done. It holds the item
  // itself, not just a count, so the summary keeps working after the item
  // scrolls out of the current search results.
  const [basket, setBasket] = useState<Record<string, { item: CatalogueItem; quantity: number }>>(
    {},
  );
  // Re-synced every time the dialog opens, never trusted from mount.
  // Switching space in the rail is a client-side navigation, so this
  // component is reused and a useState initial value would keep pointing
  // at whichever space was open when the page first loaded — silently
  // writing items into the wrong room.
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

  /**
   * A just-created provisional item goes straight into the basket. It
   * won't be in the current search results, which is exactly why the
   * basket stores the item itself rather than looking it up.
   */
  const addProvisional = (itemId: string, name: string) =>
    setBasket((current) => ({
      ...current,
      [itemId]: {
        item: {
          id: itemId,
          code: null,
          name,
          brand_name: null,
          thumb_url: null,
          indicative_price: null,
          default_uom: "each",
          is_provisional: true,
        },
        quantity: 1,
      },
    }));

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
      const targets = targetSpaces;
      const outcome = await addLines(
        selectionId,
        unitId,
        targets,
        basketEntries.map((entry) => ({ itemId: entry.item.id, quantity: entry.quantity })),
      );
      if (outcome?.error) {
        setError(outcome.error);
        return;
      }
      reset();
      setOpen(false);
      // Adding into spaces you aren't looking at is a normal thing to do
      // here, but it leaves the screen unchanged and looks like nothing
      // happened. Go to the first space that received the items.
      if (!targets.includes(currentSpaceId)) {
        router.push(`/selections/${selectionId}?space=${targets[0]}`);
      }
    });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Opening resets the target to the space you're actually looking
        // at; closing clears the basket.
        if (next) setTargetSpaces([currentSpaceId]);
        else reset();
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
          <span className="text-muted text-xs font-semibold tracking-widest uppercase">Add to</span>
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
                Nothing matches that. Try a different search, or add it as a new item.
              </p>
              <RequestItemDialog
                categories={categories}
                brands={brands}
                prefillName={search}
                onCreated={addProvisional}
              />
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
            {/* Also here, not only in the empty state: a designer often
                knows something isn't in the catalogue without searching. */}
            {result.items.length > 0 && (
              <RequestItemDialog
                categories={categories}
                brands={brands}
                prefillName={search}
                onCreated={addProvisional}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-muted text-xs tabular-nums">
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
        <div className="border-border bg-surface flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <div className="min-w-0">
            {distinctItems === 0 ? (
              <p className="text-muted text-sm">
                Use + to build up a list, then add it all at once.
              </p>
            ) : (
              <>
                {/* No line count promised: an item already in one of these
                    spaces raises that line's quantity instead of adding a
                    second one, so the number of lines isn't knowable here. */}
                <p className="text-foreground text-sm font-medium">
                  {distinctItems} {distinctItems === 1 ? "item" : "items"} into{" "}
                  {targetSpaces.length} {targetSpaces.length === 1 ? "space" : "spaces"}
                </p>
                <p className="text-muted text-xs">
                  Anything already there has its quantity increased
                  {basketValue > 0 && ` · indicative ${formatMoney(basketValue)}`}
                </p>
              </>
            )}
            {error && <p className="text-danger text-xs font-medium">{error}</p>}
          </div>
          <div className="flex items-center gap-2">
            {distinctItems > 0 && (
              <Button variant="ghost" onClick={reset} disabled={saving}>
                Clear
              </Button>
            )}
            <Button onClick={commit} disabled={saving || totalLines === 0}>
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
        {/* Brand is shown so a brand search visibly explains its results,
            rather than returning items whose names never mention it. */}
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
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="border-border text-foreground focus-visible:ring-accent flex size-8 items-center justify-center rounded-lg border transition-colors hover:bg-black/[0.04] focus-visible:ring-2 focus-visible:outline-none disabled:opacity-30 dark:hover:bg-white/[0.06]"
    >
      <Icon className="size-4" />
    </button>
  );
}

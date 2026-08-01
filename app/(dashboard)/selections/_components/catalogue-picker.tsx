"use client";

import { ItemThumb } from "@/components/masters/item-thumb";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { addLine, searchCatalogue, type CatalogueItem } from "@/lib/selections/actions";
import { Check, Loader2, Search } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

const inr = new Intl.NumberFormat("en-IN");

export function CataloguePicker({
  selectionId,
  unitId,
  spaceId,
  spaceLabel,
  categories,
}: {
  selectionId: string;
  unitId: string;
  spaceId: string;
  spaceLabel: string;
  categories: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [placement, setPlacement] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(false);
  // Item ids added during this session of the dialog, so the designer can
  // see what they've already picked without closing it.
  const [added, setAdded] = useState<Record<string, number>>({});
  const [, startTransition] = useTransition();

  // Debounced so typing "hanging light" is one query, not thirteen. The
  // cancelled flag matters as much as the debounce: without it a slow
  // earlier request can land after a newer one and show stale results.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLoading(true);
      const result = await searchCatalogue({ search, categoryId, placement, page });
      if (cancelled) return;
      setItems(result.items);
      setTotal(result.total);
      setPageCount(result.pageCount);
      setLoading(false);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, search, categoryId, placement, page]);

  // Changing a filter invalidates the page number, so it's reset where the
  // change happens rather than in an effect reacting to it.
  const applyFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  const add = (item: CatalogueItem) => {
    // Lands at quantity 1 and stays open. Adjusting quantities afterwards in
    // the grid is far faster than a modal-per-item when specifying a room.
    setAdded((current) => ({ ...current, [item.id]: (current[item.id] ?? 0) + 1 }));
    startTransition(async () => {
      const result = await addLine(selectionId, unitId, spaceId, item.id, 1);
      if (result?.error) {
        setAdded((current) => {
          const next = { ...current };
          const count = (next[item.id] ?? 1) - 1;
          if (count <= 0) delete next[item.id];
          else next[item.id] = count;
          return next;
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>Add items</Button>
      <DialogContent className="flex h-[85vh] max-w-5xl flex-col">
        <DialogHeader>
          <DialogTitle>Add to {spaceLabel}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(event) => applyFilter(() => setSearch(event.target.value))}
              placeholder="Search name or code…"
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
          {loading && items.length === 0 ? (
            <div className="flex h-full items-center justify-center text-muted">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">
              Nothing matches that. Try a different search or clear the filters.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 pb-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {items.map((item) => {
                const count = added[item.id] ?? 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => add(item)}
                    className="group relative rounded-2xl border border-border bg-surface p-2 text-left transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <ItemThumb
                      code={item.code}
                      name={item.name}
                      thumbUrl={item.thumb_url}
                      sizes="(max-width: 640px) 45vw, 180px"
                    />
                    <p className="mt-2 line-clamp-2 text-xs font-medium text-foreground">{item.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {item.code ?? "—"}
                      {item.indicative_price != null && (
                        <span className="ml-1 opacity-70">₹{inr.format(item.indicative_price)}</span>
                      )}
                    </p>
                    {count > 0 && (
                      <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
                        <Check className="size-3" />
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-xs text-muted">
            {loading ? "Searching…" : `${inr.format(total)} ${total === 1 ? "item" : "items"}`}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-xs text-muted tabular-nums">
              {page} / {pageCount}
            </span>
            <Button
              variant="secondary"
              disabled={page >= pageCount || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

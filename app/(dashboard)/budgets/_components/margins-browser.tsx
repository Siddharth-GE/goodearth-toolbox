"use client";

import { ItemThumb } from "@/components/masters/item-thumb";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { setItemMargin } from "@/lib/budgets/actions";
import type { CatalogueSearchResult } from "@/lib/selections/catalogue";
import { formatMoney } from "@/lib/budgets/math";
import { Loader2, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * Search the catalogue and set a default margin per product.
 *
 * Reuses /api/catalogue rather than a new endpoint — the same reasons hold
 * (a GET doesn't queue behind other requests and doesn't re-render the
 * route), and that endpoint returns no cost or margin of its own, so
 * nothing secret travels through it. The margins themselves come from the
 * server component and are updated here as they're saved.
 */
export function MarginsBrowser({
  initialMargins,
  categories,
  brands,
}: {
  initialMargins: Record<string, number>;
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
}) {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<CatalogueSearchResult>({ items: [], total: 0, pageCount: 1 });
  const [loading, setLoading] = useState(false);
  const [margins, setMargins] = useState<Record<string, number>>(initialMargins);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("q", search);
      if (categoryId) params.set("category", categoryId);
      if (brandId) params.set("brand", brandId);
      try {
        const response = await fetch(`/api/catalogue?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error("search failed");
        setResult((await response.json()) as CatalogueSearchResult);
        setLoading(false);
      } catch (fetchError) {
        // Aborting is what happens when another character is typed, not a
        // failure worth reporting.
        if ((fetchError as Error).name !== "AbortError") setLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [search, categoryId, brandId, page]);

  const applyFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <Input
            value={search}
            onChange={(event) => applyFilter(() => setSearch(event.target.value))}
            placeholder="Search by name, code or brand"
            className="pl-10"
            aria-label="Search the catalogue"
          />
        </div>
        <Select
          value={categoryId}
          onChange={(event) => applyFilter(() => setCategoryId(event.target.value))}
          aria-label="Filter by category"
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
          aria-label="Filter by brand"
        >
          <option value="">All brands</option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" /> Searching…
            </span>
          ) : (
            `${result.total.toLocaleString("en-IN")} ${result.total === 1 ? "product" : "products"}`
          )}
        </span>
        {result.pageCount > 1 && (
          <span className="flex items-center gap-3">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
              className="font-medium text-accent disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {page} of {result.pageCount}
            </span>
            <button
              type="button"
              disabled={page >= result.pageCount}
              onClick={() => setPage((current) => current + 1)}
              className="font-medium text-accent disabled:opacity-40"
            >
              Next
            </button>
          </span>
        )}
      </div>

      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell className="w-14"></TableHeaderCell>
            <TableHeaderCell>Product</TableHeaderCell>
            <TableHeaderCell className="w-32">Indicative</TableHeaderCell>
            <TableHeaderCell className="w-32">Margin %</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {result.items.map((item) => (
            <MarginRow
              key={item.id}
              item={item}
              margin={margins[item.id] ?? null}
              onSaved={(value) =>
                setMargins((current) => {
                  const next = { ...current };
                  if (value === null) delete next[item.id];
                  else next[item.id] = value;
                  return next;
                })
              }
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function MarginRow({
  item,
  margin,
  onSaved,
}: {
  item: CatalogueSearchResult["items"][number];
  margin: number | null;
  onSaved: (value: number | null) => void;
}) {
  const [value, setValue] = useState(margin === null ? "" : String(margin));
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const persisted = useRef(margin === null ? "" : String(margin));

  // No re-sync when the search results change: each row is keyed on the
  // item id, so a different product is a different component instance with
  // its own fresh state rather than a stale one to reconcile.

  const save = () => {
    const trimmed = value.trim();
    if (trimmed === persisted.current) return;

    // Blank means "no default", which is not the same as 0%.
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      setError("Zero or more");
      return;
    }
    setError(undefined);
    persisted.current = trimmed;

    void setItemMargin(item.id, parsed).then((result) => {
      if (result?.error) {
        setError(result.error);
        persisted.current = "";
        return;
      }
      onSaved(parsed);
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    });
  };

  return (
    <TableRow>
      <TableCell>
        <ItemThumb
          code={item.code}
          name={item.name}
          thumbUrl={item.thumb_url}
          sizes="48px"
          className="w-10"
        />
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-foreground">{item.name}</span>
          {saved && <span className="text-xs text-success">Saved</span>}
        </div>
        <div className="text-xs text-muted">
          {item.brand_name ? `${item.brand_name} · ` : ""}
          {item.code ?? "—"}
        </div>
        {error && <p className="mt-1 text-xs font-medium text-danger">{error}</p>}
      </TableCell>
      <TableCell className="text-muted">{formatMoney(item.indicative_price)}</TableCell>
      <TableCell>
        <Input
          type="number"
          step="any"
          min="0"
          value={value}
          placeholder="—"
          onChange={(event) => setValue(event.target.value)}
          onBlur={save}
          className="h-9"
          aria-label={`Margin for ${item.name}`}
        />
      </TableCell>
    </TableRow>
  );
}

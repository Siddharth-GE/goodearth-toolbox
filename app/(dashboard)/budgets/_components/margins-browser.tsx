"use client";

import { ItemThumb } from "@/components/masters/item-thumb";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { FormMessage } from "@/components/ui/form-message";
import { Pagination } from "@/components/ui/pagination";
import { Spinner } from "@/components/ui/spinner";
import { setItemMargin } from "@/lib/budgets/actions";
import type { CatalogueSearchResult } from "@/lib/selections/catalogue";
import { formatMoney } from "@/lib/format";
import { useDebouncedSearch } from "@/lib/hooks/use-debounced-search";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import { PackageOpen, Search } from "lucide-react";
import { useState } from "react";

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

  const [margins, setMargins] = useState<Record<string, number>>(initialMargins);

  const { result, loading } = useDebouncedSearch<CatalogueSearchResult>({
    url: "/api/catalogue",
    params: { page, q: search, category: categoryId, brand: brandId },
    initial: { items: [], total: 0, pageCount: 1 },
  });

  const applyFilter = (apply: () => void) => {
    apply();
    setPage(1);
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="text-muted pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2" />
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

      {loading ? (
        <p className="text-muted inline-flex items-center gap-1.5 text-xs">
          <Spinner className="size-3.5 border-2" /> Searching…
        </p>
      ) : (
        <Pagination
          page={page}
          pageCount={result.pageCount}
          onPageChange={setPage}
          total={result.total}
          unit="products"
        />
      )}

      {/* Was missing entirely: a search matching nothing rendered a table
          header over an empty body, which reads as broken rather than as
          "no results". */}
      {!loading && result.items.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title="No products match that"
          description="Try a different name, code or brand."
        />
      ) : (
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
      )}
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

  // No re-sync when the search results change: each row is keyed on the
  // item id, so a different product is a different component instance with
  // its own fresh state rather than a stale one to reconcile.
  const { flush, error, saved } = useSaveOnBlur<string>({
    initial: margin === null ? "" : String(margin),
    // Blank means "no default", which is not the same as 0%.
    validate: (raw) => {
      if (raw.trim() === "") return undefined;
      const parsed = Number(raw.trim());
      return Number.isFinite(parsed) && parsed >= 0 ? undefined : "Zero or more";
    },
    save: async (raw) => {
      const parsed = raw.trim() === "" ? null : Number(raw.trim());
      const result = await setItemMargin(item.id, parsed);
      if (!result?.error) onSaved(parsed);
      return result;
    },
  });

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
          <span className="text-foreground font-medium">{item.name}</span>
          {saved && <span className="text-success text-xs">Saved</span>}
        </div>
        <div className="text-muted text-xs">
          {item.brand_name ? `${item.brand_name} · ` : ""}
          {item.code ?? "—"}
        </div>
        <FormMessage error={error} size="xs" className="mt-1" />
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
          onBlur={() => flush(value)}
          className="h-9"
          aria-label={`Margin for ${item.name}`}
        />
      </TableCell>
    </TableRow>
  );
}

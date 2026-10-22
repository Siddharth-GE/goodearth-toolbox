import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
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
import { listBrands } from "@/lib/masters/brands";
import { listItemCategories } from "@/lib/masters/item-categories";
import { listItems, type ItemKind } from "@/lib/masters/items";
import { listActiveGstRates } from "@/lib/masters/gst-rates";
import { listActiveUomNames } from "@/lib/masters/uoms";
import { Package } from "lucide-react";
import { ItemFormDialog } from "./_components/item-form-dialog";
import { formatDate, formatMoney } from "@/lib/format";
import { latestPriceRaises, type PriceRaise } from "@/lib/masters/item-price-changes";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; category?: string; page?: string }>;
}) {
  const { q, kind, category, page } = await searchParams;
  const [result, categories, brands, uoms, gstRows] = await Promise.all([
    listItems({
      search: q,
      kind: kind as ItemKind | undefined,
      categoryId: category,
      page: Number(page) || 1,
    }),
    listItemCategories(),
    listBrands(),
    listActiveUomNames(),
    listActiveGstRates(),
  ]);
  const { items, total, page: currentPage, pageSize, pageCount } = result;
  // Newest PO rate rise per item (0103).
  const raises = await latestPriceRaises(items.map((item) => item.id));
  const gstRates = gstRows.map((row) => Number(row.rate));

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";
  const brandName = (id: string | null) =>
    id ? (brands.find((b) => b.id === id)?.name ?? "—") : "—";

  const hrefForPage = (target: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (kind) params.set("kind", kind);
    if (category) params.set("category", category);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/masters/items?${query}` : "/masters/items";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <form action="/masters/items" className="flex flex-wrap items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="q">Search</Label>
            <Input
              id="q"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search name or code…"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kind">Kind</Label>
            <Select id="kind" name="kind" defaultValue={kind ?? ""}>
              <option value="">All</option>
              <option value="catalogue">Catalogue</option>
              <option value="material">Material</option>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="category">Category</Label>
            <Select id="category" name="category" defaultValue={category ?? ""}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
          {(q || kind || category) && (
            <LinkButton href="/masters/items" variant="ghost">
              Clear
            </LinkButton>
          )}
        </form>
        <ItemFormDialog categories={categories} brands={brands} uoms={uoms} gstRates={gstRates} />
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No items found"
          description="Try a different search, or add a new item."
        />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Code</TableHeaderCell>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Kind</TableHeaderCell>
                <TableHeaderCell>Category</TableHeaderCell>
                <TableHeaderCell>Brand</TableHeaderCell>
                <TableHeaderCell>Price</TableHeaderCell>
                <TableHeaderCell>GST</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="text-muted">{item.code ?? "—"}</TableCell>
                  <TableCell className="text-foreground font-medium">{item.name}</TableCell>
                  <TableCell>
                    <Badge
                      variant={item.kind === "catalogue" ? "info" : "neutral"}
                      className="capitalize"
                    >
                      {item.kind}
                    </Badge>
                  </TableCell>
                  <TableCell>{categoryName(item.category_id)}</TableCell>
                  <TableCell>{brandName(item.brand_id)}</TableCell>
                  <TableCell>
                    {item.indicative_price != null ? formatMoney(item.indicative_price) : "—"}
                    <PriceRaiseHint raise={raises.get(item.id)} />
                  </TableCell>
                  <TableCell className="text-muted">
                    {item.gst_pct != null ? `${item.gst_pct}%` : "—"}
                  </TableCell>
                  <TableCell>
                    <ItemFormDialog
                      categories={categories}
                      brands={brands}
                      uoms={uoms}
                      gstRates={gstRates}
                      item={item}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Pagination
            page={currentPage}
            pageCount={pageCount}
            // Strings, not the function: a function can't cross into a Client Component.
            prevHref={currentPage > 1 ? hrefForPage(currentPage - 1) : null}
            nextHref={currentPage < pageCount ? hrefForPage(currentPage + 1) : null}
            total={total}
            pageSize={pageSize}
          />
        </>
      )}
    </div>
  );
}

function PriceRaiseHint({ raise }: { raise: PriceRaise | undefined }) {
  if (!raise) return null;
  const from = raise.old_price != null ? ` from ${formatMoney(raise.old_price)}` : "";
  const by = raise.po_reference ? ` by ${raise.po_reference}` : " by a purchase order";
  return (
    <p className="text-muted mt-0.5 text-xs">{`Raised${from}${by} · ${formatDate(raise.changed_at)}`}</p>
  );
}

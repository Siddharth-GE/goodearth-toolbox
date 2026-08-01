import { Badge } from "@/components/ui/badge";
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
import { Package } from "lucide-react";
import { ItemFormDialog } from "./_components/item-form-dialog";

// Indian digit grouping (1,23,456) — the catalogue runs to lakh-scale prices.
const inr = new Intl.NumberFormat("en-IN");

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; category?: string; page?: string }>;
}) {
  const { q, kind, category, page } = await searchParams;
  const [result, categories, brands] = await Promise.all([
    listItems({
      search: q,
      kind: kind as ItemKind | undefined,
      categoryId: category,
      page: Number(page) || 1,
    }),
    listItemCategories(),
    listBrands(),
  ]);
  const { items, total, page: currentPage, pageSize, pageCount } = result;

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";
  const brandName = (id: string | null) =>
    id ? (brands.find((b) => b.id === id)?.name ?? "—") : "—";

  // Carries the active filters onto the pager links, so paging never
  // silently drops the search you're in the middle of.
  const hrefForPage = (target: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (kind) params.set("kind", kind);
    if (category) params.set("category", category);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/masters/items?${query}` : "/masters/items";
  };

  const firstOnPage = (currentPage - 1) * pageSize + 1;
  const lastOnPage = Math.min(currentPage * pageSize, total);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        {/* GET form: submitting drops `page`, so changing any filter
            naturally returns to page 1 rather than stranding you on page 40. */}
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
        <ItemFormDialog categories={categories} brands={brands} />
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
                      variant={item.kind === "catalogue" ? "info" : "default"}
                      className="capitalize"
                    >
                      {item.kind}
                    </Badge>
                  </TableCell>
                  <TableCell>{categoryName(item.category_id)}</TableCell>
                  <TableCell>{brandName(item.brand_id)}</TableCell>
                  <TableCell>
                    {item.indicative_price != null ? inr.format(item.indicative_price) : "—"}
                  </TableCell>
                  <TableCell>
                    <ItemFormDialog categories={categories} brands={brands} item={item} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted text-sm">
              Showing {inr.format(firstOnPage)}–{inr.format(lastOnPage)} of {inr.format(total)}
            </p>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                {currentPage > 1 ? (
                  <LinkButton href={hrefForPage(currentPage - 1)} variant="secondary">
                    Previous
                  </LinkButton>
                ) : (
                  <Button variant="secondary" disabled>
                    Previous
                  </Button>
                )}
                <span className="text-muted text-sm tabular-nums">
                  Page {currentPage} of {pageCount}
                </span>
                {currentPage < pageCount ? (
                  <LinkButton href={hrefForPage(currentPage + 1)} variant="secondary">
                    Next
                  </LinkButton>
                ) : (
                  <Button variant="secondary" disabled>
                    Next
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

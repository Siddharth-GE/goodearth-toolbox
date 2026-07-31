import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { listBrands } from "@/lib/masters/brands";
import { listItemCategories } from "@/lib/masters/item-categories";
import { listItems, type ItemKind } from "@/lib/masters/items";
import { Package } from "lucide-react";
import { ItemFormDialog } from "./_components/item-form-dialog";

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string }>;
}) {
  const { q, kind } = await searchParams;
  const [items, categories, brands] = await Promise.all([
    listItems({ search: q, kind: kind as ItemKind | undefined }),
    listItemCategories(),
    listBrands(),
  ]);
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? "—";
  const brandName = (id: string | null) => (id ? brands.find((b) => b.id === id)?.name ?? "—" : "—");

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-2">
        <form action="/masters/items" className="flex items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="q">Search</Label>
            <Input id="q" name="q" defaultValue={q ?? ""} placeholder="Search name or code…" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kind">Kind</Label>
            <Select id="kind" name="kind" defaultValue={kind ?? ""}>
              <option value="">All</option>
              <option value="catalogue">Catalogue</option>
              <option value="material">Material</option>
            </Select>
          </div>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
        <ItemFormDialog categories={categories} brands={brands} />
      </div>

      {items.length === 0 ? (
        <EmptyState icon={Package} title="No items found" description="Try a different search, or add a new item." />
      ) : (
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
                <TableCell className="font-medium text-foreground">{item.name}</TableCell>
                <TableCell>
                  <Badge variant={item.kind === "catalogue" ? "info" : "default"} className="capitalize">
                    {item.kind}
                  </Badge>
                </TableCell>
                <TableCell>{categoryName(item.category_id)}</TableCell>
                <TableCell>{brandName(item.brand_id)}</TableCell>
                <TableCell>{item.indicative_price != null ? item.indicative_price : "—"}</TableCell>
                <TableCell>
                  <ItemFormDialog categories={categories} brands={brands} item={item} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

import { ItemThumb } from "@/components/masters/item-thumb";
import { Attribution } from "@/components/ui/attribution";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatDate, formatQuantity } from "@/lib/format";
import { listStockAdjustments } from "@/lib/inventory/issues-queries";
import { listBrands } from "@/lib/masters/brands";
import { listItemCategories } from "@/lib/masters/item-categories";
import { SlidersHorizontal } from "lucide-react";
import { InventoryNav } from "../_components/inventory-nav";
import { AdjustmentForm } from "../_components/adjustment-form";

export default async function AdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const [
    { adjustments, total, page: currentPage, pageCount, pageSize, stores },
    categories,
    brands,
  ] = await Promise.all([
    listStockAdjustments({ page: Number(page) || 1 }),
    listItemCategories(),
    listBrands(),
  ]);

  const hrefForPage = (target: number) =>
    target > 1 ? `/inventory/adjustments?page=${target}` : "/inventory/adjustments";

  return (
    <div className="space-y-4">
      <PageTitle
        title="Adjustments"
        description="Opening stock, breakages and recounts — every change by hand carries a reason."
      />

      <InventoryNav active="adjustments" />

      {stores.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="No stores yet"
          description="Add your stores in Masters before adjusting anything."
        />
      ) : (
        <AdjustmentForm
          stores={stores}
          categories={categories.map(({ id, name }) => ({ id, name }))}
          brands={brands.map(({ id, name }) => ({ id, name }))}
        />
      )}

      {adjustments.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="No adjustments recorded"
          description="Every hand-made change to a count shows up here, with who made it and why."
        />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className="w-32">Date</TableHeaderCell>
                <TableHeaderCell className="w-14"></TableHeaderCell>
                <TableHeaderCell>Item</TableHeaderCell>
                <TableHeaderCell>Store</TableHeaderCell>
                <TableHeaderCell className="w-32">Change</TableHeaderCell>
                <TableHeaderCell>Reason</TableHeaderCell>
                <TableHeaderCell className="w-16">By</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {adjustments.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-muted">{formatDate(row.adjusted_at)}</TableCell>
                  <TableCell>
                    <ItemThumb
                      code={row.item_code}
                      name={row.item_name}
                      thumbUrl={row.item_thumb_url}
                      sizes="48px"
                      className="w-10"
                    />
                  </TableCell>
                  <TableCell className="text-foreground font-medium">{row.item_name}</TableCell>
                  <TableCell className="text-muted">{row.store_name}</TableCell>
                  <TableCell
                    className={
                      row.quantity < 0 ? "text-warning font-medium" : "text-success font-medium"
                    }
                  >
                    {row.quantity > 0 ? "+" : "−"}
                    {formatQuantity(Math.abs(row.quantity))} {row.uom}
                  </TableCell>
                  <TableCell className="text-muted">{row.reason}</TableCell>
                  <TableCell>
                    <Attribution name={row.adjusted_by_name} label="Adjusted by" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Pagination
            page={currentPage}
            pageCount={pageCount}
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

import { ItemThumb } from "@/components/masters/item-thumb";
import { Attribution } from "@/components/ui/attribution";
import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
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
import { getInventoryFilterOptions } from "@/lib/inventory/queries";
import { dateParam, idParam, searchParam } from "@/lib/list-params";
import { listBrands } from "@/lib/masters/brands";
import { listItemCategories } from "@/lib/masters/item-categories";
import { SlidersHorizontal } from "lucide-react";
import { InventoryNav } from "../_components/inventory-nav";
import { AdjustmentForm } from "../_components/adjustment-form";

export default async function AdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    store?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const raw = await searchParams;
  const store = idParam(raw.store);
  const q = searchParam(raw.q);
  const from = dateParam(raw.from);
  const to = dateParam(raw.to);

  const [
    { adjustments, total, page: currentPage, pageCount, pageSize, stores },
    categories,
    brands,
    filterOptions,
  ] = await Promise.all([
    listStockAdjustments({ page: Number(raw.page) || 1, storeId: store, q, from, to }),
    listItemCategories(),
    listBrands(),
    getInventoryFilterOptions(),
  ]);

  const filtered = Boolean(store || q || from || to);

  const hrefForPage = (target: number) => {
    const params = new URLSearchParams();
    if (store) params.set("store", store);
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/inventory/adjustments?${query}` : "/inventory/adjustments";
  };

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

      <ListToolbar
        action="/inventory/adjustments"
        values={{ q, from, to, store }}
        search={{ placeholder: "Words in the reason…" }}
        dates={{ label: "Dated" }}
        filters={[
          {
            param: "store",
            label: "Store",
            allLabel: "All stores",
            options: filterOptions.stores.map((row) => ({ value: row.id, label: row.name })),
          },
        ]}
      />

      {adjustments.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title={filtered ? "No adjustments match these filters" : "No adjustments recorded"}
          description={
            filtered
              ? undefined
              : "Every hand-made change to a count shows up here, with who made it and why."
          }
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

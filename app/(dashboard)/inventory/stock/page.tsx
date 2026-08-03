import { ItemThumb } from "@/components/masters/item-thumb";
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
import { formatQuantity } from "@/lib/format";
import { listStockOnHand } from "@/lib/inventory/queries";
import { Boxes } from "lucide-react";
import Link from "next/link";
import { InventoryNav } from "../_components/inventory-nav";
import { StoreFilter } from "../_components/store-filter";

/**
 * What each store holds right now — always computed from movements
 * (receipts in, issues out, transfers, adjustments), never a stored
 * balance. Zero rows stay visible: "had some, has none left" is a
 * different answer from "never held it", and the history behind it is
 * still worth opening.
 */
export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; store?: string }>;
}) {
  const { page, store } = await searchParams;
  const {
    rows,
    total,
    page: currentPage,
    pageCount,
    pageSize,
    stores,
  } = await listStockOnHand({
    page: Number(page) || 1,
    storeId: store,
  });

  const hrefForPage = (target: number) => {
    const params = new URLSearchParams();
    if (store) params.set("store", store);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/inventory/stock?${query}` : "/inventory/stock";
  };

  return (
    <div className="space-y-4">
      <PageTitle
        title="Stock"
        description="What each store holds, counted from every movement in and out."
      />

      <InventoryNav active="stock" />

      <StoreFilter stores={stores} selected={store ?? ""} basePath="/inventory/stock" />

      {rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title={store ? "This store holds nothing yet" : "No stock recorded yet"}
          description="Stock appears once a delivery is received into a store, or an opening balance is entered as an adjustment."
        />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell className="w-14"></TableHeaderCell>
                <TableHeaderCell>Item</TableHeaderCell>
                <TableHeaderCell>Store</TableHeaderCell>
                <TableHeaderCell className="w-36">On hand</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.store_id}:${row.item_id}`}>
                  <TableCell>
                    <ItemThumb
                      code={row.item_code}
                      name={row.item_name}
                      thumbUrl={row.item_thumb_url}
                      sizes="48px"
                      className="w-10"
                    />
                  </TableCell>
                  <TableCell>
                    <span className="text-foreground font-medium">{row.item_name}</span>
                    <div className="text-muted text-xs">
                      {row.item_code ?? "—"}
                      {row.item_brand && <span className="ml-2">{row.item_brand}</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted">{row.store_name}</TableCell>
                  <TableCell
                    className={row.quantity > 0 ? "text-foreground font-medium" : "text-muted"}
                  >
                    {formatQuantity(row.quantity)} {row.uom}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/inventory/stock/${row.store_id}/${row.item_id}`}
                      className="text-accent text-sm font-medium hover:underline"
                    >
                      History
                    </Link>
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

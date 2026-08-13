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
import { formatCount, formatDate } from "@/lib/format";
import { listGoodsReceipts, listReceivablePos } from "@/lib/inventory/receipts-queries";
import { PackageCheck } from "lucide-react";
import Link from "next/link";
import { InventoryNav } from "../_components/inventory-nav";

/**
 * The Receive screen: purchase orders with goods still to come, and the
 * deliveries recorded most recently. A PO leaves the top list by
 * completing itself once every line has arrived, so an empty list means
 * nothing is outstanding.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const [{ orders, total, page: currentPage, pageCount, pageSize }, { receipts }] =
    await Promise.all([
      listReceivablePos({ page: Number(page) || 1 }),
      listGoodsReceipts({ page: 1 }),
    ]);

  const hrefForPage = (target: number) =>
    target > 1 ? `/inventory/receive?page=${target}` : "/inventory/receive";

  return (
    <div className="space-y-4">
      <PageTitle
        title="Receive"
        description="Record what arrives against a purchase order."
        backHref="/inventory"
      />

      <InventoryNav active="receive" />

      <section className="space-y-2">
        <h2 className="text-muted text-xs font-semibold tracking-widest uppercase">
          Awaiting delivery
        </h2>

        {orders.length === 0 ? (
          <EmptyState
            icon={PackageCheck}
            title="Nothing is on its way"
            description="Issued purchase orders appear here until every line has been received."
          />
        ) : (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Purchase order</TableHeaderCell>
                  <TableHeaderCell>Project</TableHeaderCell>
                  <TableHeaderCell>Vendor</TableHeaderCell>
                  <TableHeaderCell>For</TableHeaderCell>
                  <TableHeaderCell>Expected by</TableHeaderCell>
                  <TableHeaderCell>Received</TableHeaderCell>
                  <TableHeaderCell></TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orders.map((po) => (
                  <TableRow key={po.id}>
                    <TableCell className="text-foreground font-medium">{po.reference}</TableCell>
                    <TableCell>{po.project_name}</TableCell>
                    <TableCell>{po.vendor_name}</TableCell>
                    <TableCell className="text-muted">{po.scope_label}</TableCell>
                    <TableCell className="text-muted">{formatDate(po.expected_by)}</TableCell>
                    <TableCell className="text-muted">
                      {formatCount(po.lines_complete)} of {formatCount(po.line_count)} lines
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/inventory/receive/${po.id}`}
                        className="text-accent text-sm font-medium hover:underline"
                      >
                        Receive
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
      </section>

      {receipts.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-muted text-xs font-semibold tracking-widest uppercase">
            Recent deliveries
          </h2>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Delivery note</TableHeaderCell>
                <TableHeaderCell>Against</TableHeaderCell>
                <TableHeaderCell>Went to</TableHeaderCell>
                <TableHeaderCell>Challan</TableHeaderCell>
                <TableHeaderCell>Received</TableHeaderCell>
                <TableHeaderCell>Lines</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {receipts.slice(0, 10).map((receipt) => (
                <TableRow key={receipt.id}>
                  <TableCell className="text-foreground font-medium">{receipt.reference}</TableCell>
                  <TableCell>{receipt.po_reference}</TableCell>
                  <TableCell className="text-muted">{receipt.destination}</TableCell>
                  <TableCell className="text-muted">{receipt.challan_no ?? "—"}</TableCell>
                  <TableCell className="text-muted">{formatDate(receipt.received_at)}</TableCell>
                  <TableCell>{formatCount(receipt.line_count)}</TableCell>
                  <TableCell>
                    <Link
                      href={`/inventory/receipts/${receipt.id}`}
                      className="text-accent text-sm font-medium hover:underline"
                    >
                      Open
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
    </div>
  );
}

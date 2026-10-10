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
import { formatCount, formatDate } from "@/lib/format";
import { getInventoryFilterOptions } from "@/lib/inventory/queries";
import { listGoodsReceipts, listReceivablePos } from "@/lib/inventory/receipts-queries";
import { dateParam, idParam, searchParam } from "@/lib/list-params";
import { PackageCheck } from "lucide-react";
import Link from "next/link";
import { InventoryNav } from "../_components/inventory-nav";

/**
 * The Receive screen: purchase orders with goods still to come, and the
 * deliveries recorded, searchable (the second list pages on `rpage`, so
 * the two lists keep their own places). A PO leaves the top list by
 * completing itself once every line has arrived, so an empty list means
 * nothing is outstanding.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    rpage?: string;
    q?: string;
    project?: string;
    store?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const raw = await searchParams;
  const awaitingPage = Number(raw.page) || 1;
  const deliveriesPage = Number(raw.rpage) || 1;
  const project = idParam(raw.project);
  const store = idParam(raw.store);
  const q = searchParam(raw.q);
  const from = dateParam(raw.from);
  const to = dateParam(raw.to);

  const [{ orders, total, page: currentPage, pageCount, pageSize }, deliveries, filterOptions] =
    await Promise.all([
      listReceivablePos({ page: awaitingPage }),
      listGoodsReceipts({
        page: deliveriesPage,
        projectId: project,
        storeId: store,
        q,
        from,
        to,
      }),
      getInventoryFilterOptions(),
    ]);
  const { receipts } = deliveries;

  const filtered = Boolean(project || store || q || from || to);

  // The two lists keep their own places; the delivery filters ride along
  // on both lists' links so paging one never drops the other's search.
  const hrefWith = (position: { page: number; rpage: number }) => {
    const params = new URLSearchParams();
    if (position.page > 1) params.set("page", String(position.page));
    if (position.rpage > 1) params.set("rpage", String(position.rpage));
    if (project) params.set("project", project);
    if (store) params.set("store", store);
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const query = params.toString();
    return query ? `/inventory/receive?${query}` : "/inventory/receive";
  };

  return (
    <div className="space-y-4">
      <PageTitle
        title="Receive"
        description="Record what arrives against a purchase order."
        backHref="/inventory"
      />

      <InventoryNav active="receive" />

      <section className="space-y-2">
        <h2 className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
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
              prevHref={
                currentPage > 1 ? hrefWith({ page: currentPage - 1, rpage: deliveries.page }) : null
              }
              nextHref={
                currentPage < pageCount
                  ? hrefWith({ page: currentPage + 1, rpage: deliveries.page })
                  : null
              }
              total={total}
              pageSize={pageSize}
            />
          </>
        )}
      </section>

      {(deliveries.total > 0 || filtered) && (
        <section className="space-y-3">
          <h2 className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
            Deliveries recorded
          </h2>

          <ListToolbar
            action="/inventory/receive"
            values={{ q, from, to, project, store }}
            keep={{ page: awaitingPage > 1 ? String(awaitingPage) : undefined }}
            search={{ placeholder: "Delivery note or challan no.…" }}
            dates={{ label: "Received" }}
            filters={[
              {
                param: "project",
                label: "Project",
                allLabel: "All projects",
                options: filterOptions.projects.map((row) => ({ value: row.id, label: row.name })),
              },
              {
                param: "store",
                label: "Store",
                allLabel: "All stores",
                options: filterOptions.stores.map((row) => ({ value: row.id, label: row.name })),
              },
            ]}
          />

          {receipts.length === 0 ? (
            <EmptyState
              icon={PackageCheck}
              title="No deliveries match these filters"
              description="Try a different date range, or clear the filters."
            />
          ) : (
            <>
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
                  {receipts.map((receipt) => (
                    <TableRow key={receipt.id}>
                      <TableCell className="text-foreground font-medium">
                        {receipt.reference}
                      </TableCell>
                      <TableCell>{receipt.po_reference}</TableCell>
                      <TableCell className="text-muted">{receipt.destination}</TableCell>
                      <TableCell className="text-muted">{receipt.challan_no ?? "—"}</TableCell>
                      <TableCell className="text-muted">
                        {formatDate(receipt.received_at)}
                      </TableCell>
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

              <Pagination
                page={deliveries.page}
                pageCount={deliveries.pageCount}
                prevHref={
                  deliveries.page > 1
                    ? hrefWith({ page: currentPage, rpage: deliveries.page - 1 })
                    : null
                }
                nextHref={
                  deliveries.page < deliveries.pageCount
                    ? hrefWith({ page: currentPage, rpage: deliveries.page + 1 })
                    : null
                }
                total={deliveries.total}
                pageSize={deliveries.pageSize}
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}

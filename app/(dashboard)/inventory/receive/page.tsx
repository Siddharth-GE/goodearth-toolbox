import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
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
import {
  listGoodsReceipts,
  listReceivablePos,
  listReceivableVendors,
} from "@/lib/inventory/receipts-queries";
import { dateParam, idParam, searchParam } from "@/lib/list-params";
import { PackageCheck } from "lucide-react";
import Link from "next/link";
import { InventoryNav } from "../_components/inventory-nav";

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
    poq?: string;
    poproject?: string;
    povendor?: string;
    poplot?: string;
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
  const poq = searchParam(raw.poq);
  const poProject = idParam(raw.poproject);
  const poVendor = idParam(raw.povendor);
  const poPlot = idParam(raw.poplot);
  const poFiltered = Boolean(poq || poProject || poVendor || poPlot);

  const [
    { orders, total, page: currentPage, pageCount, pageSize },
    deliveries,
    filterOptions,
    poVendors,
  ] = await Promise.all([
    listReceivablePos({
      page: awaitingPage,
      q: poq,
      projectId: poProject,
      vendorId: poVendor,
      plotId: poPlot,
    }),
    listGoodsReceipts({
      page: deliveriesPage,
      projectId: project,
      storeId: store,
      q,
      from,
      to,
    }),
    getInventoryFilterOptions(),
    listReceivableVendors(),
  ]);
  const { receipts } = deliveries;

  const filtered = Boolean(project || store || q || from || to);

  // Delivery filters ride on both lists' links so paging one never drops the other's search.
  const hrefWith = (position: { page: number; rpage: number }) => {
    const params = new URLSearchParams();
    if (position.page > 1) params.set("page", String(position.page));
    if (position.rpage > 1) params.set("rpage", String(position.rpage));
    if (project) params.set("project", project);
    if (store) params.set("store", store);
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (poq) params.set("poq", poq);
    if (poProject) params.set("poproject", poProject);
    if (poVendor) params.set("povendor", poVendor);
    if (poPlot) params.set("poplot", poPlot);
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

        {(total > 0 || poFiltered) && (
          <form action="/inventory/receive" className="flex flex-wrap items-end gap-2">
            {/* The deliveries list's filters ride along, as its toolbar keeps these. */}
            {Object.entries({ q, from, to, project, store }).map(([name, value]) =>
              value ? <input key={name} type="hidden" name={name} value={value} /> : null,
            )}
            <div className="w-full space-y-1.5 sm:w-64">
              <Label htmlFor="poq">Find a purchase order</Label>
              <Input
                id="poq"
                name="poq"
                type="search"
                defaultValue={poq ?? ""}
                placeholder="PO number or vendor…"
                autoComplete="off"
              />
            </div>
            <div className="w-full space-y-1.5 sm:w-48">
              <Label htmlFor="poproject">Project</Label>
              <Select id="poproject" name="poproject" defaultValue={poProject ?? ""}>
                <option value="">All projects</option>
                {filterOptions.projects.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full space-y-1.5 sm:w-48">
              <Label htmlFor="povendor">Vendor</Label>
              <Select id="povendor" name="povendor" defaultValue={poVendor ?? ""}>
                <option value="">All vendors</option>
                {poVendors.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full space-y-1.5 sm:w-48">
              <Label htmlFor="poplot">Villa</Label>
              <Select id="poplot" name="poplot" defaultValue={poPlot ?? ""}>
                <option value="">Any villa or general</option>
                {filterOptions.plots.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="secondary">
              Find
            </Button>
            {poFiltered && (
              <LinkButton href="/inventory/receive" variant="ghost">
                Clear
              </LinkButton>
            )}
          </form>
        )}

        {orders.length === 0 ? (
          poFiltered ? (
            <EmptyState
              icon={PackageCheck}
              title="No purchase order matches"
              description="Try another PO number or vendor, or clear the search."
            />
          ) : (
            <EmptyState
              icon={PackageCheck}
              title="Nothing is on its way"
              description="Issued purchase orders appear here until every line has been received."
            />
          )
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
            keep={{
              page: awaitingPage > 1 ? String(awaitingPage) : undefined,
              poq,
              poproject: poProject,
              povendor: poVendor,
              poplot: poPlot,
            }}
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

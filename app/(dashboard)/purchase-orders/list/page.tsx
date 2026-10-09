import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { NavTabs } from "@/components/ui/tabs";
import { formatCount, formatDate } from "@/lib/format";
import { dateParam, idParam, searchParam } from "@/lib/list-params";
import { getPoFilterOptions, listPurchaseOrders } from "@/lib/purchase-orders/queries";
import type { PoStatus } from "@/lib/purchase-orders/workflow";
import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { PoStatusBadge } from "../_components/status-badge";

const TABS: { key: string; label: string; status?: PoStatus }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft", status: "draft" },
  { key: "issued", label: "Issued", status: "issued" },
  { key: "deletion_requested", label: "Deletion requested", status: "deletion_requested" },
  { key: "cancelled", label: "Cancelled", status: "cancelled" },
  { key: "completed", label: "Completed", status: "completed" },
];

export default async function PurchaseOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    page?: string;
    vendor?: string;
    project?: string;
    q?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const raw = await searchParams;
  const page = raw.page;
  const vendor = idParam(raw.vendor);
  const project = idParam(raw.project);
  const q = searchParam(raw.q);
  const from = dateParam(raw.from);
  const to = dateParam(raw.to);
  const tab = TABS.find((t) => t.status === raw.status) ?? TABS[0];

  const [result, filterOptions] = await Promise.all([
    listPurchaseOrders({
      page: Number(page) || 1,
      status: tab.status,
      vendorId: vendor,
      projectId: project,
      q,
      from,
      to,
    }),
    getPoFilterOptions(),
  ]);
  const { orders, total, page: currentPage, pageCount, pageSize } = result;

  // Every choice rides along, so a tab or a page link never drops a filter.
  const hrefWith = (params: URLSearchParams) => {
    if (vendor) params.set("vendor", vendor);
    if (project) params.set("project", project);
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const query = params.toString();
    return query ? `/purchase-orders/list?${query}` : "/purchase-orders/list";
  };

  const hrefForPage = (target: number) => {
    const params = new URLSearchParams();
    if (tab.status) params.set("status", tab.status);
    if (target > 1) params.set("page", String(target));
    return hrefWith(params);
  };

  const hrefForTab = (status?: PoStatus) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    return hrefWith(params);
  };

  const filtered = Boolean(vendor || project || q || from || to);

  return (
    <div className="space-y-4">
      <PageTitle
        title="All purchase orders"
        description="Orders to vendors — from approved indents or raised directly — one vendor and one plot/unit per PO."
        backHref="/purchase-orders"
        actions={
          <>
            <LinkButton href="/purchase-orders/new" variant="secondary">
              New PO (direct)
            </LinkButton>
            <LinkButton href="/purchase-orders/from-indent">From an indent</LinkButton>
          </>
        }
      />

      <NavTabs
        tabs={TABS.map((t) => ({
          key: t.key,
          href: hrefForTab(t.status),
          label: t.label,
        }))}
        active={tab.key}
      />

      <ListToolbar
        action="/purchase-orders/list"
        values={{ q, from, to, vendor, project }}
        keep={{ status: tab.status }}
        search={{ placeholder: "PO number or vendor…" }}
        dates={{ label: "Created" }}
        filters={[
          {
            param: "vendor",
            label: "Vendor",
            allLabel: "All vendors",
            options: filterOptions.vendors.map((row) => ({ value: row.id, label: row.name })),
          },
          {
            param: "project",
            label: "Project",
            allLabel: "All projects",
            options: filterOptions.projects.map((row) => ({ value: row.id, label: row.name })),
          },
        ]}
      />

      {orders.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title={
            tab.status || filtered
              ? `No ${tab.status ? `${tab.label.toLowerCase()} ` : ""}purchase orders${filtered ? " match these filters" : ""}`
              : "No purchase orders yet"
          }
          description={
            tab.status || filtered
              ? undefined
              : "Pick an approved indent and its lines become draft POs, one per vendor — or raise one directly for a bulk or urgent buy."
          }
          action={
            tab.status || filtered ? undefined : (
              <LinkButton href="/purchase-orders/from-indent">From an indent</LinkButton>
            )
          }
        />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Reference</TableHeaderCell>
                <TableHeaderCell>Project</TableHeaderCell>
                <TableHeaderCell>Vendor</TableHeaderCell>
                <TableHeaderCell>Expected by</TableHeaderCell>
                <TableHeaderCell>Lines</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((po) => (
                <TableRow key={po.id}>
                  <TableCell className="text-foreground font-medium">{po.reference}</TableCell>
                  <TableCell>{po.project_name}</TableCell>
                  <TableCell>{po.vendor_name}</TableCell>
                  <TableCell className="text-muted">{formatDate(po.expected_by)}</TableCell>
                  <TableCell>{formatCount(po.line_count)}</TableCell>
                  <TableCell>
                    <PoStatusBadge status={po.status} />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/purchase-orders/${po.id}`}
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

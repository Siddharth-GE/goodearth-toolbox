import { LinkButton } from "@/components/ui/button";
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
import { NavTabs } from "@/components/ui/tabs";
import { formatCount, formatDate } from "@/lib/format";
import { listPurchaseOrders } from "@/lib/purchase-orders/queries";
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
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { status: statusParam, page } = await searchParams;
  const tab = TABS.find((t) => t.status === statusParam) ?? TABS[0];

  const result = await listPurchaseOrders({ page: Number(page) || 1, status: tab.status });
  const { orders, total, page: currentPage, pageCount, pageSize } = result;

  const hrefForPage = (target: number) => {
    const params = new URLSearchParams();
    if (tab.status) params.set("status", tab.status);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/purchase-orders/list?${query}` : "/purchase-orders/list";
  };

  return (
    <div className="space-y-4">
      <PageTitle
        title="All purchase orders"
        description="Orders to vendors, raised from approved indent lines — one vendor and one plot/unit per PO."
        backHref="/purchase-orders"
        actions={<LinkButton href="/purchase-orders/new">New PO</LinkButton>}
      />

      <NavTabs
        tabs={TABS.map((t) => ({
          key: t.key,
          href: t.status ? `/purchase-orders/list?status=${t.status}` : "/purchase-orders/list",
          label: t.label,
        }))}
        active={tab.key}
      />

      {orders.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title={
            tab.status ? `No ${tab.label.toLowerCase()} purchase orders` : "No purchase orders yet"
          }
          description={
            tab.status
              ? undefined
              : "Raise one from an approved indent — pick the vendor, price the lines, issue it."
          }
          action={
            tab.status ? undefined : <LinkButton href="/purchase-orders/new">New PO</LinkButton>
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

import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PageTitle } from "@/components/ui/page-title";
import {
  Table,
  TableBody,
  TableCell,
  TableFoot,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableTotalCell,
} from "@/components/ui/table";
import { getContractFormOptions } from "@/lib/bills/queries";
import { listWorkOrders } from "@/lib/bills/work-order-queries";
import type { ContractStatus } from "@/lib/bills/workflow";
import { formatCount, formatMoney } from "@/lib/format";
import { idParam, searchParam } from "@/lib/list-params";
import { HardHat } from "lucide-react";
import Link from "next/link";

const STATUSES: { value: ContractStatus; label: string }[] = [
  { value: "pending_approval", label: "Pending approval" },
  { value: "approved", label: "Approved" },
];

/**
 * Work orders (plan.md B6) — the labour contracts, renamed and made
 * richer: numbered, with their works and terms. The A4 bar: search,
 * filters, and totals over every matched order.
 */
export default async function WorkOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; project?: string; vendor?: string; status?: string }>;
}) {
  const raw = await searchParams;
  const q = searchParam(raw.q);
  const project = idParam(raw.project);
  const vendor = idParam(raw.vendor);
  const status = STATUSES.find((option) => option.value === raw.status)?.value;

  const [orders, options] = await Promise.all([
    listWorkOrders({ q, projectId: project, vendorId: vendor, status }),
    getContractFormOptions(),
  ]);
  const filtered = Boolean(q || project || vendor || status);
  const totalValue = orders.reduce((sum, order) => sum + order.contract_value, 0);
  const totalBilled = orders.reduce((sum, order) => sum + order.billed_total, 0);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Work orders"
        backHref="/bills"
        backLabel="Bills"
        description="A contractor's works, priced and with their terms — approved by a bill approver, then billed against."
        actions={
          <>
            <LinkButton href="/bills/work-orders/templates" variant="secondary">
              Templates
            </LinkButton>
            <LinkButton href="/bills/work-orders/new">New work order</LinkButton>
          </>
        }
      />

      <ListToolbar
        action="/bills/work-orders"
        values={{ q, project, vendor, status }}
        search={{ placeholder: "Number, contractor, villa or what it covers…" }}
        filters={[
          {
            param: "project",
            label: "Project",
            allLabel: "All projects",
            options: options.projects.map((row) => ({ value: row.id, label: row.name })),
          },
          {
            param: "vendor",
            label: "Contractor",
            allLabel: "All contractors",
            options: options.vendors.map((row) => ({ value: row.id, label: row.name })),
          },
          {
            param: "status",
            label: "Status",
            allLabel: "Any status",
            options: STATUSES.map((row) => ({ value: row.value, label: row.label })),
          },
        ]}
      />

      {orders.length === 0 ? (
        <EmptyState
          icon={HardHat}
          title={filtered ? "No work orders match these filters" : "No work orders yet"}
          description={
            filtered
              ? undefined
              : "Make one: a contractor, the works from the Masters list, the terms. Once approved, bills are recorded against it."
          }
          action={
            filtered ? undefined : (
              <LinkButton href="/bills/work-orders/new">New work order</LinkButton>
            )
          }
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Number</TableHeaderCell>
              <TableHeaderCell>Contractor</TableHeaderCell>
              <TableHeaderCell>Project</TableHeaderCell>
              <TableHeaderCell>Villa</TableHeaderCell>
              <TableHeaderCell>Covers</TableHeaderCell>
              <TableHeaderCell className="text-right">Value</TableHeaderCell>
              <TableHeaderCell className="text-right">Billed</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-mono font-medium">
                  <Link
                    href={`/bills/work-orders/${order.id}`}
                    className="text-accent hover:underline"
                  >
                    {order.reference ?? "No number"}
                  </Link>
                </TableCell>
                <TableCell className="text-foreground">{order.vendor_name}</TableCell>
                <TableCell>{order.project_name}</TableCell>
                <TableCell>{order.place}</TableCell>
                <TableCell className="text-muted">{order.description}</TableCell>
                <TableCell className="text-right font-mono">
                  {formatMoney(order.contract_value)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMoney(order.billed_total)}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1">
                    {order.status === "approved" ? (
                      <Badge variant="success">Approved</Badge>
                    ) : (
                      <Badge variant="warning">Pending approval</Badge>
                    )}
                    {!order.is_active && <Badge variant="neutral">Switched off</Badge>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFoot>
            <TableRow>
              <TableTotalCell colSpan={5}>
                {`${formatCount(orders.length)} ${orders.length === 1 ? "work order" : "work orders"}`}
              </TableTotalCell>
              <TableTotalCell className="text-right font-mono">
                {formatMoney(totalValue)}
              </TableTotalCell>
              <TableTotalCell className="text-right font-mono">
                {formatMoney(totalBilled)}
              </TableTotalCell>
              <TableTotalCell />
            </TableRow>
          </TableFoot>
        </Table>
      )}
    </div>
  );
}

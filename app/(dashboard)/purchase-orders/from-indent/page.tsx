import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PageTitle } from "@/components/ui/page-title";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatCount, formatDate } from "@/lib/format";
import { searchParam } from "@/lib/list-params";
import { listIndentsToOrder } from "@/lib/purchase-orders/queries";
import { ClipboardList } from "lucide-react";
import Link from "next/link";

/**
 * Step one of a PO from an indent (plan.md, B3): the approved indents
 * with anything still to buy. Picking one opens its lines, where each
 * gets a vendor and Create makes the draft POs.
 */
export default async function IndentsToOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const q = searchParam((await searchParams).q);
  const indents = await listIndentsToOrder(q);

  return (
    <div className="space-y-4">
      <PageTitle
        title="A PO from an indent"
        backHref="/purchase-orders"
        backLabel="Purchase Orders"
        description="Approved indents with something still to buy. Pick one: its lines get a vendor each, and one draft PO is made per vendor."
        actions={
          <LinkButton href="/purchase-orders/new" variant="secondary">
            New PO (direct)
          </LinkButton>
        }
      />

      <ListToolbar
        action="/purchase-orders/from-indent"
        values={{ q }}
        search={{ placeholder: "Indent number, project, villa or work…" }}
      />

      {indents.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={q ? "No indent to order matches that" : "Nothing waiting to be ordered"}
          description={
            q
              ? undefined
              : "Every approved indent is fully ordered. New ones arrive here once they're approved in Indents."
          }
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Indent</TableHeaderCell>
              <TableHeaderCell>Project</TableHeaderCell>
              <TableHeaderCell>Villa</TableHeaderCell>
              <TableHeaderCell>Work</TableHeaderCell>
              <TableHeaderCell>Approved</TableHeaderCell>
              <TableHeaderCell>Still to buy</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {indents.map((indent) => (
              <TableRow key={indent.id}>
                <TableCell className="text-foreground font-mono font-medium">
                  {indent.reference}
                </TableCell>
                <TableCell>{indent.project_name}</TableCell>
                <TableCell>{indent.place}</TableCell>
                <TableCell className="text-muted">{indent.work_label ?? "—"}</TableCell>
                <TableCell className="text-muted">{formatDate(indent.approved_at)}</TableCell>
                <TableCell>
                  {formatCount(indent.lines_left)} of {formatCount(indent.line_count)}{" "}
                  {indent.line_count === 1 ? "line" : "lines"}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/purchase-orders/from-indent/${indent.id}`}
                    className="text-accent text-sm font-medium hover:underline"
                  >
                    Order
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

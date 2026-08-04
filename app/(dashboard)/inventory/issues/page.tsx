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
import { formatCount, formatDate } from "@/lib/format";
import { listStockIssues } from "@/lib/inventory/issues-queries";
import { PackageMinus } from "lucide-react";
import Link from "next/link";
import { InventoryNav } from "../_components/inventory-nav";

/** Material leaving a store — to a plot, where it gets used, or to
 * another store, which is a transfer. */
export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const {
    issues,
    total,
    page: currentPage,
    pageCount,
    pageSize,
  } = await listStockIssues({
    page: Number(page) || 1,
  });

  const hrefForPage = (target: number) =>
    target > 1 ? `/inventory/issues?page=${target}` : "/inventory/issues";

  return (
    <div className="space-y-4">
      <PageTitle
        title="Issues"
        description="What has gone out of a store — to a plot to be used, or across to another store."
        actions={<LinkButton href="/inventory/issues/new">New issue</LinkButton>}
      />

      <InventoryNav active="issues" />

      {issues.length === 0 ? (
        <EmptyState
          icon={PackageMinus}
          title="Nothing has been issued yet"
          description="Record material leaving a store and its stock drops straight away."
          action={<LinkButton href="/inventory/issues/new">New issue</LinkButton>}
        />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Reference</TableHeaderCell>
                <TableHeaderCell>Out of</TableHeaderCell>
                <TableHeaderCell>To</TableHeaderCell>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell>Lines</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {issues.map((issue) => (
                <TableRow key={issue.id}>
                  <TableCell className="text-foreground font-medium">{issue.reference}</TableCell>
                  <TableCell>{issue.store_name}</TableCell>
                  <TableCell className="text-muted">{issue.destination}</TableCell>
                  <TableCell className="text-muted">{formatDate(issue.issued_at)}</TableCell>
                  <TableCell>{formatCount(issue.line_count)}</TableCell>
                  <TableCell>
                    <Link
                      href={`/inventory/issues/${issue.id}`}
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

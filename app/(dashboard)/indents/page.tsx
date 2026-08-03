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
import { listIndents } from "@/lib/indents/queries";
import type { IndentStatus } from "@/lib/indents/workflow";
import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { IndentStatusBadge } from "./_components/status-badge";

const TABS: { key: string; label: string; status?: IndentStatus }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft", status: "draft" },
  { key: "submitted", label: "Submitted", status: "submitted" },
  { key: "approved", label: "Approved", status: "approved" },
];

export default async function IndentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const { status: statusParam, page } = await searchParams;
  const tab = TABS.find((t) => t.status === statusParam) ?? TABS[0];

  const result = await listIndents({ page: Number(page) || 1, status: tab.status });
  const { indents, total, page: currentPage, pageCount, pageSize } = result;

  // Carries the active tab onto the pager links, so paging never drops
  // the filter you're in (the Items-list pattern; strings, not a
  // function — a function can't cross into a Client Component).
  const hrefForPage = (target: number) => {
    const params = new URLSearchParams();
    if (tab.status) params.set("status", tab.status);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/indents?${query}` : "/indents";
  };

  return (
    <div className="space-y-4">
      <PageTitle
        title="Indents"
        description="Material requests from site — numbered per project, approved before purchase."
        actions={<LinkButton href="/indents/new">New indent</LinkButton>}
      />

      <NavTabs
        tabs={TABS.map((t) => ({
          key: t.key,
          href: t.status ? `/indents?status=${t.status}` : "/indents",
          label: t.label,
        }))}
        active={tab.key}
      />

      {indents.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={tab.status ? `No ${tab.label.toLowerCase()} indents` : "No indents yet"}
          description={
            tab.status
              ? undefined
              : "Raise one for a project — pick the materials, submit it for approval."
          }
          action={tab.status ? undefined : <LinkButton href="/indents/new">New indent</LinkButton>}
        />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Reference</TableHeaderCell>
                <TableHeaderCell>Project</TableHeaderCell>
                <TableHeaderCell>Unit / stage</TableHeaderCell>
                <TableHeaderCell>Required by</TableHeaderCell>
                <TableHeaderCell>Lines</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {indents.map((indent) => (
                <TableRow key={indent.id}>
                  <TableCell className="text-foreground font-medium">{indent.reference}</TableCell>
                  <TableCell>{indent.project_name}</TableCell>
                  <TableCell>
                    {indent.unit_name ?? "—"}
                    {indent.stage && <div className="text-muted text-xs">{indent.stage}</div>}
                  </TableCell>
                  <TableCell className="text-muted">{formatDate(indent.required_by)}</TableCell>
                  <TableCell>{formatCount(indent.line_count)}</TableCell>
                  <TableCell>
                    <IndentStatusBadge status={indent.status} />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/indents/${indent.id}`}
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

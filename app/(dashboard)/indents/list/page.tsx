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
import { getIndentFilterOptions, listIndents } from "@/lib/indents/queries";
import type { IndentStatus } from "@/lib/indents/workflow";
import { dateParam, idParam, searchParam } from "@/lib/list-params";
import { ClipboardList } from "lucide-react";
import Link from "next/link";
import { IndentStatusBadge } from "../_components/status-badge";

const TABS: { key: string; label: string; status?: IndentStatus }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft", status: "draft" },
  { key: "submitted", label: "Submitted", status: "submitted" },
  { key: "approved", label: "Approved", status: "approved" },
];

export default async function IndentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    page?: string;
    project?: string;
    work?: string;
    q?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const raw = await searchParams;
  const page = raw.page;
  const project = idParam(raw.project);
  const work = idParam(raw.work);
  const q = searchParam(raw.q);
  const from = dateParam(raw.from);
  const to = dateParam(raw.to);
  const tab = TABS.find((t) => t.status === raw.status) ?? TABS[0];

  const [result, filterOptions] = await Promise.all([
    listIndents({
      page: Number(page) || 1,
      status: tab.status,
      projectId: project,
      workItemId: work,
      q,
      from,
      to,
    }),
    getIndentFilterOptions(),
  ]);
  const { indents, total, page: currentPage, pageCount, pageSize } = result;

  // Every choice rides along, so a tab or a page link never drops a filter
  // (strings, not a function — a function can't cross into a Client
  // Component).
  const hrefWith = (params: URLSearchParams) => {
    if (project) params.set("project", project);
    if (work) params.set("work", work);
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const query = params.toString();
    return query ? `/indents/list?${query}` : "/indents/list";
  };

  const hrefForPage = (target: number) => {
    const params = new URLSearchParams();
    if (tab.status) params.set("status", tab.status);
    if (target > 1) params.set("page", String(target));
    return hrefWith(params);
  };

  const hrefForTab = (status?: IndentStatus) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    return hrefWith(params);
  };

  const filtered = Boolean(project || work || q || from || to);

  return (
    <div className="space-y-4">
      <PageTitle
        title="All indents"
        description="Material requests from site — numbered per project, approved before purchase."
        backHref="/indents"
        actions={<LinkButton href="/indents/new">New indent</LinkButton>}
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
        action="/indents/list"
        values={{ q, from, to, project, work }}
        keep={{ status: tab.status }}
        search={{ placeholder: "Indent number…" }}
        dates={{ label: "Raised" }}
        filters={[
          {
            param: "project",
            label: "Project",
            allLabel: "All projects",
            options: filterOptions.projects.map((row) => ({ value: row.id, label: row.name })),
          },
          {
            param: "work",
            label: "Work",
            allLabel: "All works",
            options: filterOptions.works.map((row) => ({ value: row.id, label: row.label })),
          },
        ]}
      />

      {indents.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={
            tab.status || filtered
              ? `No ${tab.status ? `${tab.label.toLowerCase()} ` : ""}indents${filtered ? " match these filters" : ""}`
              : "No indents yet"
          }
          description={
            tab.status || filtered
              ? undefined
              : "Raise one for a project — pick the materials, submit it for approval."
          }
          action={
            tab.status || filtered ? undefined : (
              <LinkButton href="/indents/new">New indent</LinkButton>
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
                <TableHeaderCell>Unit / stage</TableHeaderCell>
                <TableHeaderCell>Required by</TableHeaderCell>
                <TableHeaderCell>Lines</TableHeaderCell>
                <TableHeaderCell>To buy</TableHeaderCell>
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
                    <ToBuy lines={indent.lines_to_buy} />
                  </TableCell>
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

/** Only approved indents get bought, so a draft or submitted one shows a dash. */
function ToBuy({ lines }: { lines: number | null }) {
  if (lines === null) return <span className="text-muted">—</span>;
  if (lines === 0) return <span className="text-success">All ordered</span>;
  return (
    <span>
      {formatCount(lines)} {lines === 1 ? "line" : "lines"}
    </span>
  );
}

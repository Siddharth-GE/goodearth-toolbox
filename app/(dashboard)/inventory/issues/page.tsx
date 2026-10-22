import { LinkButton } from "@/components/ui/button";
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
import { NavTabs } from "@/components/ui/tabs";
import { formatCount, formatDate, formatQuantity } from "@/lib/format";
import { listIssueItems, listStockIssues } from "@/lib/inventory/issues-queries";
import { getInventoryFilterOptions } from "@/lib/inventory/queries";
import { dateParam, idParam, searchParam } from "@/lib/list-params";
import { PackageMinus } from "lucide-react";
import Link from "next/link";
import { InventoryNav } from "../_components/inventory-nav";

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    project?: string;
    store?: string;
    plot?: string;
    from?: string;
    to?: string;
    view?: string;
  }>;
}) {
  const raw = await searchParams;
  const project = idParam(raw.project);
  const store = idParam(raw.store);
  const plot = idParam(raw.plot);
  const q = searchParam(raw.q);
  const from = dateParam(raw.from);
  const to = dateParam(raw.to);
  const itemsView = raw.view === "items";

  const [{ issues, total, page: currentPage, pageCount, pageSize }, filterOptions] =
    await Promise.all([
      listStockIssues({
        page: Number(raw.page) || 1,
        projectId: project,
        storeId: store,
        plotId: plot,
        q,
        from,
        to,
      }),
      getInventoryFilterOptions(),
    ]);

  const items = itemsView ? await listIssueItems(issues.map((issue) => issue.id)) : [];
  const issueById = new Map(issues.map((issue) => [issue.id, issue]));
  const filtered = Boolean(project || store || plot || q || from || to);

  const hrefFor = (target: number, view: boolean) => {
    const params = new URLSearchParams();
    if (view) params.set("view", "items");
    if (project) params.set("project", project);
    if (store) params.set("store", store);
    if (plot) params.set("plot", plot);
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/inventory/issues?${query}` : "/inventory/issues";
  };
  const hrefForPage = (target: number) => hrefFor(target, itemsView);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Issues"
        description="What has gone out of a store — to a plot to be used, or across to another store."
        actions={<LinkButton href="/inventory/issues/new">New issue</LinkButton>}
      />

      <InventoryNav active="issues" />

      <NavTabs
        tabs={[
          { key: "issues", href: hrefFor(1, false), label: "Issues" },
          { key: "items", href: hrefFor(1, true), label: "Items" },
        ]}
        active={itemsView ? "items" : "issues"}
      />

      <ListToolbar
        action="/inventory/issues"
        values={{ q, from, to, project, store, plot }}
        keep={{ view: itemsView ? "items" : undefined }}
        search={{ placeholder: "Issue number…" }}
        dates={{ label: "Issued" }}
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
          {
            param: "plot",
            label: "Villa",
            allLabel: "All villas",
            options: filterOptions.plots.map((row) => ({ value: row.id, label: row.name })),
          },
        ]}
      />

      {issues.length === 0 ? (
        <EmptyState
          icon={PackageMinus}
          title={filtered ? "No issues match these filters" : "Nothing has been issued yet"}
          description={
            filtered
              ? undefined
              : "Record material leaving a store and its stock drops straight away."
          }
          action={
            filtered ? undefined : <LinkButton href="/inventory/issues/new">New issue</LinkButton>
          }
        />
      ) : (
        <>
          {itemsView ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Item</TableHeaderCell>
                  <TableHeaderCell className="text-right">Quantity</TableHeaderCell>
                  <TableHeaderCell>Issue</TableHeaderCell>
                  <TableHeaderCell>To</TableHeaderCell>
                  <TableHeaderCell>Work</TableHeaderCell>
                  <TableHeaderCell>Date</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((line) => {
                  const issue = issueById.get(line.issue_id);
                  return (
                    <TableRow key={line.id}>
                      <TableCell>
                        <span className="text-foreground font-medium">{line.item_name}</span>
                        {line.item_code && (
                          <div className="text-muted text-xs">{line.item_code}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {`${formatQuantity(line.quantity)} ${line.uom}`}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/inventory/issues/${line.issue_id}`}
                          className="text-accent text-sm font-medium hover:underline"
                        >
                          {issue?.reference ?? "Open"}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted">{issue?.destination ?? "—"}</TableCell>
                      <TableCell className="text-muted">{issue?.work_name ?? "—"}</TableCell>
                      <TableCell className="text-muted">
                        {issue ? formatDate(issue.issued_at) : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Reference</TableHeaderCell>
                  <TableHeaderCell>Out of</TableHeaderCell>
                  <TableHeaderCell>To</TableHeaderCell>
                  <TableHeaderCell>Work</TableHeaderCell>
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
                    <TableCell className="text-muted">{issue.work_name ?? "—"}</TableCell>
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
          )}

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

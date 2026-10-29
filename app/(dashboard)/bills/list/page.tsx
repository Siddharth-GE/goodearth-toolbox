import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { Pagination } from "@/components/ui/pagination";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { NavTabs } from "@/components/ui/tabs";
import { getBillFilterOptions, listBills } from "@/lib/bills/queries";
import type { BillStatus } from "@/lib/bills/workflow";
import { dateParam, idParam, searchParam } from "@/lib/list-params";
import { Receipt } from "lucide-react";
import { BillsTable } from "./_components/bills-table";

// "Unpaid" is a derived view (recorded + approved), not a fourth status; it rides the same query param.
const TABS: { key: string; label: string; param?: string; status?: BillStatus; unpaid?: true }[] = [
  { key: "all", label: "All" },
  { key: "recorded", label: "Recorded", param: "recorded", status: "recorded" },
  { key: "approved", label: "Approved", param: "approved", status: "approved" },
  { key: "unpaid", label: "Unpaid", param: "unpaid", unpaid: true },
  { key: "paid", label: "Paid", param: "paid", status: "paid" },
];

export default async function BillsPage({
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
    sheet?: string;
  }>;
}) {
  const raw = await searchParams;
  const statusParam = raw.status;
  const page = raw.page;
  const vendor = idParam(raw.vendor);
  const project = idParam(raw.project);
  const q = searchParam(raw.q);
  const from = dateParam(raw.from);
  const to = dateParam(raw.to);
  const sheet = raw.sheet === "on" || raw.sheet === "none" ? raw.sheet : undefined;
  const tab = TABS.find((t) => t.param === statusParam) ?? TABS[0];

  const [result, filterOptions] = await Promise.all([
    listBills({
      page: Number(page) || 1,
      status: tab.status,
      unpaid: tab.unpaid,
      vendorId: vendor,
      projectId: project,
      q,
      from,
      to,
      sheet,
    }),
    getBillFilterOptions(),
  ]);
  const { bills, total, page: currentPage, pageCount, pageSize, sums } = result;

  const hrefWith = (params: URLSearchParams) => {
    if (vendor) params.set("vendor", vendor);
    if (project) params.set("project", project);
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (sheet) params.set("sheet", sheet);
    const query = params.toString();
    return query ? `/bills/list?${query}` : "/bills/list";
  };

  const hrefForPage = (target: number) => {
    const params = new URLSearchParams();
    if (tab.param) params.set("status", tab.param);
    if (target > 1) params.set("page", String(target));
    return hrefWith(params);
  };

  const hrefForTab = (param?: string) => {
    const params = new URLSearchParams();
    if (param) params.set("status", param);
    return hrefWith(params);
  };

  const filtered = Boolean(vendor || project || q || from || to || sheet);

  return (
    <div className="space-y-4">
      <PageTitle
        title="All bills"
        description="Vendor invoices recorded against POs and work orders — what we owe and what we've paid."
        backHref="/bills"
        actions={
          <>
            <LinkButton href="/bills/labour" variant="secondary">
              Labour to bill
            </LinkButton>
            <LinkButton href="/bills/work-orders" variant="secondary">
              Work orders
            </LinkButton>
            <LinkButton href="/bills/sheets" variant="secondary">
              Consolidated
            </LinkButton>
            <LinkButton href="/bills/new">Record bill</LinkButton>
          </>
        }
      />

      <NavTabs
        tabs={TABS.map((t) => ({
          key: t.key,
          href: hrefForTab(t.param),
          label: t.label,
        }))}
        active={tab.key}
      />

      <ListToolbar
        action="/bills/list"
        values={{ q, from, to, vendor, project, sheet }}
        keep={{ status: tab.param }}
        search={{ placeholder: "Bill no., invoice no. or vendor…" }}
        dates={{ label: "Invoice date" }}
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
          {
            param: "sheet",
            label: "Sheet",
            allLabel: "Consolidated or not",
            options: [
              { value: "none", label: "Not consolidated" },
              { value: "on", label: "On a sheet" },
            ],
          },
        ]}
      />

      {bills.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={
            tab.param || filtered
              ? `No ${tab.param ? `${tab.label.toLowerCase()} ` : ""}bills${filtered ? " match these filters" : ""}`
              : "No bills yet"
          }
          description={
            tab.param || filtered
              ? undefined
              : "Record the first vendor invoice against a purchase order or a work order."
          }
          action={
            tab.param || filtered ? undefined : (
              <LinkButton href="/bills/new">Record bill</LinkButton>
            )
          }
        />
      ) : (
        <>
          <BillsTable bills={bills} total={total} sums={sums} />

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

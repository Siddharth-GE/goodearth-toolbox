import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageTitle } from "@/components/ui/page-title";
import { Pagination } from "@/components/ui/pagination";
import { ListToolbar } from "@/components/ui/list-toolbar";
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
import { NavTabs } from "@/components/ui/tabs";
import { getBillFilterOptions, listBills } from "@/lib/bills/queries";
import type { BillStatus } from "@/lib/bills/workflow";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import { dateParam, idParam, searchParam } from "@/lib/list-params";
import { Receipt } from "lucide-react";
import Link from "next/link";
import { BillStatusBadge } from "../_components/status-badge";

// "Unpaid" is a derived view (everything not yet paid — recorded and
// approved together), not a fourth status; it rides the same query
// param with its own value.
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

  const filtered = Boolean(vendor || project || q || from || to);

  return (
    <div className="space-y-4">
      <PageTitle
        title="All bills"
        description="Vendor invoices recorded against POs and labour contracts — what we owe and what we've paid."
        backHref="/bills"
        actions={
          <>
            <LinkButton href="/bills/contracts" variant="secondary">
              Labour contracts
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
        values={{ q, from, to, vendor, project }}
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
              : "Record the first vendor invoice against a purchase order or a labour contract."
          }
          action={
            tab.param || filtered ? undefined : (
              <LinkButton href="/bills/new">Record bill</LinkButton>
            )
          }
        />
      ) : (
        <>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Reference</TableHeaderCell>
                <TableHeaderCell>Vendor</TableHeaderCell>
                <TableHeaderCell>Project</TableHeaderCell>
                <TableHeaderCell>Invoice no.</TableHeaderCell>
                <TableHeaderCell>Invoice date</TableHeaderCell>
                <TableHeaderCell className="text-right">Total</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bills.map((bill) => (
                <TableRow key={bill.id}>
                  <TableCell className="text-foreground font-medium">
                    {bill.reference}
                    {bill.kind === "nmr" && (
                      <span className="text-muted ml-1.5 text-[10px] font-semibold tracking-wider uppercase">
                        NMR
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{bill.vendor_name ?? "Direct"}</TableCell>
                  <TableCell>{bill.project_name}</TableCell>
                  <TableCell className="font-mono text-xs">{bill.invoice_no}</TableCell>
                  <TableCell className="text-muted">{formatDate(bill.invoice_date)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {formatMoney(bill.total_amount)}
                  </TableCell>
                  <TableCell>
                    <BillStatusBadge status={bill.status} />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/bills/${bill.id}`}
                      className="text-accent text-sm font-medium hover:underline"
                    >
                      Open
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            {/* Over every bill these filters match, not just this page. */}
            <TableFoot>
              <tr>
                <TableTotalCell colSpan={5}>
                  {formatCount(total)} {total === 1 ? "bill" : "bills"}
                  <span className="text-muted ml-2 text-xs font-normal">
                    Taxable {formatMoney(sums.taxable)} · GST {formatMoney(sums.gst)}
                  </span>
                </TableTotalCell>
                <TableTotalCell className="text-right font-mono text-xs">
                  {formatMoney(sums.total)}
                </TableTotalCell>
                <TableTotalCell colSpan={2} />
              </tr>
            </TableFoot>
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

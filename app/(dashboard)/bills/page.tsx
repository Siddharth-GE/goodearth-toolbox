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
import { getBillFilterOptions, listBills } from "@/lib/bills/queries";
import type { BillStatus } from "@/lib/bills/workflow";
import { formatDate, formatMoney } from "@/lib/format";
import { Receipt } from "lucide-react";
import Link from "next/link";
import { BillFilters } from "./_components/bill-filters";
import { BillStatusBadge } from "./_components/status-badge";

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
  searchParams: Promise<{ status?: string; page?: string; vendor?: string; project?: string }>;
}) {
  const { status: statusParam, page, vendor, project } = await searchParams;
  const tab = TABS.find((t) => t.param === statusParam) ?? TABS[0];

  const [result, filterOptions] = await Promise.all([
    listBills({
      page: Number(page) || 1,
      status: tab.status,
      unpaid: tab.unpaid,
      vendorId: vendor || undefined,
      projectId: project || undefined,
    }),
    getBillFilterOptions(),
  ]);
  const { bills, total, page: currentPage, pageCount, pageSize } = result;

  const hrefWith = (params: URLSearchParams) => {
    if (vendor) params.set("vendor", vendor);
    if (project) params.set("project", project);
    const query = params.toString();
    return query ? `/bills?${query}` : "/bills";
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

  const filtered = Boolean(vendor || project);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Bills"
        description="Vendor invoices recorded against POs and labour contracts — what we owe and what we've paid."
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

      <BillFilters
        vendors={filterOptions.vendors}
        projects={filterOptions.projects}
        selectedVendor={vendor ?? ""}
        selectedProject={project ?? ""}
        status={tab.param ?? ""}
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

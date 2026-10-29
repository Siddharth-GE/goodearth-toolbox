import { LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PageTitle } from "@/components/ui/page-title";
import { NavTabs } from "@/components/ui/tabs";
import { getBillFilterOptions } from "@/lib/bills/queries";
import { listSheets } from "@/lib/bills/sheet-queries";
import type { SheetState } from "@/lib/bills/sheets";
import { idParam, searchParam } from "@/lib/list-params";
import { Layers } from "lucide-react";
import { SheetsTable } from "./_components/sheets-table";

const TABS: { key: string; label: string; state?: SheetState }[] = [
  { key: "all", label: "All" },
  { key: "waiting", label: "Waiting for approval", state: "waiting" },
  { key: "approved", label: "Approved", state: "approved" },
  { key: "paid", label: "Paid", state: "paid" },
  { key: "undone", label: "Undone", state: "undone" },
];

export default async function SheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; vendor?: string; q?: string }>;
}) {
  const raw = await searchParams;
  const tab = TABS.find((candidate) => candidate.state === raw.state) ?? TABS[0];
  const vendor = idParam(raw.vendor);
  const q = searchParam(raw.q);

  const [sheets, options] = await Promise.all([
    listSheets({ state: tab.state, vendorId: vendor, q }),
    getBillFilterOptions(),
  ]);

  const hrefForTab = (state?: string) => {
    const params = new URLSearchParams();
    if (state) params.set("state", state);
    if (vendor) params.set("vendor", vendor);
    if (q) params.set("q", q);
    const query = params.toString();
    return query ? `/bills/sheets?${query}` : "/bills/sheets";
  };

  return (
    <div className="space-y-4">
      <PageTitle
        title="Consolidated"
        backHref="/bills"
        description="A contractor's bills in one company, all PW or all NMR, on one sheet numbered like THIN-PW-EF-C01. The sheet is approved, put on the cash request and paid; its bills stay as they are."
        actions={
          <LinkButton href="/bills/list?sheet=none" variant="secondary">
            Bills not consolidated
          </LinkButton>
        }
      />

      <NavTabs
        tabs={TABS.map((candidate) => ({
          key: candidate.key,
          href: hrefForTab(candidate.state),
          label: candidate.label,
        }))}
        active={tab.key}
      />

      <ListToolbar
        action="/bills/sheets"
        values={{ q, vendor }}
        keep={{ state: tab.state }}
        search={{ placeholder: "Sheet number…" }}
        filters={[
          {
            param: "vendor",
            label: "Contractor",
            allLabel: "All contractors",
            options: options.vendors.map((row) => ({ value: row.id, label: row.name })),
          },
        ]}
      />

      {sheets.length === 0 ? (
        <EmptyState
          icon={Layers}
          title={tab.state || vendor || q ? "No sheets match" : "No sheets yet"}
          description={
            tab.state || vendor || q
              ? undefined
              : "In All bills, tick a contractor's labour bills and press Consolidate."
          }
          action={
            tab.state || vendor || q ? undefined : (
              <LinkButton href="/bills/list?sheet=none">Bills not consolidated</LinkButton>
            )
          }
        />
      ) : (
        <SheetsTable sheets={sheets} />
      )}
    </div>
  );
}

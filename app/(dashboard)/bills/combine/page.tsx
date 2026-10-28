import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PageTitle } from "@/components/ui/page-title";
import { getCurrentBillActor, listCombinableBills } from "@/lib/bills/queries";
import { idParam } from "@/lib/list-params";
import { listCompanies } from "@/lib/masters/companies";
import { listVendors } from "@/lib/masters/vendors";
import { Combine } from "lucide-react";
import { CombineBills } from "./_components/combine-bills";

export default async function CombineBillsPage({
  searchParams,
}: {
  searchParams: Promise<{ vendor?: string; company?: string; kind?: string }>;
}) {
  const raw = await searchParams;
  const vendor = idParam(raw.vendor);
  const company = idParam(raw.company);
  const kind = raw.kind === "PW" || raw.kind === "NMR" ? raw.kind : undefined;

  const [actor, vendors, companies, bills] = await Promise.all([
    getCurrentBillActor(),
    listVendors(),
    listCompanies(),
    vendor && company && kind ? listCombinableBills(vendor, company, kind) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Combine bills"
        backHref="/bills/list"
        backLabel="All bills"
        description="One contractor's bills in one company, all NMR or all PW, become one bill. The oldest keeps its number and takes every line, each on its own villa; the others go, and their numbers stay used."
      />

      <ListToolbar
        action="/bills/combine"
        values={{ vendor, company, kind }}
        filters={[
          {
            param: "vendor",
            label: "Contractor",
            allLabel: "Choose a contractor",
            options: vendors
              .filter((row) => row.is_contractor)
              .map((row) => ({ value: row.id, label: row.name })),
          },
          {
            param: "company",
            label: "Company",
            allLabel: "Choose a company",
            options: companies.map((row) => ({
              value: row.id,
              label: row.code ? `${row.name} (${row.code})` : row.name,
            })),
          },
          {
            param: "kind",
            label: "Kind",
            allLabel: "NMR or PW",
            options: [
              { value: "NMR", label: "NMR — daily wages" },
              { value: "PW", label: "PW — piece-work" },
            ],
          },
        ]}
      />

      {!actor.isApprover ? (
        <EmptyState
          icon={Combine}
          title="Combining is a bill approver's"
          description="A named bill approver or an admin combines bills, as they send bills back."
        />
      ) : bills === null ? (
        <EmptyState
          icon={Combine}
          title="Choose a contractor, a company and NMR or PW"
          description="Their recorded and approved bills appear here to tick."
        />
      ) : bills.length === 0 ? (
        <EmptyState
          icon={Combine}
          title="No bills to combine"
          description="This contractor has no recorded or approved bills of that kind in this company."
        />
      ) : (
        <CombineBills bills={bills} />
      )}
    </div>
  );
}

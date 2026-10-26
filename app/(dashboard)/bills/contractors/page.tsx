import { EmptyState } from "@/components/ui/empty-state";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PageTitle } from "@/components/ui/page-title";
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
import { listContractorPositions } from "@/lib/bills/payment-queries";
import { formatMoney } from "@/lib/format";
import { idParam, searchParam } from "@/lib/list-params";
import { listCompanies } from "@/lib/masters/companies";
import { listProjects } from "@/lib/masters/projects";
import { Users } from "lucide-react";
import Link from "next/link";

const WHO = { contractors: "Contractors", suppliers: "Suppliers", everyone: "Everyone" } as const;

/** Each contractor's position across the company, a company or a project; each name opens its ledger. */
export default async function ContractorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const raw = await searchParams;
  const project = idParam(raw.project);
  const company = idParam(raw.company);
  const q = searchParam(raw.q);
  const who: keyof typeof WHO =
    raw.who && Object.hasOwn(WHO, raw.who) ? (raw.who as keyof typeof WHO) : "contractors";

  const [projects, companies] = await Promise.all([listProjects(), listCompanies()]);
  const projectIds = project
    ? [project]
    : company
      ? projects.filter((row) => row.company_id === company).map((row) => row.id)
      : undefined;
  const all = await listContractorPositions(projectIds);
  const words = (q ?? "").toLowerCase().split(" ").filter(Boolean);
  const rows = all.filter(
    (row) =>
      (who === "everyone" || row.is_contractor === (who === "contractors")) &&
      words.every((word) =>
        `${row.vendor_name} ${row.contractor_no ?? ""}`.toLowerCase().includes(word),
      ),
  );
  const sum = (pick: (row: (typeof rows)[number]) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);
  const scope = new URLSearchParams();
  if (project) scope.set("project", project);
  else if (company) scope.set("company", company);
  const ledgerHref = (vendorId: string) =>
    `/bills/contractors/${vendorId}${scope.size ? `?${scope}` : ""}`;

  return (
    <div className="space-y-4">
      <PageTitle
        title="Contractors"
        backHref="/bills"
        backLabel="Bills"
        description="Approved bills — billed, paid and pending — and advances given, recovered and still out. Open a name for its ledger: every bill, payment and advance in order."
      />

      <ListToolbar
        action="/bills/contractors"
        values={{ q, who: who === "contractors" ? undefined : who, company, project }}
        search={{ placeholder: "Name or CON no." }}
        filters={[
          {
            param: "who",
            label: "Who",
            allLabel: WHO.contractors,
            options: [
              { value: "suppliers", label: WHO.suppliers },
              { value: "everyone", label: WHO.everyone },
            ],
          },
          {
            param: "company",
            label: "Company",
            allLabel: "All companies",
            options: companies.map((row) => ({ value: row.id, label: row.name })),
          },
          {
            param: "project",
            label: "Project",
            allLabel: "All projects",
            options: projects
              .filter((row) => !company || row.company_id === company)
              .map((row) => ({ value: row.id, label: row.name })),
          },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={all.length === 0 ? "No approved bills or advances yet" : "Nothing matches"}
          description={
            all.length === 0
              ? "A contractor appears here once one of their bills is approved or they are given an advance."
              : "Try another search, company or project."
          }
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Name</TableHeaderCell>
              <TableHeaderCell className="text-right">Billed</TableHeaderCell>
              <TableHeaderCell className="text-right">Paid</TableHeaderCell>
              <TableHeaderCell className="text-right">Pending</TableHeaderCell>
              <TableHeaderCell className="text-right">Advances given</TableHeaderCell>
              <TableHeaderCell className="text-right">Recovered</TableHeaderCell>
              <TableHeaderCell className="text-right">Still out</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.vendor_id}>
                <TableCell className="text-foreground font-medium">
                  <Link href={ledgerHref(row.vendor_id)} className="hover:underline">
                    {row.vendor_name}
                  </Link>
                  {row.contractor_no && (
                    <span className="text-muted block text-xs">{row.contractor_no}</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMoney(row.position.billed)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMoney(row.position.paid + row.position.recoveredOnBills)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMoney(row.position.pending)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMoney(row.position.advancesGiven)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMoney(row.position.advancesRecovered)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatMoney(row.position.advancesOutstanding)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFoot>
            <TableRow>
              <TableTotalCell>{WHO[who]}</TableTotalCell>
              <TableTotalCell className="text-right font-mono">
                {formatMoney(sum((row) => row.position.billed))}
              </TableTotalCell>
              <TableTotalCell className="text-right font-mono">
                {formatMoney(sum((row) => row.position.paid + row.position.recoveredOnBills))}
              </TableTotalCell>
              <TableTotalCell className="text-right font-mono">
                {formatMoney(sum((row) => row.position.pending))}
              </TableTotalCell>
              <TableTotalCell className="text-right font-mono">
                {formatMoney(sum((row) => row.position.advancesGiven))}
              </TableTotalCell>
              <TableTotalCell className="text-right font-mono">
                {formatMoney(sum((row) => row.position.advancesRecovered))}
              </TableTotalCell>
              <TableTotalCell className="text-right font-mono">
                {formatMoney(sum((row) => row.position.advancesOutstanding))}
              </TableTotalCell>
            </TableRow>
          </TableFoot>
        </Table>
      )}
      <p className="text-muted text-xs">
        Paid includes what advances settled. Pending is what approved bills still have to settle.
      </p>
    </div>
  );
}

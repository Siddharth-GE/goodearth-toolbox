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
import { idParam } from "@/lib/list-params";
import { listProjects } from "@/lib/masters/projects";
import { Users } from "lucide-react";
import Link from "next/link";

/**
 * Where each contractor (and vendor) stands (0107, plan.md B8): what was
 * billed and approved, paid, recovered from advances and still pending;
 * and the advance summary — given, recovered, still out.
 */
export default async function ContractorsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const project = idParam((await searchParams).project);
  const [rows, projects] = await Promise.all([listContractorPositions(project), listProjects()]);
  const sum = (pick: (row: (typeof rows)[number]) => number) =>
    rows.reduce((total, row) => total + pick(row), 0);

  return (
    <div className="space-y-4">
      <PageTitle
        title="Contractors and vendors"
        backHref="/bills"
        backLabel="Bills"
        description="Approved bills — billed, paid and pending — and advances given, recovered and still out, for everyone Goodearth pays."
      />

      <ListToolbar
        action="/bills/contractors"
        values={{ project }}
        filters={[
          {
            param: "project",
            label: "Project",
            allLabel: "All projects",
            options: projects.map((row) => ({ value: row.id, label: row.name })),
          },
        ]}
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No approved bills or advances yet"
          description="A contractor appears here once one of their bills is approved or they are given an advance."
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
                  <Link
                    href={`/bills/payments?vendor=${row.vendor_id}`}
                    className="hover:underline"
                  >
                    {row.vendor_name}
                  </Link>
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
              <TableTotalCell>Everyone</TableTotalCell>
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

import { EmptyState } from "@/components/ui/empty-state";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { PageTitle } from "@/components/ui/page-title";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { MONEY_KIND_LABEL } from "@/lib/bills/ledger";
import { getContractorLedger } from "@/lib/bills/payment-queries";
import { formatCount, formatDate, formatMoney } from "@/lib/format";
import { idParam } from "@/lib/list-params";
import { listCompanies } from "@/lib/masters/companies";
import { listProjects } from "@/lib/masters/projects";
import { BookOpen } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

/** One contractor's account: every approved bill (with their own bill count), payment, advance and recovery, oldest
 * first, and what Goodearth owes them after each. Below zero is advance they still hold. */
export default async function ContractorLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ vendorId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { vendorId } = await params;
  const raw = await searchParams;
  const project = idParam(raw.project);
  const company = idParam(raw.company);

  const [projects, companies] = await Promise.all([listProjects(), listCompanies()]);
  const projectIds = project
    ? [project]
    : company
      ? projects.filter((row) => row.company_id === company).map((row) => row.id)
      : undefined;
  const ledger = await getContractorLedger(vendorId, projectIds);
  if (!ledger) notFound();

  const { vendor, rows, waiting } = ledger;
  const balance = rows.at(-1)?.balance ?? 0;
  const billCount = rows.filter((row) => row.kind === "bill").length;

  return (
    <div className="space-y-4">
      <PageTitle
        title={vendor.name}
        backHref="/bills/contractors"
        backLabel="Contractors"
        description={[
          vendor.contractor_no,
          "every approved bill, payment and advance, oldest first",
        ]
          .filter(Boolean)
          .join(" · ")}
      />

      <ListToolbar
        action={`/bills/contractors/${vendorId}`}
        values={{ company, project }}
        filters={[
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

      <FigureBand className="sm:grid-cols-3 lg:grid-cols-3">
        <FigureBandCell>
          <Figure
            label={balance < 0 ? "Advance they hold" : "Goodearth owes them"}
            value={formatMoney(Math.abs(balance))}
            hint="after every bill, payment and advance below"
            size="lg"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure label="Approved bills" value={formatCount(billCount)} size="lg" />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Waiting for approval"
            value={formatMoney(waiting.total)}
            hint={`${formatCount(waiting.count)} ${waiting.count === 1 ? "bill" : "bills"}, not counted yet`}
            size="lg"
          />
        </FigureBandCell>
      </FigureBand>

      {rows.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Nothing on the account yet"
          description="An approved bill, a payment or an advance starts it."
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Date</TableHeaderCell>
              <TableHeaderCell>What</TableHeaderCell>
              <TableHeaderCell>Project</TableHeaderCell>
              <TableHeaderCell className="text-right">Billed</TableHeaderCell>
              <TableHeaderCell className="text-right">Paid out</TableHeaderCell>
              <TableHeaderCell className="text-right">Owed after</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.kind}:${row.id}`}>
                <TableCell className="text-sm whitespace-nowrap">{formatDate(row.on)}</TableCell>
                <TableCell className="text-sm">
                  <span className="text-foreground font-medium">
                    {row.kind === "bill"
                      ? "Bill"
                      : row.reversal
                        ? MONEY_KIND_LABEL[row.kind].reversal
                        : MONEY_KIND_LABEL[row.kind].entry}
                  </span>{" "}
                  {row.bill_id ? (
                    <Link href={`/bills/${row.bill_id}`} className="text-muted hover:underline">
                      {row.label}
                    </Link>
                  ) : (
                    <span className="text-muted">{row.label}</span>
                  )}
                  {row.kind === "recovery" && (
                    <span className="text-muted block text-xs">
                      {formatMoney(row.amount)} of an advance, so the balance does not move
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted text-sm">{row.project_name}</TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {row.kind === "bill" ? formatMoney(row.amount) : ""}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {row.kind === "payment" || row.kind === "advance" ? formatMoney(row.amount) : ""}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatMoney(row.balance)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

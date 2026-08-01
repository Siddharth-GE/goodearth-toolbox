import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { listInbox } from "@/lib/budgets/queries";
import { PiggyBank } from "lucide-react";
import Link from "next/link";
import { StartPricingButton } from "./_components/start-pricing-button";

export default async function BudgetsPage() {
  const rows = await listInbox();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">Budgets</h1>
          <p className="text-sm text-muted">
            Every design revision handed over for pricing. Costs and margins here are visible only
            to this team.
          </p>
        </div>
        <Link href="/budgets/margins" className="text-sm font-medium text-accent hover:underline">
          Product margins
        </Link>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title="Nothing to price yet"
          description="A revision appears here the moment the design team issues it."
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Project</TableHeaderCell>
              <TableHeaderCell>Unit</TableHeaderCell>
              <TableHeaderCell>Revision</TableHeaderCell>
              <TableHeaderCell>Issued</TableHeaderCell>
              <TableHeaderCell>Progress</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.selection_id}>
                <TableCell>{row.project_name}</TableCell>
                <TableCell className="font-medium text-foreground">{row.unit_name}</TableCell>
                <TableCell>R{row.revision_no}</TableCell>
                <TableCell className="text-muted">
                  {row.issued_at ? new Date(row.issued_at).toLocaleDateString("en-IN") : "—"}
                </TableCell>
                <TableCell>
                  {row.budget_status === "approved" ? (
                    <Badge variant="success">Approved</Badge>
                  ) : row.budget_status === "pricing" ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="warning">Pricing</Badge>
                      {/* The number that says whether this is nearly done or
                          barely started, without having to open it. */}
                      <span className="text-xs text-muted">
                        {row.priced_count} of {row.line_count} priced
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted">
                      {row.line_count} {row.line_count === 1 ? "line" : "lines"} waiting
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {row.budget_id ? (
                    <Link
                      href={`/budgets/${row.budget_id}`}
                      className="text-sm font-medium text-accent hover:underline"
                    >
                      {row.budget_status === "approved" ? "View" : "Continue"}
                    </Link>
                  ) : (
                    <StartPricingButton selectionId={row.selection_id} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

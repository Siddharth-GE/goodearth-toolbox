import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { FACILITY_KIND_LABELS } from "@/lib/financial-management/kinds";
import { listFacilities } from "@/lib/financial-management/queries";
import { formatCrore, formatMoney, formatPercent } from "@/lib/format";
import { Landmark } from "lucide-react";
import Link from "next/link";
import { FacilityFormDialog } from "../_components/facility-form-dialog";

export default async function FundingPage() {
  const facilities = await listFacilities();

  const totals = facilities.reduce(
    (acc, facility) => ({
      drawn: acc.drawn + facility.position.drawn,
      outstanding: acc.outstanding + facility.position.outstanding,
      interestPaid: acc.interestPaid + facility.position.interestPaid,
      // Undrawn headroom only exists where a cap was agreed.
      headroom:
        acc.headroom +
        (facility.sanctionedAmount !== null && facility.isActive
          ? Math.max(0, facility.sanctionedAmount - facility.position.drawn)
          : 0),
    }),
    { drawn: 0, outstanding: 0, interestPaid: 0, headroom: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <FacilityFormDialog />
      </div>

      {facilities.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No funding sources yet"
          description="Set up each bank loan, private equity investment or private lender once — then record drawdowns, repayments and interest against it."
          action={<FacilityFormDialog />}
        />
      ) : (
        <>
          <FigureBand>
            <FigureBandCell>
              <Figure
                label="Outstanding"
                value={formatCrore(totals.outstanding)}
                size="hero"
                hint="Drawn minus repaid, across every facility"
              />
            </FigureBandCell>
            <FigureBandCell>
              <Figure label="Drawn to date" value={formatCrore(totals.drawn)} size="lg" />
            </FigureBandCell>
            <FigureBandCell>
              <Figure label="Interest paid" value={formatCrore(totals.interestPaid)} size="lg" />
            </FigureBandCell>
            <FigureBandCell>
              <Figure
                label="Undrawn headroom"
                value={formatCrore(totals.headroom)}
                size="lg"
                hint="Sanctioned but not yet drawn, active facilities"
              />
            </FigureBandCell>
          </FigureBand>

          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Facility</TableHeaderCell>
                <TableHeaderCell>Kind</TableHeaderCell>
                <TableHeaderCell className="text-right">Rate</TableHeaderCell>
                <TableHeaderCell className="text-right">Drawn</TableHeaderCell>
                <TableHeaderCell className="text-right">Outstanding</TableHeaderCell>
                <TableHeaderCell className="text-right">Interest paid</TableHeaderCell>
                <TableHeaderCell className="text-right">Interest built up</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {facilities.map((facility) => (
                <TableRow key={facility.id}>
                  <TableCell>
                    <Link
                      href={`/financial-management/funding/${facility.id}`}
                      className="text-foreground hover:text-accent font-medium"
                    >
                      {facility.party}
                    </Link>
                    {!facility.isActive && (
                      <div className="mt-0.5">
                        <Badge variant="neutral">Closed</Badge>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted">
                    {FACILITY_KIND_LABELS[facility.kind]}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {facility.interestRatePct === null
                      ? "—"
                      : formatPercent(facility.interestRatePct)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoney(facility.position.drawn)}
                  </TableCell>
                  <TableCell className="text-foreground text-right font-mono font-medium">
                    {formatMoney(facility.position.outstanding)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatMoney(facility.position.interestPaid)}
                  </TableCell>
                  {/* Computed monthly from the rate — informational, the
                      ledger of real payments is the truth. */}
                  <TableCell className="text-muted text-right font-mono">
                    {facility.position.accrued === null
                      ? "—"
                      : formatMoney(facility.position.accrued)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-muted text-xs">
            “Interest built up” is worked out monthly from each facility’s rate and is a guide, not
            a statement — the recorded payments are the record. Facilities without a rate show a
            dash.
          </p>
        </>
      )}
    </div>
  );
}

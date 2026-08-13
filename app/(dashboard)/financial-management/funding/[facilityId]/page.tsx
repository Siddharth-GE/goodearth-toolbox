import { Badge } from "@/components/ui/badge";
import { ChartMeter } from "@/components/ui/chart/meter";
import { EmptyState } from "@/components/ui/empty-state";
import { Figure, FigureBand, FigureBandCell, ResultPanel } from "@/components/ui/figure";
import { PageTitle } from "@/components/ui/page-title";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { Attribution } from "@/components/ui/attribution";
import { FACILITY_KIND_LABELS, MOVEMENT_KIND_LABELS } from "@/lib/financial-management/kinds";
import { getFacility } from "@/lib/financial-management/queries";
import { formatCrore, formatDate, formatMoney, formatPercent } from "@/lib/format";
import { NotebookPen } from "lucide-react";
import { notFound } from "next/navigation";
import { FacilityFormDialog } from "../../_components/facility-form-dialog";
import { FacilityMenu } from "../../_components/facility-menu";
import { MovementFormDialog } from "../../_components/movement-form-dialog";
import { MovementRowMenu } from "../../_components/movement-row-menu";

const KIND_BADGE = {
  drawdown: "success",
  repayment: "neutral",
  interest: "info",
} as const;

export default async function FacilityPage({
  params,
}: {
  params: Promise<{ facilityId: string }>;
}) {
  const { facilityId } = await params;
  const facility = await getFacility(facilityId);
  if (!facility) notFound();

  const { position } = facility;
  const drawnPct =
    facility.sanctionedAmount === null || facility.sanctionedAmount === 0
      ? null
      : (position.drawn / facility.sanctionedAmount) * 100;

  return (
    <div className="space-y-4">
      <PageTitle
        title={facility.party}
        backHref="/financial-management/funding"
        backLabel="Funding"
        description={
          <>
            {FACILITY_KIND_LABELS[facility.kind]}
            {facility.interestRatePct !== null &&
              ` · ${formatPercent(facility.interestRatePct)} a year`}
            {facility.startDate && ` · since ${formatDate(facility.startDate)}`}
            {!facility.isActive && (
              <>
                {" "}
                <Badge variant="neutral">Closed</Badge>
              </>
            )}
          </>
        }
        actions={
          <>
            <FacilityFormDialog
              facility={{
                id: facility.id,
                party: facility.party,
                kind: facility.kind,
                interestRatePct: facility.interestRatePct,
                startDate: facility.startDate,
                sanctionedAmount: facility.sanctionedAmount,
                terms: facility.terms,
              }}
            />
            <MovementFormDialog facilityId={facility.id} />
            <FacilityMenu
              facilityId={facility.id}
              party={facility.party}
              isActive={facility.isActive}
            />
          </>
        }
      />

      <FigureBand>
        <FigureBandCell>
          <Figure
            label="Outstanding"
            value={formatCrore(position.outstanding)}
            size="hero"
            tone={position.outstanding < 0 ? "warn" : undefined}
            hint={
              position.outstanding < 0
                ? "More repaid than drawn — check the entries"
                : "Drawn minus repaid"
            }
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure label="Drawn to date" value={formatCrore(position.drawn)} size="lg" />
        </FigureBandCell>
        <FigureBandCell>
          <Figure label="Repaid" value={formatCrore(position.repaid)} size="lg" />
        </FigureBandCell>
        <FigureBandCell>
          <Figure label="Interest paid" value={formatCrore(position.interestPaid)} size="lg" />
        </FigureBandCell>
      </FigureBand>

      <div className="grid gap-4 lg:grid-cols-2">
        <ResultPanel title="Interest, computed vs paid" raised>
          <div className="grid grid-cols-3 gap-3">
            <Figure
              label="Built up"
              value={position.accrued === null ? "—" : formatMoney(position.accrued)}
            />
            <Figure label="Paid" value={formatMoney(position.interestPaid)} />
            <Figure
              label="Difference"
              value={position.accruedGap === null ? "—" : formatMoney(position.accruedGap)}
              tone={
                position.accruedGap === null || Math.abs(position.accruedGap) < 1
                  ? undefined
                  : position.accruedGap > 0
                    ? "warn"
                    : "good"
              }
            />
          </div>
          <p className="text-muted mt-3 text-xs">
            {facility.interestRatePct === null
              ? "No rate is set, so nothing is computed — the recorded payments are the whole story."
              : "Worked out monthly: the balance at each month’s end × rate ÷ 12, from the first drawdown. A guide, not a statement — irregular deals just record what was actually paid."}
          </p>
        </ResultPanel>

        {facility.sanctionedAmount !== null ? (
          <ChartMeter
            model={{
              kind: "meter",
              valueLabel: "Drawn",
              limitLabel: "Sanctioned",
              value: position.drawn,
              limit: facility.sanctionedAmount,
              pct: drawnPct,
              barPct: drawnPct === null ? null : Math.min(100, drawnPct),
              money: true,
            }}
          />
        ) : (
          <ResultPanel title="Sanctioned amount" raised>
            <p className="text-muted text-sm">
              No cap recorded for this facility. Edit it to add one and this panel becomes a
              drawn-against-sanctioned meter.
            </p>
          </ResultPanel>
        )}
      </div>

      {facility.terms && (
        <ResultPanel title="Terms" raised>
          <p className="text-foreground text-sm whitespace-pre-wrap">{facility.terms}</p>
        </ResultPanel>
      )}

      {facility.movements.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="Nothing recorded yet"
          description="Record the first drawdown and the balances above come to life."
          action={<MovementFormDialog facilityId={facility.id} />}
        />
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>On</TableHeaderCell>
              <TableHeaderCell>What</TableHeaderCell>
              <TableHeaderCell className="text-right">Amount</TableHeaderCell>
              <TableHeaderCell>Reference</TableHeaderCell>
              <TableHeaderCell>Note</TableHeaderCell>
              <TableHeaderCell>Recorded by</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {facility.movements.map((movement) => (
              <TableRow key={movement.id}>
                <TableCell className="text-muted whitespace-nowrap">
                  {formatDate(movement.happenedOn)}
                </TableCell>
                <TableCell>
                  <Badge variant={KIND_BADGE[movement.kind]}>
                    {MOVEMENT_KIND_LABELS[movement.kind]}
                  </Badge>
                </TableCell>
                <TableCell className="text-foreground text-right font-mono font-medium">
                  {formatMoney(movement.amount)}
                </TableCell>
                <TableCell className="text-muted">{movement.reference ?? "—"}</TableCell>
                <TableCell className="text-muted max-w-48 truncate">
                  {movement.note ?? "—"}
                </TableCell>
                <TableCell>
                  <Attribution name={movement.recordedByName} label="Recorded by" />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <MovementRowMenu
                      movementId={movement.id}
                      facilityId={facility.id}
                      describedAs={`${MOVEMENT_KIND_LABELS[movement.kind]} of ${formatMoney(movement.amount)} on ${formatDate(movement.happenedOn)}`}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

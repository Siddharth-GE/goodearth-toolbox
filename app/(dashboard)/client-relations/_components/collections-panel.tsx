import { Figure, FigureBand, FigureBandCell } from "@/components/ui/figure";
import { Section } from "@/components/ui/section";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import type { EngagementDetail } from "@/lib/client-relations/queries";
import { RECEIPT_MODES, milestoneLabel, optionFor } from "@/lib/client-relations/stages";
import { formatDate, formatMoney } from "@/lib/format";

import { DeleteReceiptButton } from "./delete-receipt-button";
import { MilestoneRowEditor } from "./milestone-row";
import { ReceiptDialog } from "./receipt-dialog";

/**
 * The Collections & dues tab for one plot: the nine-rung schedule, what
 * has come in against it, and the arithmetic between the two.
 */
export function CollectionsPanel({ engagement }: { engagement: EngagementDetail }) {
  const { dues } = engagement;

  return (
    <div className="space-y-4">
      <FigureBand>
        <FigureBandCell>
          <Figure label="Scheduled" value={formatMoney(dues.scheduled)} size="sm" />
        </FigureBandCell>
        <FigureBandCell>
          <Figure label="Invoiced" value={formatMoney(dues.invoiced)} size="sm" />
        </FigureBandCell>
        <FigureBandCell>
          <Figure label="Received" value={formatMoney(dues.received)} tone="good" size="sm" />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Outstanding"
            value={formatMoney(dues.outstanding)}
            hint={dues.nextDueOn ? `Next ${formatDate(dues.nextDueOn)}` : "Nothing dated"}
            size="sm"
          />
        </FigureBandCell>
        <FigureBandCell>
          <Figure
            label="Overdue"
            value={formatMoney(dues.overdue)}
            tone={dues.overdue > 0 ? "bad" : undefined}
            size="sm"
          />
        </FigureBandCell>
      </FigureBand>

      {dues.overpaid > 0 && (
        <p className="text-warning text-sm">
          {formatMoney(dues.overpaid)} has come in beyond what the schedule adds up to — worth
          checking the amounts below.
        </p>
      )}

      <Section
        title="Payment schedule"
        note="All nine stages exist from the start. Fill in the ones that apply and leave the rest blank."
      >
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Stage</TableHeaderCell>
              <TableHeaderCell>Amount (₹)</TableHeaderCell>
              <TableHeaderCell>Due</TableHeaderCell>
              <TableHeaderCell>Invoiced</TableHeaderCell>
              <TableHeaderCell>Invoice no.</TableHeaderCell>
              <TableHeaderCell className="text-right">Received</TableHeaderCell>
              <TableHeaderCell className="text-right">Outstanding</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {engagement.milestones.map((milestone) => (
              <MilestoneRowEditor key={milestone.id} milestone={milestone} />
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="Payments received"
        aside={<ReceiptDialog engagementId={engagement.id} milestones={engagement.milestones} />}
      >
        {engagement.receipts.length === 0 ? (
          <p className="text-muted text-sm">Nothing recorded against this plot yet.</p>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Received</TableHeaderCell>
                <TableHeaderCell>Against</TableHeaderCell>
                <TableHeaderCell>How</TableHeaderCell>
                <TableHeaderCell>Reference</TableHeaderCell>
                <TableHeaderCell className="text-right">Amount</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {engagement.receipts.map((receipt) => (
                <TableRow key={receipt.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(receipt.receivedOn)}
                  </TableCell>
                  <TableCell>
                    {receipt.milestoneStage ? (
                      milestoneLabel(receipt.milestoneStage)
                    ) : (
                      <span className="text-muted">Not decided</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted">
                    {optionFor(RECEIPT_MODES, receipt.mode)?.label ?? receipt.mode}
                  </TableCell>
                  <TableCell className="text-muted">{receipt.reference ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono text-xs whitespace-nowrap">
                    {formatMoney(receipt.amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DeleteReceiptButton
                      receiptId={receipt.id}
                      amount={formatMoney(receipt.amount)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Section>
    </div>
  );
}

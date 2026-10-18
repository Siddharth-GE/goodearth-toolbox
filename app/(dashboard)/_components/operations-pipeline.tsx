import { Card } from "@/components/ui/card";
import { formatCount } from "@/lib/format";
import {
  countBillsPipeline,
  countIndentsPipeline,
  countPosPipeline,
  countReceiptsPipeline,
} from "@/lib/overview/queries";

async function readPipeline() {
  try {
    const [indents, pos, receipts, bills] = await Promise.all([
      countIndentsPipeline(),
      countPosPipeline(),
      countReceiptsPipeline(),
      countBillsPipeline(),
    ]);
    return { indents, pos, receipts, bills };
  } catch {
    return null;
  }
}

// A failed count says so in this card; the rest of the home page still loads.
export async function OperationsPipeline() {
  const pipeline = await readPipeline();
  if (!pipeline) {
    return (
      <Card className="p-5">
        <h2 className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
          Operations pipeline
        </h2>
        <p className="text-muted mt-3 text-sm">
          Couldn&apos;t load the pipeline just now. Refresh to try again.
        </p>
      </Card>
    );
  }
  const { indents, pos, receipts, bills } = pipeline;

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-baseline gap-2.5">
        <h2 className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
          Operations pipeline
        </h2>
        <span className="text-muted text-xs">material flow across all projects, this month</span>
        {indents.awaitingApproval > 0 && (
          <span className="text-warning ml-auto text-xs font-medium">
            {formatCount(indents.awaitingApproval)} awaiting approval
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
        {/* No rupee figure: an indent carries items and quantities, never money, by design. */}
        <div>
          <p className="text-muted text-[11px] tabular-nums">01</p>
          <p className="text-foreground mt-1.5 text-xs font-medium">Indents raised</p>
          <p className="text-foreground mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
            {formatCount(indents.raisedThisMonth)}
          </p>
          <p className="text-accent mt-0.5 text-xs">
            {formatCount(indents.lineCount)} {indents.lineCount === 1 ? "line" : "lines"}
          </p>
          <div className="bg-border mt-3 h-[3px] overflow-hidden rounded-full">
            <div className="bg-accent h-full rounded-full" style={{ width: "100%" }} />
          </div>
        </div>

        {/* No rupee figure: PO money is gated to /purchase-orders but this card shows for everyone,
            so it reports drafts via the money-free po_facts view. */}
        <div>
          <p className="text-muted text-[11px] tabular-nums">02</p>
          <p className="text-foreground mt-1.5 text-xs font-medium">POs issued</p>
          <p className="text-foreground mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
            {formatCount(pos.issuedThisMonth)}
          </p>
          <p className="text-accent mt-0.5 text-xs">
            {formatCount(pos.draftCount)} {pos.draftCount === 1 ? "draft" : "drafts"} in progress
          </p>
          <div className="bg-border mt-3 h-[3px] overflow-hidden rounded-full">
            <div
              className="bg-accent h-full rounded-full"
              style={{
                width: `${indents.raisedThisMonth === 0 ? 0 : Math.min(100, Math.round((pos.issuedThisMonth / indents.raisedThisMonth) * 100))}%`,
              }}
            />
          </div>
        </div>

        {/* No rupee figure: Inventory carries no money; the sub-line reports orders still awaiting goods. */}
        <div>
          <p className="text-muted text-[11px] tabular-nums">03</p>
          <p className="text-foreground mt-1.5 text-xs font-medium">Goods received</p>
          <p className="text-foreground mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
            {formatCount(receipts.receivedThisMonth)}
          </p>
          <p className="text-accent mt-0.5 text-xs">
            {formatCount(receipts.awaitingDelivery)} awaiting delivery
          </p>
          <div className="bg-border mt-3 h-[3px] overflow-hidden rounded-full">
            <div
              className="bg-accent h-full rounded-full"
              style={{
                width: `${pos.issuedThisMonth === 0 ? 0 : Math.min(100, Math.round((receipts.receivedThisMonth / pos.issuedThisMonth) * 100))}%`,
              }}
            />
          </div>
        </div>

        {/* No rupee figure: bill money is gated to /bills, so this counts via the money-free bill_facts view. */}
        <div>
          <p className="text-muted text-[11px] tabular-nums">04</p>
          <p className="text-foreground mt-1.5 text-xs font-medium">Bills booked</p>
          <p className="text-foreground mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
            {formatCount(bills.bookedThisMonth)}
          </p>
          <p className="text-accent mt-0.5 text-xs">
            {formatCount(bills.awaitingApproval)} awaiting approval
          </p>
          <div className="bg-border mt-3 h-[3px] overflow-hidden rounded-full">
            <div
              className="bg-accent h-full rounded-full"
              style={{
                width: `${pos.issuedThisMonth === 0 ? 0 : Math.min(100, Math.round((bills.bookedThisMonth / pos.issuedThisMonth) * 100))}%`,
              }}
            />
          </div>
        </div>

        {/* The tail. Unpaid is what accounts chases, so it takes the danger colour. */}
        <div>
          <p className="text-muted text-[11px] tabular-nums">05</p>
          <p className="text-foreground mt-1.5 text-xs font-medium">Paid</p>
          <p className="text-foreground mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
            {formatCount(bills.paidThisMonth)}
          </p>
          <p className="text-danger mt-0.5 text-xs">{formatCount(bills.unpaidCount)} unpaid</p>
          <div className="bg-border mt-3 h-[3px] overflow-hidden rounded-full">
            <div
              className="bg-danger h-full rounded-full"
              style={{
                width: `${bills.bookedThisMonth === 0 ? 0 : Math.min(100, Math.round((bills.paidThisMonth / bills.bookedThisMonth) * 100))}%`,
              }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}

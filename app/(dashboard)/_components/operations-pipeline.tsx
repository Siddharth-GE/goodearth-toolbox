import { Card } from "@/components/ui/card";
import { formatCount } from "@/lib/format";
import { countIndentsPipeline } from "@/lib/indents/queries";
import { countReceiptsPipeline } from "@/lib/inventory/queries";
import { countPosPipeline } from "@/lib/purchase-orders/queries";

// Stages 04–05 are still static illustrations: Bills doesn't exist
// yet. Each becomes real the same way 01–03 did — one query, same
// component, no restructuring. See CLAUDE.md.
const PLANNED_STAGES = [
  { n: "04", name: "Bills booked", count: 12, value: "₹22.1L", pct: 46 },
  { n: "05", name: "Paid", count: 9, value: "₹15.4L", pct: 32, tail: true },
];

export async function OperationsPipeline() {
  const [indents, pos, receipts] = await Promise.all([
    countIndentsPipeline(),
    countPosPipeline(),
    countReceiptsPipeline(),
  ]);

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-baseline gap-2.5">
        <h2 className="text-foreground text-xs font-semibold tracking-widest uppercase">
          Operations pipeline
        </h2>
        <span className="text-muted text-xs">material flow across all projects, this month</span>
        {indents.awaitingApproval > 0 && (
          <span className="text-warning ml-auto text-xs font-medium">
            {formatCount(indents.awaitingApproval)} awaiting approval
          </span>
        )}
      </div>
      <div className="flex gap-4 overflow-x-auto">
        {/* Stage 01 is real. No rupee figure: an indent carries items and
            quantities, never money — that's a deliberate design decision,
            so the sub-line says lines instead of inventing a value. */}
        <div className="min-w-[110px] flex-1">
          <p className="text-muted font-mono text-[10px]">01</p>
          <p className="text-foreground mt-1.5 text-xs font-medium">Indents raised</p>
          <p className="text-foreground mt-1.5 text-2xl font-semibold tracking-tight">
            {formatCount(indents.raisedThisMonth)}
          </p>
          <p className="text-accent mt-0.5 font-mono text-xs">
            {formatCount(indents.lineCount)} {indents.lineCount === 1 ? "line" : "lines"}
          </p>
          <div className="bg-border mt-3 h-[3px] overflow-hidden rounded-full">
            <div className="bg-accent h-full rounded-full" style={{ width: "100%" }} />
          </div>
        </div>

        {/* Stage 02 is real. No rupee figure on purpose: PO money is
            gated to the /purchase-orders grant, and this card renders
            for every signed-in user — so it reports drafts in progress
            instead, through the money-free po_facts view. */}
        <div className="min-w-[110px] flex-1">
          <p className="text-muted font-mono text-[10px]">02</p>
          <p className="text-foreground mt-1.5 text-xs font-medium">POs issued</p>
          <p className="text-foreground mt-1.5 text-2xl font-semibold tracking-tight">
            {formatCount(pos.issuedThisMonth)}
          </p>
          <p className="text-accent mt-0.5 font-mono text-xs">
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

        {/* Stage 03 is real. No rupee figure either: Inventory carries
            no money at all by design, so the sub-line reports how many
            orders are still waiting on their goods. */}
        <div className="min-w-[110px] flex-1">
          <p className="text-muted font-mono text-[10px]">03</p>
          <p className="text-foreground mt-1.5 text-xs font-medium">Goods received</p>
          <p className="text-foreground mt-1.5 text-2xl font-semibold tracking-tight">
            {formatCount(receipts.receivedThisMonth)}
          </p>
          <p className="text-accent mt-0.5 font-mono text-xs">
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

        {PLANNED_STAGES.map((stage) => (
          <div key={stage.n} className="min-w-[110px] flex-1">
            <p className="text-muted font-mono text-[10px]">{stage.n}</p>
            <p className="text-foreground mt-1.5 text-xs font-medium">{stage.name}</p>
            <p className="text-foreground mt-1.5 text-2xl font-semibold tracking-tight">
              {stage.count}
            </p>
            <p className={`mt-0.5 font-mono text-xs ${stage.tail ? "text-danger" : "text-accent"}`}>
              {stage.value}
            </p>
            <div className="bg-border mt-3 h-[3px] overflow-hidden rounded-full">
              <div
                className={`h-full rounded-full ${stage.tail ? "bg-danger" : "bg-accent"}`}
                style={{ width: `${stage.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

import { Card } from "@/components/ui/card";
import { formatCount } from "@/lib/format";
import { countIndentsPipeline } from "@/lib/indents/queries";

// Stages 02–05 are still static illustrations: POs, Inventory and Bills
// don't exist yet. Each becomes real the same way stage 01 just did —
// one query, same component, no restructuring. See CLAUDE.md.
const PLANNED_STAGES = [
  { n: "02", name: "POs issued", count: 21, value: "₹39.6L", pct: 82 },
  { n: "03", name: "Goods received", count: 16, value: "₹28.9L", pct: 60 },
  { n: "04", name: "Bills booked", count: 12, value: "₹22.1L", pct: 46 },
  { n: "05", name: "Paid", count: 9, value: "₹15.4L", pct: 32, tail: true },
];

export async function OperationsPipeline() {
  const indents = await countIndentsPipeline();

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

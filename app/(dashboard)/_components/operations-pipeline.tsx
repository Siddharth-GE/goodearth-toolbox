import { Card } from "@/components/ui/card";

// Static illustrative data — Indents/POs/Inventory/Bills don't exist
// yet. Swap for a real query once those tools ship. See CLAUDE.md.
const STAGES = [
  { n: "01", name: "Indents raised", count: 34, value: "₹48.2L", pct: 100 },
  { n: "02", name: "POs issued", count: 21, value: "₹39.6L", pct: 82 },
  { n: "03", name: "Goods received", count: 16, value: "₹28.9L", pct: 60 },
  { n: "04", name: "Bills booked", count: 12, value: "₹22.1L", pct: 46 },
  { n: "05", name: "Paid", count: 9, value: "₹15.4L", pct: 32, tail: true },
];

export function OperationsPipeline() {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-baseline gap-2.5">
        <h2 className="text-foreground text-xs font-semibold tracking-widest uppercase">
          Operations pipeline
        </h2>
        <span className="text-muted text-xs">material flow across all projects, this month</span>
        <span className="text-muted ml-auto font-mono text-xs">₹48.2L raised → ₹15.4L paid</span>
      </div>
      <div className="flex gap-4 overflow-x-auto">
        {STAGES.map((stage) => (
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

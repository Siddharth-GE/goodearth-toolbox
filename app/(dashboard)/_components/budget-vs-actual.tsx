import { Card } from "@/components/ui/card";

// Static illustrative data — Budgets/masters projects don't exist yet.
const PROJECTS = [
  { name: "Saarang Eco-Village", actual: "₹2.10Cr", budget: "₹3.00Cr", pct: 70 },
  { name: "Vihara", actual: "₹0.91Cr", budget: "₹2.40Cr", pct: 38 },
  { name: "Maloor Residential", actual: "₹1.60Cr", budget: "₹1.80Cr", pct: 89 },
  { name: "Baveli", actual: "₹0.40Cr", budget: "₹1.20Cr", pct: 33 },
];

export function BudgetVsActual() {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center">
        <h2 className="text-foreground text-sm font-semibold">Budget vs actual</h2>
        <span className="text-muted ml-auto text-xs">By project</span>
      </div>
      <div className="space-y-4">
        {PROJECTS.map((p) => {
          const over = p.pct >= 80;
          return (
            <div key={p.name}>
              <div className="mb-1.5 flex items-baseline gap-2 text-xs">
                <span className={`size-2 rounded-full ${over ? "bg-danger" : "bg-accent"}`} />
                <span className="text-foreground font-medium">{p.name}</span>
                <span className="text-muted ml-auto font-mono">
                  {p.actual} / {p.budget}
                </span>
                <span
                  className={`font-mono font-semibold ${over ? "text-danger" : "text-foreground"}`}
                >
                  {p.pct}%
                </span>
              </div>
              <div className="bg-border h-1.5 overflow-hidden rounded-full">
                <div
                  className={`h-full rounded-full ${over ? "bg-danger" : "bg-accent"}`}
                  style={{ width: `${p.pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

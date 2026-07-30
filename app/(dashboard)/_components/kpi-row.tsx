import { Card } from "@/components/ui/card";

// Static illustrative data — see operations-pipeline.tsx.
const KPIS = [
  { label: "Open indents", value: "12", sub: "+3 raised today", tone: "success" as const },
  { label: "POs awaiting approval", value: "7", sub: "₹14.2L needs your sign-off", tone: "warning" as const },
  { label: "Stock on hand", value: "₹1.34Cr", sub: "across 5 stores", tone: "muted" as const },
  { label: "Bills due this week", value: "5", sub: "₹8.6L to Malabar & 3 others", tone: "warning" as const },
];

const TONE_CLASSES = {
  success: "text-success",
  warning: "text-warning",
  muted: "text-muted",
};

export function KpiRow() {
  return (
    <div className="grid grid-cols-2 gap-3.5 md:grid-cols-4">
      {KPIS.map((kpi) => (
        <Card key={kpi.label} className="p-4">
          <p className="text-xs text-muted">{kpi.label}</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-foreground">{kpi.value}</p>
          <p className={`mt-2 text-xs ${TONE_CLASSES[kpi.tone]}`}>{kpi.sub}</p>
        </Card>
      ))}
    </div>
  );
}

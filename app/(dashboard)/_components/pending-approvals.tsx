import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ClipboardList, Receipt, ShoppingCart } from "lucide-react";

// Static illustrative data — Indents/POs/Bills don't exist yet, so
// these buttons aren't wired to a real approval flow either.
const APPROVALS = [
  { icon: ShoppingCart, title: "PO-2607-014 · Kannur Steel", subtitle: "Maloor · raised by Rajesh", amount: "₹3.24L", action: "Approve" },
  { icon: ClipboardList, title: "Indent IND-208", subtitle: "Maloor · 14 items", amount: null, action: "Review" },
  { icon: Receipt, title: "BILL-092 · Malabar Timbers", subtitle: "Saarang · due in 3 days", amount: "₹1.86L", action: "Approve" },
];

export function PendingApprovals() {
  return (
    <Card className="p-2">
      <div className="flex items-center px-3 pt-2.5 pb-2">
        <h2 className="text-sm font-semibold text-foreground">Pending your approval</h2>
        <span className="ml-auto text-xs text-muted">{APPROVALS.length}</span>
      </div>
      <div className="space-y-0.5">
        {APPROVALS.map((item) => (
          <div key={item.title} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <item.icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
              <p className="truncate text-xs text-muted">{item.subtitle}</p>
            </div>
            {item.amount && <span className="font-mono text-xs text-foreground">{item.amount}</span>}
            <Button size="md" className="h-7 shrink-0 px-2.5 text-xs">
              {item.action}
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

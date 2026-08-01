import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

// Static illustrative data — Purchase Orders doesn't exist yet.
const ROWS = [
  {
    po: "PO-2607-014",
    vendor: "Kannur Steel & Cement",
    project: "Maloor",
    amount: "₹3,24,000",
    status: "Awaiting",
    variant: "warning" as const,
  },
  {
    po: "PO-2607-013",
    vendor: "Malabar Timbers",
    project: "Saarang",
    amount: "₹1,86,500",
    status: "Approved",
    variant: "success" as const,
  },
  {
    po: "PO-2607-012",
    vendor: "Western Electricals",
    project: "Vihara",
    amount: "₹92,400",
    status: "Received",
    variant: "default" as const,
  },
  {
    po: "PO-2607-011",
    vendor: "Peravoor Hardware",
    project: "Saarang",
    amount: "₹47,200",
    status: "Billed",
    variant: "success" as const,
  },
];

export function RecentPurchaseOrders() {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center px-5 pt-4 pb-3">
        <h2 className="text-foreground text-sm font-semibold">Recent purchase orders</h2>
        <span className="text-muted ml-auto text-xs">View all</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-border text-muted border-t text-left text-xs">
            <th className="px-5 py-2.5 font-medium">PO</th>
            <th className="px-2 py-2.5 font-medium">Vendor</th>
            <th className="px-2 py-2.5 font-medium">Project</th>
            <th className="px-2 py-2.5 text-right font-medium">Amount</th>
            <th className="px-5 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.po} className="border-border border-t">
              <td className="text-foreground px-5 py-2.5 font-mono text-xs">{row.po}</td>
              <td className="text-foreground px-2 py-2.5">{row.vendor}</td>
              <td className="text-muted px-2 py-2.5">{row.project}</td>
              <td className="text-foreground px-2 py-2.5 text-right font-mono text-xs">
                {row.amount}
              </td>
              <td className="px-5 py-2.5">
                <Badge variant={row.variant}>{row.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

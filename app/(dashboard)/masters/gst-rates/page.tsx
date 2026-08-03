import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { formatPercent } from "@/lib/format";
import { listGstRates } from "@/lib/masters/gst-rates";
import { GstRateForm, GstRateToggle } from "./_components/gst-rate-forms";

export default async function GstRatesPage() {
  const rates = await listGstRates();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-4 p-4">
        <div>
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">GST rates</p>
          <p className="text-muted mt-1 text-sm">
            The slabs a purchase order line can pick from. Deactivating a rate stops new picks —
            existing purchase orders keep the percentage they were priced with.
          </p>
        </div>
        <GstRateForm />
        {rates.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Rate</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rates.map((row) => (
                <TableRow key={row.rate}>
                  <TableCell className="text-foreground font-medium">
                    {formatPercent(row.rate)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={row.is_active ? "success" : "warning"}>
                      {row.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <GstRateToggle rate={row.rate} isActive={row.is_active} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

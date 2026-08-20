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
import { listUomsMaster } from "@/lib/masters/uoms";
import { UomForm, UomNameField, UomToggle } from "./_components/uom-forms";

export default async function UomsPage() {
  const uoms = await listUomsMaster();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-4 p-4">
        <div>
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">
            Units of measure
          </p>
          <p className="text-muted mt-1 text-sm">
            The one list every unit picker offers — items, request lines, deliveries, issues and the
            estimator all speak it. Renaming a unit renames it on every row that carries it.
            Deactivating stops new picks; a unit in use cannot be deleted.
          </p>
        </div>
        <UomForm />
        {uoms.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Unit</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {uoms.map((uom) => (
                <TableRow key={uom.id}>
                  <TableCell>
                    <UomNameField id={uom.id} name={uom.name} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={uom.is_active ? "success" : "warning"}>
                      {uom.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <UomToggle id={uom.id} isActive={uom.is_active} />
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

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { listMaterials, listUomNames, listUoms } from "@/lib/estimator/queries";
import { formatMoney } from "@/lib/format";
import { Package } from "lucide-react";
import { DeleteMaterialButton, MaterialFormDialog } from "./_components/material-forms";
import { UomManager } from "./_components/uom-manager";

export default async function MaterialsPage() {
  const [materials, uoms, uomRows] = await Promise.all([
    listMaterials(),
    listUomNames(),
    listUoms(),
  ]);
  const unpriced = materials.filter((material) => material.rate === null).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="max-w-2xl">
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">Materials</p>
          <p className="text-muted mt-1 text-sm">
            The price list every estimate is built from. A material with no rate still counts
            towards quantities — the estimate says its cost is unknown rather than treating it as
            free.
          </p>
        </div>
        <MaterialFormDialog uoms={uoms} />
      </div>

      {materials.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No materials yet"
          description="Add cement, sand, steel and the rest — then mixes and work recipes can use them."
        />
      ) : (
        <Card className="space-y-3 p-4">
          {unpriced > 0 && (
            <p className="text-muted text-sm">
              {materials.length === 1
                ? "This material has no rate yet."
                : `${unpriced} of ${materials.length} materials ${unpriced === 1 ? "has" : "have"} no rate yet.`}
            </p>
          )}
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Material</TableHeaderCell>
                <TableHeaderCell>Measured in</TableHeaderCell>
                <TableHeaderCell>Rate</TableHeaderCell>
                <TableHeaderCell>Used in</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {materials.map((material) => (
                <TableRow key={material.id}>
                  <TableCell className="text-foreground font-medium">{material.name}</TableCell>
                  <TableCell>{material.uom}</TableCell>
                  <TableCell>
                    {material.rate === null ? (
                      <Badge variant="warning">Not priced</Badge>
                    ) : (
                      <span className="text-foreground">
                        {formatMoney(material.rate)} / {material.uom}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {material.useCount === 0
                      ? "—"
                      : `${material.useCount} ${material.useCount === 1 ? "recipe" : "recipes"}`}
                  </TableCell>
                  <TableCell>
                    <Badge variant={material.isActive ? "success" : "neutral"}>
                      {material.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <MaterialFormDialog material={material} uoms={uoms} />
                      {material.useCount === 0 && <DeleteMaterialButton material={material} />}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card className="space-y-3 p-4">
        <div>
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">Units</p>
          <p className="text-muted mt-1 text-sm">
            What the pickers offer wherever a unit is chosen — materials, mixes and works. A unit
            with a number beside it is in use and stays; one with a ✕ can be removed.
          </p>
        </div>
        <UomManager uoms={uomRows} />
      </Card>
    </div>
  );
}

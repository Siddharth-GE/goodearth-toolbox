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
import { listConstructionStages } from "@/lib/masters/stages";
import { StageForm, StageNameField, StageToggle } from "./_components/stage-forms";

export default async function StagesPage() {
  const stages = await listConstructionStages();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="space-y-4 p-4">
        <div>
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">
            Construction stages
          </p>
          <p className="text-muted mt-1 text-sm">
            The stages an indent or a construction budget picks from — picked, never typed, so
            reports group cleanly. Renaming a stage renames it on every indent that carries it.
            Deactivating stops new picks; a stage in use cannot be deleted.
          </p>
        </div>
        <StageForm />
        {stages.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Stage</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {stages.map((stage) => (
                <TableRow key={stage.id}>
                  <TableCell>
                    <StageNameField id={stage.id} name={stage.name} />
                  </TableCell>
                  <TableCell>
                    <Badge variant={stage.is_active ? "success" : "warning"}>
                      {stage.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <StageToggle id={stage.id} isActive={stage.is_active} />
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

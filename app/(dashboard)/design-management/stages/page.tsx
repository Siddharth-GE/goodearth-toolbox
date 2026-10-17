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
import { listDesignStages } from "@/lib/design-management/queries";

import {
  DesignStageBoardSwitch,
  DesignStageCodeField,
  DesignStageForm,
  DesignStageMoveButtons,
  DesignStageNameField,
  DesignStageToggle,
} from "./_components/stage-forms";

export default async function DesignStagesPage() {
  const stages = await listDesignStages();

  return (
    <Card className="space-y-4 p-4">
      <div className="text-muted max-w-prose space-y-2 text-sm">
        <p>
          The design stages: what a transmittal is issued against, and — for the ones on the board —
          the columns a villa moves through, in this order. Renaming a stage renames it on every
          transmittal and villa that carries it; retiring stops new picks without touching history.
        </p>
        <p>
          Switching a stage off the board hides its column and keeps everything recorded on it. The
          code goes into an uploaded sheet&apos;s file name, like WD in
          SAA-Saarang-Villa12-WD-TB0003-GFP.pdf.
        </p>
      </div>
      <DesignStageForm />
      {stages.length > 0 && (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Stage</TableHeaderCell>
              <TableHeaderCell>Code</TableHeaderCell>
              <TableHeaderCell>Board</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell></TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {stages.map((stage, index) => (
              <TableRow key={stage.id}>
                <TableCell>
                  <DesignStageNameField id={stage.id} name={stage.name} />
                </TableCell>
                <TableCell>
                  <DesignStageCodeField id={stage.id} code={stage.code} />
                </TableCell>
                <TableCell>
                  <DesignStageBoardSwitch
                    id={stage.id}
                    name={stage.name}
                    onBoard={stage.onBoard}
                    disabled={!stage.isActive}
                  />
                </TableCell>
                <TableCell>
                  <Badge variant={stage.isActive ? "success" : "warning"}>
                    {stage.isActive ? "Active" : "Retired"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <DesignStageMoveButtons
                      id={stage.id}
                      name={stage.name}
                      isFirst={index === 0}
                      isLast={index === stages.length - 1}
                    />
                    <DesignStageToggle id={stage.id} isActive={stage.isActive} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

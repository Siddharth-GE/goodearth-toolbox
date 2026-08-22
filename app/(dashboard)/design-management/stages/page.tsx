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
import { PageTitle } from "@/components/ui/page-title";
import { listDesignStages } from "@/lib/design-management/queries";

import {
  DesignStageForm,
  DesignStageMoveButtons,
  DesignStageNameField,
  DesignStageToggle,
} from "./_components/stage-forms";

export default async function DesignStagesPage() {
  const stages = await listDesignStages();

  return (
    <div className="space-y-4">
      <PageTitle
        title="Design stages"
        backHref="/design-management"
        backLabel="Design Management"
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="space-y-4 p-4">
          <div>
            <p className="text-muted mt-1 text-sm">
              The stages a transmittal is issued against — its own list, separate from Relay&apos;s
              trail stages. Renaming a stage renames it on every transmittal that carries it;
              retiring stops new picks without touching history.
            </p>
          </div>
          <DesignStageForm />
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
                {stages.map((stage, index) => (
                  <TableRow key={stage.id}>
                    <TableCell>
                      <DesignStageNameField id={stage.id} name={stage.name} />
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
      </div>
    </div>
  );
}

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
import { listProgressStages } from "@/lib/masters/progress-stages";
import {
  addProgressStage,
  deleteProgressStage,
  moveProgressStage,
  renameProgressStage,
  setProgressStageActive,
} from "@/lib/masters/progress-stages-actions";
import { listConstructionStages } from "@/lib/masters/stages";
import {
  addConstructionStage,
  deleteConstructionStage,
  renameConstructionStage,
  setConstructionStageActive,
} from "@/lib/masters/stages-actions";

import { MasterDeleteButton } from "../_components/masters-admin";
import { StageForm, StageMove, StageNameField, StageToggle } from "./_components/stage-forms";

/** Two lists, easy to confuse: construction stages are what money is tagged with (0053); build progress is how far a villa has got (0119). */
export default async function StagesPage() {
  const [stages, progress] = await Promise.all([listConstructionStages(), listProgressStages()]);
  const activeProgress = progress.filter((stage) => stage.is_active);
  const handover = activeProgress.at(-1);

  return (
    <div className="grid items-start gap-4 md:grid-cols-2">
      <Card className="space-y-4 p-4">
        <div>
          <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
            Construction stages
          </p>
          <p className="text-muted mt-1 text-sm">
            What the money is for — the stages an indent picks from, picked, never typed, so reports
            group cleanly. Renaming a stage renames it on every indent that carries it. Deactivating
            stops new picks; a stage in use cannot be deleted.
          </p>
        </div>
        <StageForm
          action={addConstructionStage}
          inputId="stage-name"
          placeholder="e.g. Waterproofing"
        />
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
                    <StageNameField
                      id={stage.id}
                      name={stage.name}
                      rename={renameConstructionStage}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant={stage.is_active ? "success" : "warning"}>
                      {stage.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <StageToggle
                        id={stage.id}
                        isActive={stage.is_active}
                        setActive={setConstructionStageActive}
                      />
                      <MasterDeleteButton
                        noun="stage"
                        onDelete={deleteConstructionStage.bind(null, stage.id)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="space-y-4 p-4">
        <div>
          <p className="text-muted text-[11px] font-medium tracking-[0.14em] uppercase">
            Build progress
          </p>
          <p className="text-muted mt-1 text-sm">
            How far a villa&rsquo;s build has got, in order — Client Relations shows each
            plot&rsquo;s stage and fills its progress bar from this list. The first stage is the
            paperwork before ground is broken; the last active stage means handed over. A stage a
            plot sits on cannot be deleted — deactivate it instead.
          </p>
        </div>
        <StageForm
          action={addProgressStage}
          inputId="progress-stage-name"
          placeholder="e.g. Waterproofing"
        />
        {progress.length > 0 && (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Order</TableHeaderCell>
                <TableHeaderCell>Stage</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {progress.map((stage, index) => (
                <TableRow key={stage.id}>
                  <TableCell>
                    <StageMove
                      id={stage.id}
                      name={stage.name}
                      first={index === 0}
                      last={index === progress.length - 1}
                      move={moveProgressStage}
                    />
                  </TableCell>
                  <TableCell>
                    <StageNameField id={stage.id} name={stage.name} rename={renameProgressStage} />
                  </TableCell>
                  <TableCell>
                    {stage.is_active ? (
                      <Badge variant={stage.id === handover?.id ? "info" : "success"}>
                        {stage.id === handover?.id ? "Handover" : "Active"}
                      </Badge>
                    ) : (
                      <Badge variant="warning">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      <StageToggle
                        id={stage.id}
                        isActive={stage.is_active}
                        setActive={setProgressStageActive}
                      />
                      <MasterDeleteButton
                        noun="build stage"
                        onDelete={deleteProgressStage.bind(null, stage.id)}
                      />
                    </div>
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

import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
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
import { listEstimates, type EstimateRow } from "@/lib/estimator/queries";
import { formatDate } from "@/lib/format";
import { listProjects } from "@/lib/masters/projects";
import { listUnits } from "@/lib/masters/units";
import { Calculator } from "lucide-react";
import Link from "next/link";
import { CopyTemplateDialog, EstimateFormDialog } from "./_components/estimate-forms";

export default async function EstimatesPage() {
  const [estimates, projects, units] = await Promise.all([
    listEstimates(),
    listProjects(),
    listUnits(),
  ]);

  const templates = estimates.filter((estimate) => estimate.isTemplate);
  const villaEstimates = estimates.filter((estimate) => !estimate.isTemplate);

  // Grouped by project so a 43-villa list reads as projects, not a wall.
  const byProject = new Map<string, EstimateRow[]>();
  for (const estimate of villaEstimates) {
    byProject.set(estimate.projectName, [...(byProject.get(estimate.projectName) ?? []), estimate]);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="max-w-2xl">
          <p className="text-muted text-xs font-semibold tracking-widest uppercase">Estimates</p>
          <p className="text-muted mt-1 text-sm">
            A villa and the works it needs. Templates are the standard villa — copy one onto a real
            villa and adjust the quantities, rather than starting from nothing 43 times.
          </p>
        </div>
        <EstimateFormDialog projects={projects} units={units} />
      </div>

      {estimates.length === 0 ? (
        <EmptyState
          icon={Calculator}
          title="No estimates yet"
          description="Start with a template — an estimate with no villa — then copy it onto each one."
        />
      ) : (
        <>
          <Card className="space-y-3 p-4">
            <div>
              <p className="text-foreground text-sm font-semibold">Templates</p>
              <p className="text-muted mt-1 text-sm">
                The standard villa for a project. Copying one carries its works and quantities.
              </p>
            </div>
            {templates.length === 0 ? (
              <p className="text-muted text-sm">
                None yet — create an estimate and leave the villa blank to make one.
              </p>
            ) : (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Template</TableHeaderCell>
                    <TableHeaderCell>Project</TableHeaderCell>
                    <TableHeaderCell>Works</TableHeaderCell>
                    <TableHeaderCell></TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {templates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell className="text-foreground font-medium">
                        <Link
                          href={`/estimator/estimates/${template.id}`}
                          className="hover:underline"
                        >
                          {template.name}
                        </Link>
                      </TableCell>
                      <TableCell>{template.projectName}</TableCell>
                      <TableCell>{template.lineCount}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <LinkButton
                            href={`/estimator/estimates/${template.id}`}
                            variant="ghost"
                            size="sm"
                          >
                            Open
                          </LinkButton>
                          <CopyTemplateDialog template={template} units={units} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          {villaEstimates.length === 0 ? (
            <Card className="p-4">
              <p className="text-muted text-sm">
                No villa estimates yet — copy a template onto a villa to make the first.
              </p>
            </Card>
          ) : (
            [...byProject].map(([projectName, rows]) => (
              <Card key={projectName} className="space-y-3 p-4">
                <p className="text-foreground text-sm font-semibold">{projectName}</p>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Estimate</TableHeaderCell>
                      <TableHeaderCell>Villa</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                      <TableHeaderCell>Works</TableHeaderCell>
                      <TableHeaderCell>Started</TableHeaderCell>
                      <TableHeaderCell></TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((estimate) => (
                      <TableRow key={estimate.id}>
                        <TableCell className="text-foreground font-medium">
                          <Link
                            href={`/estimator/estimates/${estimate.id}`}
                            className="hover:underline"
                          >
                            {estimate.name}
                          </Link>
                          {estimate.note && (
                            <span className="text-muted block text-xs">{estimate.note}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {estimate.unitName ?? <Badge variant="warning">No villa</Badge>}
                        </TableCell>
                        <TableCell>
                          {estimate.status === "submitted" ? (
                            <span className="flex items-center gap-1.5">
                              <Badge variant="success">Official</Badge>
                              <span className="text-muted text-xs">{estimate.reference}</span>
                            </span>
                          ) : estimate.status === "superseded" ? (
                            <Badge variant="neutral">Superseded</Badge>
                          ) : (
                            <Badge variant="warning">Draft</Badge>
                          )}
                        </TableCell>
                        <TableCell>{estimate.lineCount}</TableCell>
                        <TableCell className="text-muted">
                          {formatDate(estimate.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <LinkButton
                              href={`/estimator/estimates/${estimate.id}`}
                              variant="ghost"
                              size="sm"
                            >
                              Open
                            </LinkButton>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            ))
          )}
        </>
      )}
    </div>
  );
}

"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createIndent } from "@/lib/indents/actions";
import type { IndentFormOptions } from "@/lib/indents/queries";
import { useMemo, useState, useTransition } from "react";

export function IndentForm({ options }: { options: IndentFormOptions }) {
  const [projectId, setProjectId] = useState("");
  const [plotId, setPlotId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [stage, setStage] = useState("");
  const [requiredBy, setRequiredBy] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [creating, startTransition] = useTransition();

  const project = options.projects.find((candidate) => candidate.id === projectId);
  const plots = useMemo(
    () => options.plots.filter((plot) => plot.project_id === projectId),
    [options.plots, projectId],
  );
  const units = useMemo(
    () => options.units.filter((unit) => unit.project_id === projectId),
    [options.units, projectId],
  );

  // The indent number is IND/<code>/…, so a project without a code can't
  // mint one — said here, before anything is created, rather than as a
  // failure afterwards. The action and the database both re-check.
  const missingCode = Boolean(project) && !project?.code;

  const create = () =>
    startTransition(async () => {
      // A success redirects to the new indent, so only errors come back.
      const result = await createIndent({
        projectId,
        plotId: plotId || null,
        unitId: unitId || null,
        stage: stage || null,
        requiredBy: requiredBy || null,
        note: note || null,
      });
      if (result?.error) setError(result.error);
    });

  return (
    <div className="border-border bg-surface max-w-xl space-y-4 rounded-2xl border p-5">
      <div className="space-y-1.5">
        <Label htmlFor="indent-project">Project</Label>
        <Select
          id="indent-project"
          value={projectId}
          onChange={(event) => {
            setProjectId(event.target.value);
            setPlotId("");
            setUnitId("");
          }}
        >
          <option value="" disabled>
            Choose a project
          </option>
          {options.projects.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
              {candidate.code ? ` (${candidate.code})` : " — no code yet"}
            </option>
          ))}
        </Select>
        {missingCode && (
          <p className="text-warning text-xs font-medium" role="alert">
            {project?.name} has no short code yet, so it can&apos;t number indents. Set one in
            Masters → Projects first.
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="indent-plot">Plot (optional)</Label>
          <Select
            id="indent-plot"
            value={plotId}
            onChange={(event) => setPlotId(event.target.value)}
            disabled={!projectId || plots.length === 0}
          >
            <option value="">{plots.length === 0 && projectId ? "No plots" : "None"}</option>
            {plots.map((plot) => (
              <option key={plot.id} value={plot.id}>
                {plot.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="indent-unit">Unit (optional)</Label>
          <Select
            id="indent-unit"
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
            disabled={!projectId || units.length === 0}
          >
            <option value="">{units.length === 0 && projectId ? "No units" : "None"}</option>
            {units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="indent-stage">Stage (optional)</Label>
          <Input
            id="indent-stage"
            value={stage}
            onChange={(event) => setStage(event.target.value)}
            placeholder="Foundation"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="indent-required-by">Required by</Label>
          <Input
            id="indent-required-by"
            type="date"
            value={requiredBy}
            onChange={(event) => setRequiredBy(event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="indent-note">Note</Label>
        <Textarea
          id="indent-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Anything the approver or purchase team should know"
          rows={3}
        />
      </div>

      <FormMessage error={error} />

      <div className="flex items-center justify-end gap-2">
        <LinkButton href="/indents" variant="ghost">
          Cancel
        </LinkButton>
        <Button onClick={create} disabled={creating || !projectId || missingCode}>
          {creating ? "Creating…" : "Create indent"}
        </Button>
      </div>
    </div>
  );
}

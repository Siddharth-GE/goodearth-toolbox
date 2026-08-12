"use client";

import { SitePicker } from "@/components/masters/site-picker";
import { Button, LinkButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createIndent } from "@/lib/indents/actions";
import type { IndentFormOptions } from "@/lib/indents/queries";
import { buildSiteOptions, decodeSite } from "@/lib/masters/site-options";
import { useMemo, useState, useTransition } from "react";

export function IndentForm({ options }: { options: IndentFormOptions }) {
  const [projectId, setProjectId] = useState("");
  // "" = general, "unit:<id>" or "plot:<id>" otherwise — one place, one
  // question, since plot ↔ unit became 1:1 (0029).
  const [site, setSite] = useState("");
  const [stage, setStage] = useState("");
  const [requiredBy, setRequiredBy] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [creating, startTransition] = useTransition();

  const project = options.projects.find((candidate) => candidate.id === projectId);
  const siteOptions = useMemo(
    () => buildSiteOptions(options.units, options.plots, projectId),
    [options.units, options.plots, projectId],
  );

  // The indent number is IND/<code>/…, so a project without a code can't
  // mint one — said here, before anything is created, rather than as a
  // failure afterwards. The action and the database both re-check.
  const missingCode = Boolean(project) && !project?.code;

  const create = () =>
    startTransition(async () => {
      // A success redirects to the new indent, so only errors come back.
      const { plotId, unitId } = decodeSite(site);
      const result = await createIndent({
        projectId,
        plotId,
        unitId,
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
            setSite("");
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

      <div className="space-y-1.5">
        <Label htmlFor="indent-site">For</Label>
        <SitePicker
          id="indent-site"
          value={site}
          onChange={(event) => setSite(event.target.value)}
          disabled={!projectId}
          options={siteOptions}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="indent-stage">Stage (optional)</Label>
          <Select
            id="indent-stage"
            value={stage}
            onChange={(event) => setStage(event.target.value)}
          >
            <option value="">No stage</option>
            {options.stages.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
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

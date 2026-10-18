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
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useMemo, useState } from "react";

export function IndentForm({ options }: { options: IndentFormOptions }) {
  const [projectId, setProjectId] = useState("");
  // "" = general, "unit:<id>" or "plot:<id>" (plot and unit are 1:1, 0029).
  const [site, setSite] = useState("");
  const [workItemId, setWorkItemId] = useState("");
  const [requiredBy, setRequiredBy] = useState("");
  const [note, setNote] = useState("");
  const { pending: creating, error, run } = useActionRunner();

  const project = options.projects.find((candidate) => candidate.id === projectId);
  const siteOptions = useMemo(
    () => buildSiteOptions(options.units, options.plots, projectId),
    [options.units, options.plots, projectId],
  );

  // IND/<code>/… needs a project code: say so before creating (the action and database re-check).
  const missingCode = Boolean(project) && !project?.code;

  const create = async () => {
    const { plotId, unitId } = decodeSite(site);
    await run(() =>
      createIndent({
        projectId,
        plotId,
        unitId,
        workItemId: workItemId || null,
        requiredBy: requiredBy || null,
        note: note || null,
      }),
    );
  };

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
          <Label htmlFor="indent-work">Work (optional)</Label>
          <Select
            id="indent-work"
            value={workItemId}
            onChange={(event) => setWorkItemId(event.target.value)}
          >
            <option value="">No work</option>
            {[...new Set(options.works.map((work) => work.category))].map((category) => (
              <optgroup key={category} label={category}>
                {options.works
                  .filter((work) => work.category === category)
                  .map((work) => (
                    <option key={work.id} value={work.id}>
                      {work.code} — {work.name}
                    </option>
                  ))}
              </optgroup>
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
        <LinkButton href="/indents/list" variant="ghost">
          Cancel
        </LinkButton>
        <Button onClick={create} disabled={creating || !projectId || missingCode}>
          {creating ? "Creating…" : "Create indent"}
        </Button>
      </div>
    </div>
  );
}

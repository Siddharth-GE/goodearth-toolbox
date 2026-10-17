"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { renamePlan } from "@/lib/business-planning/actions";
import { Pencil } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

/**
 * Rename a plan or move it, apart from the autosave: name and location live in their own
 * columns, not the jsonb document, and renaming is deliberate. The editor keeps its state across
 * the revalidate, so nothing typed into the plan is lost.
 */
export type PlanProjectOption = { id: string; name: string };

export function RenamePlanDialog({
  planId,
  name,
  location,
  projectId,
  projects,
}: {
  planId: string;
  name: string;
  location: string | null;
  projectId: string | null;
  projects: PlanProjectOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <Pencil className="size-4" />
          Rename
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename this plan</DialogTitle>
        </DialogHeader>
        {/* Radix unmounts DialogContent on close, so every open starts from the saved values. */}
        <RenameForm
          planId={planId}
          name={name}
          location={location}
          projectId={projectId}
          projects={projects}
          onSaved={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function RenameForm({
  planId,
  name,
  location,
  projectId,
  projects,
  onSaved,
}: {
  planId: string;
  name: string;
  location: string | null;
  projectId: string | null;
  projects: PlanProjectOption[];
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(renamePlan.bind(null, planId), undefined);
  const wasPending = useRef(false);

  // Close only after a save that worked: closing on submit would throw away the error message.
  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) onSaved();
    wasPending.current = pending;
  }, [pending, state, onSaved]);

  return (
    <form action={formAction}>
      <fieldset disabled={pending} className="min-w-0 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="rename-name">Name</Label>
          <Input
            id="rename-name"
            name="name"
            defaultValue={name}
            required
            maxLength={120}
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rename-location">Location</Label>
          <Input
            id="rename-location"
            name="location"
            defaultValue={location ?? ""}
            maxLength={120}
            placeholder="Vagamon, Idukki"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rename-project">Project</Label>
          <Select id="rename-project" name="project_id" defaultValue={projectId ?? ""}>
            <option value="">No project — keep this plan private to this tool</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
          <p className="text-muted text-xs">
            Linking a project publishes this plan&rsquo;s headline numbers — revenue, cost, profit,
            funding — so the Reporter can put actuals beside them. Clearing it withdraws them.
          </p>
        </div>
        <FormMessage error={state?.error} />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">{pending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </fieldset>
    </form>
  );
}

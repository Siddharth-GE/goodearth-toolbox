"use client";

import { ProjectPicker } from "@/components/masters/project-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProjectRow } from "@/lib/masters/projects";
import type { StoreRow } from "@/lib/masters/stores";
import { createStore, updateStore } from "@/lib/masters/stores-actions";

export function StoreFormDialog({ projects, store }: { projects: ProjectRow[]; store?: StoreRow }) {
  const isEdit = !!store;

  return (
    <RecordFormDialog
      label="Store"
      isEdit={isEdit}
      action={isEdit ? updateStore.bind(null, store.id) : createStore}
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={store?.name} required autoComplete="off" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="project_id">Project (optional)</Label>
        <ProjectPicker
          id="project_id"
          name="project_id"
          projects={projects}
          defaultValue={store?.project_id ?? ""}
          placeholder="No specific project"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="location">Location</Label>
        <Input
          id="location"
          name="location"
          defaultValue={store?.location ?? ""}
          autoComplete="off"
        />
      </div>
      <label className="text-foreground flex items-center gap-2 text-sm">
        <Checkbox name="is_active" value="1" defaultChecked={store?.is_active ?? true} />
        Active
      </label>
    </RecordFormDialog>
  );
}

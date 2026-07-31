"use client";

import { ProjectPicker } from "@/components/masters/project-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProjectRow } from "@/lib/masters/projects";
import type { StoreRow } from "@/lib/masters/stores";
import { createStore, updateStore } from "@/lib/masters/stores-actions";
import { useActionState, useEffect, useRef, useState } from "react";

export function StoreFormDialog({ projects, store }: { projects: ProjectRow[]; store?: StoreRow }) {
  const [open, setOpen] = useState(false);
  const isEdit = !!store;
  const action = isEdit ? updateStore.bind(null, store.id) : createStore;
  const [state, formAction, pending] = useActionState(action, undefined);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isEdit ? "secondary" : "primary"}>{isEdit ? "Edit" : "New Store"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Store" : "New Store"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
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
            <Input id="location" name="location" defaultValue={store?.location ?? ""} autoComplete="off" />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <Checkbox name="is_active" value="1" defaultChecked={store?.is_active ?? true} />
            Active
          </label>
          {state?.error && <p className="text-sm font-medium text-danger">{state.error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

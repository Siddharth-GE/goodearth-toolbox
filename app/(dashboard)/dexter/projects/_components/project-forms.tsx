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
import { createProject } from "@/lib/dexter/actions";
import { useActionState, useState } from "react";

/** A name and, optionally, who it's for — everything else about a
 *  project happens one click in, once it exists. */
export function NewProjectDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New project</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        {/* Inside DialogContent, which Radix unmounts on close, so every
            open starts with a clean form and no stale error. */}
        <NewProjectForm />
      </DialogContent>
    </Dialog>
  );
}

function NewProjectForm() {
  const [state, formAction, pending] = useActionState(createProject, undefined);

  return (
    <form action={formAction}>
      <fieldset disabled={pending} className="min-w-0 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="project-name">Name</Label>
          <Input
            id="project-name"
            name="name"
            required
            maxLength={120}
            autoFocus
            placeholder="e.g. Villa 12 — Client presentation"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="project-client">Client</Label>
          <Input id="project-client" name="client_name" maxLength={120} placeholder="Optional" />
        </div>
        <FormMessage error={state?.error} />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">{pending ? "Creating…" : "Create project"}</Button>
        </DialogFooter>
      </fieldset>
    </form>
  );
}

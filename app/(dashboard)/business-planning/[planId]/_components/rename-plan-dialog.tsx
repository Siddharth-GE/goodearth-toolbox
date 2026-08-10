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
import { renamePlan } from "@/lib/business-planning/actions";
import { Pencil } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";

/**
 * Rename a plan, or move it.
 *
 * Separate from the autosave that writes the model: the name and
 * location live in their own columns, not in the jsonb document, and
 * renaming is a deliberate act rather than something a debounce should
 * fire mid-keystroke.
 *
 * The action revalidates this route, so the heading updates underneath —
 * and because the editor holds the model in its own state and is not
 * remounted, nothing typed into the plan is lost by renaming it.
 */
export function RenamePlanDialog({
  planId,
  name,
  location,
}: {
  planId: string;
  name: string;
  location: string | null;
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
        {/* Inside DialogContent, which Radix unmounts on close, so every
            open starts from the saved values with no stale error. */}
        <RenameForm
          planId={planId}
          name={name}
          location={location}
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
  onSaved,
}: {
  planId: string;
  name: string;
  location: string | null;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(renamePlan.bind(null, planId), undefined);
  const wasPending = useRef(false);

  // Close only after a save that actually worked — closing on submit
  // would throw away the error message.
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

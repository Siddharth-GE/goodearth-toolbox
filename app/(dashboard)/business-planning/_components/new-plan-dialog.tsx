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
import { createPlan } from "@/lib/business-planning/actions";
import { useActionState, useState } from "react";

/**
 * Two fields and nothing else. Everything about the model is edited on
 * the plan itself, live — asking for assumptions in a dialog before you
 * can see a single number is how a "quick plan" stops being quick.
 *
 * This is not RecordFormDialog: that one closes itself on success, and
 * a successful create here REDIRECTS into the new plan instead. The
 * dialog unmounts with the page, so it has nothing to close.
 */
export function NewPlanDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New plan</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New plan</DialogTitle>
        </DialogHeader>
        {/* Inside DialogContent, which Radix unmounts on close, so every
            open starts with a clean form and no stale error. */}
        <NewPlanForm />
      </DialogContent>
    </Dialog>
  );
}

function NewPlanForm() {
  const [state, formAction, pending] = useActionState(createPlan, undefined);

  return (
    <form action={formAction}>
      <fieldset disabled={pending} className="min-w-0 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="plan-name">Name</Label>
          <Input
            id="plan-name"
            name="name"
            required
            maxLength={120}
            autoFocus
            placeholder="Vihara — JV land variant"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-location">Location</Label>
          <Input id="plan-location" name="location" maxLength={120} placeholder="Vagamon, Idukki" />
          <p className="text-muted text-xs">
            Free text. A plan doesn&rsquo;t need a project to exist — model land you haven&rsquo;t
            bought.
          </p>
        </div>
        <FormMessage error={state?.error} />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">{pending ? "Creating…" : "Create plan"}</Button>
        </DialogFooter>
      </fieldset>
    </form>
  );
}

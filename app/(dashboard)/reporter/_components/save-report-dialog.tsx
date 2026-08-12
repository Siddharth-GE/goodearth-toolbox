"use client";

import { useActionState, useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { saveReport } from "@/lib/reporter/actions";
import { encodeSpec, type ReportSpec } from "@/lib/reporter/spec";

/**
 * Save the report on screen under a name. Also the "Save a copy" path
 * for a starter or for someone else's report — both are one insert, so
 * they are one dialog with different words on the button.
 *
 * The spec travels as the same base64url the URL carries, and is
 * re-parsed server-side by the action. Nothing typed here reaches the
 * database as anything but a name and a description.
 *
 * Not RecordFormDialog: that one closes itself on success, and a
 * successful save here REDIRECTS into the new report instead, so the
 * dialog unmounts with the page and has nothing to close.
 */
export function SaveReportDialog({
  spec,
  trigger,
  title,
  defaultName = "",
  defaultDescription = "",
  variant = "primary",
}: {
  spec: ReportSpec;
  /** The button that opens it. */
  trigger: string;
  /** The dialog's own heading. Defaults to the trigger's words. */
  title?: string;
  defaultName?: string;
  defaultDescription?: string;
  variant?: "primary" | "secondary";
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>{trigger}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title ?? trigger}</DialogTitle>
        </DialogHeader>
        {/* Inside DialogContent, which Radix unmounts on close, so every
            open starts with a clean form and no stale error. */}
        <SaveReportForm
          spec={spec}
          defaultName={defaultName}
          defaultDescription={defaultDescription}
        />
      </DialogContent>
    </Dialog>
  );
}

function SaveReportForm({
  spec,
  defaultName,
  defaultDescription,
}: {
  spec: ReportSpec;
  defaultName: string;
  defaultDescription: string;
}) {
  const [state, formAction, pending] = useActionState(saveReport, undefined);

  return (
    <form action={formAction}>
      <fieldset disabled={pending} className="min-w-0 space-y-3">
        <input type="hidden" name="spec" value={encodeSpec(spec)} />
        <div className="space-y-1.5">
          <Label htmlFor="report-name">Name</Label>
          <Input
            id="report-name"
            name="name"
            required
            maxLength={120}
            autoFocus
            defaultValue={defaultName}
            placeholder="Cement across Malhar"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="report-description">What it answers</Label>
          <Textarea
            id="report-description"
            name="description"
            rows={2}
            maxLength={300}
            defaultValue={defaultDescription}
            placeholder="One line, so the next person knows what they are looking at."
          />
        </div>
        <p className="text-muted text-xs">
          A saved report stores the question, not the numbers. Everyone who opens it sees figures
          from their own access — never yours.
        </p>
        <FormMessage error={state?.error} />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">{pending ? "Saving…" : "Save report"}</Button>
        </DialogFooter>
      </fieldset>
    </form>
  );
}

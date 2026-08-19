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
import { reviseEstimate, submitEstimate } from "@/lib/estimator/actions";
import { useState, useTransition } from "react";

/**
 * Submit, behind a confirm that says exactly what freezes — pressing it
 * is the moment the estimate stops being a calculator and becomes the
 * villa's official document, so the button must not be casual.
 */
export function SubmitEstimateButton({
  estimateId,
  villaName,
  hasLines,
}: {
  estimateId: string;
  villaName: string;
  hasLines: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(undefined);
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={!hasLines} title={hasLines ? undefined : "Add a work first"}>
          Submit
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make this the official estimate?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-foreground">
            Submitting freezes this estimate at today&apos;s rates and makes it the official
            estimate for {villaName} — the one material requests and site issues are checked
            against.
          </p>
          <ul className="text-muted list-disc space-y-1 pl-5">
            <li>It gets a reference number and records you as its submitter.</li>
            <li>Its works, quantities and costs stop moving when rates change.</li>
            <li>
              It can no longer be edited — a change means revising it, which starts a fresh draft.
            </li>
            <li>If {villaName} already has an official estimate, this one replaces it.</li>
          </ul>
          <FormMessage error={error} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await submitEstimate(estimateId);
                if (result?.error) setError(result.error);
                else setOpen(false);
              })
            }
          >
            {pending ? "Submitting…" : "Submit estimate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Start a fresh draft from a submitted estimate's works. */
export function ReviseEstimateButton({ estimateId }: { estimateId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <div className="flex items-center gap-2">
      <FormMessage error={error} />
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await reviseEstimate(estimateId);
            setError(result?.error);
          })
        }
      >
        {pending ? "Starting revision…" : "Revise"}
      </Button>
    </div>
  );
}

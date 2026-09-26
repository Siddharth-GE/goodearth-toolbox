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
import { makeOfficial } from "@/lib/estimator/estimate-actions";
import { useState, useTransition } from "react";

/**
 * Make official (0098), behind a confirm that says exactly what happens —
 * a numbered copy is frozen and becomes what the stores and site check
 * against, while this working estimate stays open for the next change.
 */
export function MakeOfficialButton({
  estimateId,
  villaName,
  lineCount,
  toMeasureCount,
  hasOfficial,
}: {
  estimateId: string;
  villaName: string;
  lineCount: number;
  toMeasureCount: number;
  hasOfficial: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const blocked =
    lineCount === 0
      ? "Add a work first"
      : toMeasureCount > 0
        ? `${toMeasureCount} ${toMeasureCount === 1 ? "work is" : "works are"} still to measure`
        : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(undefined);
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={!!blocked} title={blocked}>
          Make official
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Make this {villaName}&apos;s official estimate?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-foreground">
            A copy of this estimate is frozen at today&apos;s rates and becomes {villaName}&apos;s
            official estimate — the one material requests and site deliveries are checked against.
          </p>
          <ul className="text-muted list-disc space-y-1 pl-5">
            <li>The copy gets a reference number and records you as the one who made it.</li>
            <li>Its works, quantities, measurements and costs stop moving when rates change.</li>
            <li>This working estimate stays open — change it and make it official again later.</li>
            {hasOfficial && <li>The current official estimate is kept as history.</li>}
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
                const result = await makeOfficial(estimateId);
                if (result?.error) setError(result.error);
                else setOpen(false);
              })
            }
          >
            {pending ? "Making it official…" : "Make official"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

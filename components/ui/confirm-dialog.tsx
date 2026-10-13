"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useId, useState, useTransition, type ReactNode } from "react";

/**
 * "Are you sure?" before a press that cannot be taken back — cancelling a
 * stay or an invoice, removing a receipt. It names what will happen
 * before it happens, keeps any refusal inside the dialog, and, when the
 * record needs one, asks why (`reason`): the answer is handed to
 * `onConfirm`, and the button waits until something is typed.
 *
 * The third copy of Design Management's local ConfirmDialog (DESIGN.md:
 * the third copy is built into components/ui); that one converts when
 * its screen is next touched.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel,
  tone = "danger",
  reason,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  pendingLabel: string;
  /** danger for what destroys or cancels; primary for a weighty forward move. */
  tone?: "danger" | "primary";
  reason?: { label: string; placeholder?: string };
  onConfirm: (reason: string) => Promise<{ error?: string } | undefined>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [why, setWhy] = useState("");
  const reasonId = useId();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) {
          setError(undefined);
          setWhy("");
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {reason && (
          <div className="space-y-1.5">
            <Label htmlFor={reasonId}>{reason.label}</Label>
            <Textarea
              id={reasonId}
              value={why}
              onChange={(event) => setWhy(event.target.value)}
              placeholder={reason.placeholder}
              rows={2}
              maxLength={300}
              autoFocus
            />
          </div>
        )}
        <FormMessage error={error} />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" disabled={pending}>
              Keep it
            </Button>
          </DialogClose>
          <Button
            className={
              tone === "danger" ? "bg-danger text-danger-foreground hover:bg-danger/90" : undefined
            }
            disabled={pending || (reason !== undefined && why.trim() === "")}
            onClick={() => {
              setError(undefined);
              startTransition(async () => {
                const result = await onConfirm(why.trim());
                if (result?.error) setError(result.error);
                else setOpen(false);
              });
            }}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

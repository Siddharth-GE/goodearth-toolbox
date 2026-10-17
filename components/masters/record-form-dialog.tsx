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
import { type ReactNode, useActionState, useEffect, useRef, useState } from "react";

type FormState = { error?: string } | undefined;

/** The create/edit dialog every Masters record uses: callers supply only the fields, as children. */
export function RecordFormDialog({
  label,
  isEdit,
  action,
  children,
  trigger,
  onOpen,
  wide = false,
}: {
  /** Singular record name, e.g. "Vendor". Titles and buttons derive from it. */
  label: string;
  isEdit: boolean;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  trigger?: ReactNode;
  /** Called when the dialog opens, for a form holding its own state (Units resets its plot list). A handler, not an effect on `open`. */
  onOpen?: () => void;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) onOpen?.();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant={isEdit ? "secondary" : "primary"}>
            {isEdit ? "Edit" : `New ${label}`}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className={wide ? "sm:max-w-2xl" : undefined}>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${label}` : `New ${label}`}</DialogTitle>
        </DialogHeader>
        <RecordForm action={action} onSaved={() => setOpen(false)}>
          {children}
        </RecordForm>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The form lives inside the dialog content, which Radix unmounts on close, so every open starts clean.
 * The fieldset is disabled while saving: the dialog reads busy and a double submit is impossible.
 */
function RecordForm({
  action,
  onSaved,
  children,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  onSaved: () => void;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const wasPending = useRef(false);

  // Close only after a success: closing on submit would discard the error to read.
  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) onSaved();
    wasPending.current = pending;
  }, [pending, state, onSaved]);

  return (
    <form action={formAction}>
      <fieldset disabled={pending} className="min-w-0 space-y-3">
        {children}
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

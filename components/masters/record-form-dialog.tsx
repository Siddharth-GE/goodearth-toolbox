"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
  onDelete,
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
  /** An edit dialog's Delete, left of Cancel; the server refuses anything still in use, inside the confirm. */
  onDelete?: () => Promise<FormState>;
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
        <RecordForm
          action={action}
          onSaved={() => setOpen(false)}
          onDelete={isEdit ? onDelete : undefined}
          noun={label.toLowerCase()}
        >
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
  onDelete,
  noun,
  children,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  onSaved: () => void;
  onDelete?: () => Promise<FormState>;
  noun: string;
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
          {onDelete ? (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="ghost" className="text-danger mr-auto">
                  Delete
                </Button>
              }
              title={`Delete this ${noun}?`}
              description="It goes for good, only while nothing uses it. If something does, you'll be told what, and nothing changes."
              confirmLabel="Delete"
              pendingLabel="Deleting…"
              onConfirm={async () => {
                const result = await onDelete();
                if (!result?.error) onSaved();
                return result;
              }}
            />
          ) : null}
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">{pending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </fieldset>
    </form>
  );
}

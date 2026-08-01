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

/**
 * The create/edit dialog every Masters record uses.
 *
 * Seven of these existed — vendors, clients, stores, units, items, plots,
 * projects — and the outer 30 lines were identical in all seven, down to
 * the `wasPending` ref used to close the dialog only after a successful
 * save. Only the fields inside differed. Adding an eighth master meant
 * copying the whole thing again and hoping the copy stayed in step.
 *
 * Callers now supply the record's fields as children and nothing else:
 *
 *   <RecordFormDialog
 *     label="Vendor"
 *     isEdit={!!vendor}
 *     action={vendor ? updateVendor.bind(null, vendor.id) : createVendor}
 *   >
 *     …inputs…
 *   </RecordFormDialog>
 */
export function RecordFormDialog({
  label,
  isEdit,
  action,
  children,
  trigger,
  onOpen,
}: {
  /** Singular record name, e.g. "Vendor". Titles and buttons derive from it. */
  label: string;
  isEdit: boolean;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children: ReactNode;
  /** Override the default trigger button when a screen needs its own. */
  trigger?: ReactNode;
  /**
   * Called when the dialog opens, for the rare form holding state of its
   * own — Units filters its plot list by the chosen project and has to
   * reset that. Deliberately a handler on the open action rather than an
   * effect watching `open`.
   */
  onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);
  const wasPending = useRef(false);

  // Close only after a save that actually succeeded. Closing on submit
  // would throw away the error message the user needs to read.
  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${label}` : `New ${label}`}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          {children}
          <FormMessage error={state?.error} />
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Cancel</Button>
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

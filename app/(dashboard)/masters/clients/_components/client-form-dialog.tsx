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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ClientRow } from "@/lib/masters/clients";
import { createClientRecord, updateClientRecord } from "@/lib/masters/clients-actions";
import { useActionState, useEffect, useRef, useState } from "react";

export function ClientFormDialog({ client }: { client?: ClientRow }) {
  const [open, setOpen] = useState(false);
  const isEdit = !!client;
  const action = isEdit ? updateClientRecord.bind(null, client.id) : createClientRecord;
  const [state, formAction, pending] = useActionState(action, undefined);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isEdit ? "secondary" : "primary"}>{isEdit ? "Edit" : "New Client"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Client" : "New Client"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={client?.name} required autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mobile">Mobile</Label>
            <Input id="mobile" name="mobile" defaultValue={client?.mobile ?? ""} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" defaultValue={client?.email ?? ""} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" name="notes" defaultValue={client?.notes ?? ""} autoComplete="off" />
          </div>
          {state?.error && <p className="text-sm font-medium text-danger">{state.error}</p>}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
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

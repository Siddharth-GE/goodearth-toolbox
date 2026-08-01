"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import type { VendorRow } from "@/lib/masters/vendors";
import { createVendor, updateVendor } from "@/lib/masters/vendors-actions";
import { useActionState, useEffect, useRef, useState } from "react";

export function VendorFormDialog({ vendor }: { vendor?: VendorRow }) {
  const [open, setOpen] = useState(false);
  const isEdit = !!vendor;
  const action = isEdit ? updateVendor.bind(null, vendor.id) : createVendor;
  const [state, formAction, pending] = useActionState(action, undefined);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state?.error) setOpen(false);
    wasPending.current = pending;
  }, [pending, state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={isEdit ? "secondary" : "primary"}>{isEdit ? "Edit" : "New Vendor"}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Vendor" : "New Vendor"}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={vendor?.name} required autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact_name">Contact person</Label>
            <Input
              id="contact_name"
              name="contact_name"
              defaultValue={vendor?.contact_name ?? ""}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mobile">Mobile</Label>
            <Input
              id="mobile"
              name="mobile"
              defaultValue={vendor?.mobile ?? ""}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gst_no">GST number</Label>
            <Input
              id="gst_no"
              name="gst_no"
              defaultValue={vendor?.gst_no ?? ""}
              autoComplete="off"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              name="address"
              defaultValue={vendor?.address ?? ""}
              autoComplete="off"
            />
          </div>
          <label className="text-foreground flex items-center gap-2 text-sm">
            <Checkbox name="is_active" value="1" defaultChecked={vendor?.is_active ?? true} />
            Active
          </label>
          {state?.error && <p className="text-danger text-sm font-medium">{state.error}</p>}
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

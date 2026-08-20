"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { VendorRow } from "@/lib/masters/vendors";
import { createVendor, updateVendor } from "@/lib/masters/vendors-actions";

export function VendorFormDialog({ vendor }: { vendor?: VendorRow }) {
  const isEdit = !!vendor;

  return (
    <RecordFormDialog
      label="Vendor"
      isEdit={isEdit}
      action={isEdit ? updateVendor.bind(null, vendor.id) : createVendor}
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={vendor?.name} required autoComplete="off" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
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
          <Label htmlFor="contact_designation">Their role</Label>
          <Input
            id="contact_designation"
            name="contact_designation"
            defaultValue={vendor?.contact_designation ?? ""}
            autoComplete="off"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mobile">Mobile</Label>
          <Input id="mobile" name="mobile" defaultValue={vendor?.mobile ?? ""} autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={vendor?.email ?? ""}
            autoComplete="off"
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="gst_no">GST number</Label>
          <Input id="gst_no" name="gst_no" defaultValue={vendor?.gst_no ?? ""} autoComplete="off" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gst_state">GST state</Label>
          <Input
            id="gst_state"
            name="gst_state"
            defaultValue={vendor?.gst_state ?? ""}
            autoComplete="off"
          />
        </div>
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
      <div className="space-y-1.5">
        <Label htmlFor="payment_term_days">Payment terms (days of credit)</Label>
        <Input
          id="payment_term_days"
          name="payment_term_days"
          type="number"
          min={0}
          step={1}
          defaultValue={vendor?.payment_term_days ?? ""}
          autoComplete="off"
        />
      </div>
      <label className="text-foreground flex items-center gap-2 text-sm">
        <Checkbox name="is_contractor" value="1" defaultChecked={vendor?.is_contractor ?? false} />
        Contractor (does labour work at site)
      </label>
      <label className="text-foreground flex items-center gap-2 text-sm">
        <Checkbox name="is_active" value="1" defaultChecked={vendor?.is_active ?? true} />
        Active
      </label>
    </RecordFormDialog>
  );
}

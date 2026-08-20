"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { VendorPaymentDetails } from "@/lib/masters/vendor-detail";
import { saveVendorPaymentDetails } from "@/lib/masters/vendors-actions";

/**
 * Edits the vendor's bank details — the gated vendor_payment_details
 * row, never columns on the open vendors table. Clearing every field
 * and saving removes the details entirely.
 */
export function VendorPaymentDialog({
  vendorId,
  details,
}: {
  vendorId: string;
  details: VendorPaymentDetails | null;
}) {
  return (
    <RecordFormDialog
      label="Bank details"
      isEdit={!!details}
      action={saveVendorPaymentDetails.bind(null, vendorId)}
      trigger={<Button variant="secondary">{details ? "Edit" : "Add bank details"}</Button>}
    >
      <div className="space-y-1.5">
        <Label htmlFor="bank_name">Bank</Label>
        <Input
          id="bank_name"
          name="bank_name"
          defaultValue={details?.bank_name ?? ""}
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="account_number">Account number</Label>
        <Input
          id="account_number"
          name="account_number"
          defaultValue={details?.account_number ?? ""}
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="account_holder_name">Account holder</Label>
        <Input
          id="account_holder_name"
          name="account_holder_name"
          defaultValue={details?.account_holder_name ?? ""}
          autoComplete="off"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ifsc">IFSC</Label>
        <Input id="ifsc" name="ifsc" defaultValue={details?.ifsc ?? ""} autoComplete="off" />
      </div>
    </RecordFormDialog>
  );
}

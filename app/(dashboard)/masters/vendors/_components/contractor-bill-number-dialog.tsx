"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveContractorBillNumber } from "@/lib/masters/vendors-actions";

/** The last number on paper; the toolbox's first bill in this company takes the next one. Once bills count it, it only goes up. */
export function ContractorBillNumberDialog({
  vendorId,
  companyId,
  companyName,
  lastNo,
  appNumbering,
}: {
  vendorId: string;
  companyId: string;
  companyName: string;
  lastNo: number;
  appNumbering: boolean;
}) {
  return (
    <RecordFormDialog
      label="Last bill number"
      isEdit
      action={saveContractorBillNumber.bind(null, vendorId, companyId)}
      trigger={<Button variant="secondary">Edit</Button>}
    >
      <div className="space-y-1.5">
        <Label htmlFor="last_no">Last bill number in {companyName}</Label>
        <Input
          id="last_no"
          name="last_no"
          type="number"
          min={appNumbering ? lastNo : 0}
          step={1}
          inputMode="numeric"
          defaultValue={lastNo}
          autoComplete="off"
        />
        <p className="text-muted text-xs">
          {appNumbering
            ? "The toolbox is already counting this contractor's bills here. You can raise the number, never lower it."
            : "The number on this contractor's last paper bill here, 0 if there was none. The toolbox's first bill here takes the next one."}
        </p>
      </div>
    </RecordFormDialog>
  );
}

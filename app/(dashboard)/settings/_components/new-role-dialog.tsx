"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRole } from "@/lib/settings/roles-actions";

/**
 * A new role starts empty — name and approval rights here, then its
 * apps are ticked on the card. Two steps on purpose: sixteen tool
 * checkboxes inside a dialog is a wall, and a role with no apps yet is
 * harmless (it grants nothing until you add some).
 */
export function NewRoleDialog() {
  return (
    <RecordFormDialog label="Role" isEdit={false} action={createRole}>
      <div className="space-y-1.5">
        <Label htmlFor="name">Role name</Label>
        <Input id="name" name="name" required autoComplete="off" placeholder="e.g. Site Engineer" />
      </div>
      <label className="text-foreground flex items-center gap-2 text-sm">
        <Checkbox name="can_approve_indents" value="1" />
        Approves indents
      </label>
      <label className="text-foreground flex items-center gap-2 text-sm">
        <Checkbox name="can_approve_bills" value="1" />
        Approves bills
      </label>
      <div className="space-y-1.5">
        <Label htmlFor="bill_approval_limit">Bill approval limit (₹)</Label>
        <Input
          id="bill_approval_limit"
          name="bill_approval_limit"
          placeholder="No limit"
          inputMode="decimal"
        />
        <p className="text-muted text-xs">
          Only applies if the role approves bills. Blank means no limit.
        </p>
      </div>
      <p className="text-muted text-xs">Choose which apps the role includes after you create it.</p>
    </RecordFormDialog>
  );
}

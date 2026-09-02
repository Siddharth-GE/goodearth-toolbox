"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { recordMovement } from "@/lib/financial-management/actions";
import { MOVEMENT_KIND_LABELS, MOVEMENT_KINDS } from "@/lib/financial-management/kinds";
import { todayInIndia } from "@/lib/format";

/** Record a drawdown, repayment or interest payment against one facility. */
export function MovementFormDialog({ facilityId }: { facilityId: string }) {
  return (
    <RecordFormDialog
      label="movement"
      isEdit={false}
      action={recordMovement.bind(null, facilityId)}
      trigger={<Button>Record movement</Button>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="movement-kind">What happened</Label>
          <Select id="movement-kind" name="kind" required defaultValue="">
            <option value="" disabled>
              Pick one…
            </option>
            {MOVEMENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {MOVEMENT_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="movement-date">On</Label>
          <Input
            id="movement-date"
            name="happened_on"
            type="date"
            required
            defaultValue={todayInIndia()}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="movement-amount">Amount, ₹</Label>
        <Input
          id="movement-amount"
          name="amount"
          inputMode="decimal"
          required
          autoFocus
          placeholder="25,00,000"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="movement-reference">Reference</Label>
          <Input
            id="movement-reference"
            name="reference"
            maxLength={2000}
            placeholder="UTR / cheque no."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="movement-note">Note</Label>
          <Input id="movement-note" name="note" maxLength={2000} placeholder="Optional" />
        </div>
      </div>
    </RecordFormDialog>
  );
}

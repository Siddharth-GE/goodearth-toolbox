"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchSelect, type SearchOption } from "@/components/ui/search-select";
import { Select } from "@/components/ui/select";
import { addExpense, updateExpense } from "@/lib/birdwing-books/actions";
import type { ExpenseRow, HeadRow } from "@/lib/birdwing-books/queries";
import { useState, type ReactNode } from "react";

/**
 * One expense line: the month it belongs to (apart from the day it was
 * paid — October's power bill is paid in November), the head, what it
 * was, the amount, and who was paid — a Masters vendor, or just a name.
 */
export function ExpenseDialog({
  heads,
  vendors,
  month,
  expense,
  trigger,
}: {
  heads: HeadRow[];
  vendors: SearchOption[];
  month: string;
  expense?: ExpenseRow;
  trigger?: ReactNode;
}) {
  return (
    <RecordFormDialog
      label="expense line"
      isEdit={Boolean(expense)}
      trigger={trigger}
      action={expense ? updateExpense.bind(null, expense.id) : addExpense}
    >
      <ExpenseFields heads={heads} vendors={vendors} month={month} expense={expense} />
    </RecordFormDialog>
  );
}

function ExpenseFields({
  heads,
  vendors,
  month,
  expense,
}: {
  heads: HeadRow[];
  vendors: SearchOption[];
  month: string;
  expense?: ExpenseRow;
}) {
  const [vendorId, setVendorId] = useState(expense?.vendorId ?? "");
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="e-month">Belongs to</Label>
          <Input
            id="e-month"
            name="accounting_month"
            type="month"
            defaultValue={(expense?.month ?? month).slice(0, 7)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-head">Head</Label>
          <Select
            id="e-head"
            name="head_id"
            defaultValue={expense?.headId ?? heads[0]?.id}
            required
          >
            {heads.map((head) => (
              <option key={head.id} value={head.id}>
                {head.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="e-description">What for</Label>
        <Input
          id="e-description"
          name="description"
          defaultValue={expense?.description}
          required
          maxLength={200}
          placeholder="e.g. Vegetables and fish"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="e-amount">Amount (₹)</Label>
          <Input
            id="e-amount"
            name="amount"
            inputMode="decimal"
            defaultValue={expense ? String(expense.amount) : ""}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-date">Paid on</Label>
          <Input id="e-date" name="spent_on" type="date" defaultValue={expense?.spentOn ?? ""} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="e-vendor">Vendor</Label>
        <SearchSelect
          id="e-vendor"
          name="vendor_id"
          options={vendors}
          value={vendorId}
          onChange={setVendorId}
          placeholder="Type a vendor from Masters…"
          emptyHint="Optional — or type a name below"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="e-payee">Paid to</Label>
          <Input
            id="e-payee"
            name="payee"
            defaultValue={expense?.payee ?? ""}
            maxLength={120}
            placeholder="A shop, a person"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-billref">Bill number</Label>
          <Input
            id="e-billref"
            name="bill_ref"
            defaultValue={expense?.billRef ?? ""}
            maxLength={60}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="e-payment">How it was paid</Label>
        <Input
          id="e-payment"
          name="payment_details"
          defaultValue={expense?.paymentDetails ?? ""}
          maxLength={200}
          placeholder="Cash by Amal, UPI ref…"
        />
      </div>
    </>
  );
}

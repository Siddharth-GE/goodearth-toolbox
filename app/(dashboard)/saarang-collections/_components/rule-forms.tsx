"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import type { ActionState } from "@/lib/action-state";
import {
  addCorrection,
  addExcludedReceipt,
  addExtraUnit,
  removeRule,
  saveRules,
} from "@/lib/saarang-collections/actions";
import type { Rules } from "@/lib/saarang-collections/core";
import { useState, useTransition, type ReactNode } from "react";
import { useFormSubmit } from "./use-form-submit";

const SOLD_FIELDS = (
  <>
    <option value="price">Unit/Plot Price (before GST)</option>
    <option value="incl">Cost incl. GST</option>
  </>
);

/** The settings row: test units, milestone values, sold value. One Save for all three panels. */
export function RulesForm({ rules }: { rules: Rules }) {
  const form = useFormSubmit(saveRules);

  const test = (
    <div className="space-y-1.5">
      <Label htmlFor="test_suffix">Unit ending</Label>
      <Input
        id="test_suffix"
        name="test_suffix"
        defaultValue={rules.test_suffix}
        placeholder="-100"
        maxLength={20}
        className="w-36"
      />
    </div>
  );
  const milestones = (
    <div className="space-y-3">
      <label className="flex cursor-pointer items-center gap-2.5 text-sm">
        <Checkbox name="dedupe" defaultChecked={rules.dedupe} />
        Drop stale duplicate schedules
      </label>
      <div className="flex flex-wrap gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="gst_plot">Plot GST added (%)</Label>
          <Input
            id="gst_plot"
            name="gst_plot"
            type="number"
            min={0}
            max={100}
            step={0.5}
            defaultValue={rules.gst_plot}
            className="w-32"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gst_villa">Villa GST added (%)</Label>
          <Input
            id="gst_villa"
            name="gst_villa"
            type="number"
            min={0}
            max={100}
            step={0.5}
            defaultValue={rules.gst_villa}
            className="w-32"
          />
        </div>
      </div>
    </div>
  );
  const sold = (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor="sold_field_plot">Plot uses</Label>
        <Select id="sold_field_plot" name="sold_field_plot" defaultValue={rules.sold_field_plot}>
          {SOLD_FIELDS}
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="sold_field_villa">Villa uses</Label>
        <Select id="sold_field_villa" name="sold_field_villa" defaultValue={rules.sold_field_villa}>
          {SOLD_FIELDS}
        </Select>
      </div>
    </div>
  );

  return (
    <form onSubmit={form.onSubmit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Section
          title="Test units"
          note="Units ending with this are left out of every number: sold units, milestones and outstanding invoices."
        >
          {test}
        </Section>
        <Section
          title="Milestone values"
          note="When a unit has the same milestone twice, keep the completed one and drop the not-started copy. GST is added on top of the Milestone Amount for Invoice value and OL-Collection."
        >
          {milestones}
        </Section>
        <Section
          title="Sold value"
          note="Units that have milestones but are missing from the Sold Units report are valued at their milestone total."
          className="md:col-span-2"
        >
          {sold}
        </Section>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={form.pending}>
          {form.pending ? "Saving…" : "Save the rules"}
        </Button>
        <FormMessage error={form.error} success={form.saved ? "Saved." : null} />
      </div>
    </form>
  );
}

function AddForm({
  action,
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  children: ReactNode;
}) {
  const form = useFormSubmit(action, { reset: true });
  return (
    <form onSubmit={form.onSubmit} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {children}
        <Button type="submit" variant="secondary" disabled={form.pending}>
          {form.pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <FormMessage error={form.error} />
    </form>
  );
}

export function ExcludedForm() {
  return (
    <AddForm action={addExcludedReceipt}>
      <Input
        name="receipt_no"
        placeholder="RCT-SAARANG-0000"
        aria-label="Receipt number"
        className="min-w-40 flex-1"
        required
      />
      <Input name="reason" placeholder="Reason" aria-label="Reason" className="min-w-40 flex-[2]" />
    </AddForm>
  );
}

export function CorrectionForm() {
  return (
    <AddForm action={addCorrection}>
      <Input
        name="unit"
        placeholder="SAARANG-PLOT-07"
        aria-label="Unit"
        className="min-w-36 flex-1"
        required
      />
      <Input
        name="stage"
        placeholder="Stage, like On Sale Deed"
        aria-label="Milestone stage"
        className="min-w-36 flex-1"
      />
      <Input
        name="delta"
        inputMode="numeric"
        placeholder="-1,00,000"
        aria-label="Amount to add or take off"
        className="min-w-28 flex-1"
        required
      />
      <Input name="note" placeholder="Note" aria-label="Note" className="min-w-36 flex-1" />
    </AddForm>
  );
}

export function ExtraUnitForm() {
  return (
    <AddForm action={addExtraUnit}>
      <Input
        name="unit"
        placeholder="SAARANG-PLOT-29"
        aria-label="Unit"
        className="min-w-36 flex-1"
        required
      />
      <Input
        name="applicant"
        placeholder="Applicant"
        aria-label="Applicant"
        className="min-w-32 flex-1"
      />
      <Input
        name="sold_value"
        inputMode="numeric"
        placeholder="Sold value"
        aria-label="Sold value"
        className="min-w-28 flex-1"
        required
      />
      <Input
        name="completed"
        inputMode="numeric"
        placeholder="Completed milestones"
        aria-label="Completed milestones"
        className="min-w-36 flex-1"
      />
      <Input
        name="pending"
        inputMode="numeric"
        placeholder="Pending milestones"
        aria-label="Pending milestones"
        className="min-w-36 flex-1"
      />
      <Input name="note" placeholder="Note" aria-label="Note" className="min-w-32 flex-1" />
    </AddForm>
  );
}

export function RemoveButton({ list, id }: { list: Parameters<typeof removeRule>[0]; id: string }) {
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  return (
    <div className="text-right">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await removeRule(list, id);
            setError(result?.error);
          })
        }
      >
        {pending ? "Removing…" : "Remove"}
      </Button>
      <FormMessage error={error} size="xs" />
    </div>
  );
}

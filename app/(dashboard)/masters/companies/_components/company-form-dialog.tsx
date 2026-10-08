"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CompanyRow } from "@/lib/masters/companies";
import { createCompany, updateCompany } from "@/lib/masters/companies-actions";

export function CompanyFormDialog({ company }: { company?: CompanyRow }) {
  const isEdit = !!company;

  return (
    <RecordFormDialog
      label="Company"
      wide
      isEdit={isEdit}
      action={isEdit ? updateCompany.bind(null, company.id) : createCompany}
    >
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          defaultValue={company?.name}
          required
          autoComplete="off"
          placeholder="Goodearth"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="legal_name">Legal name</Label>
        <Input
          id="legal_name"
          name="legal_name"
          defaultValue={company?.legal_name ?? ""}
          autoComplete="off"
        />
        <p className="text-muted text-xs">As registered — printed at the top of every document.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="address">Registered address</Label>
        <Textarea
          id="address"
          name="address"
          rows={3}
          defaultValue={company?.address ?? ""}
          autoComplete="off"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="gstin">GSTIN</Label>
          <Input
            id="gstin"
            name="gstin"
            defaultValue={company?.gstin ?? ""}
            autoComplete="off"
            maxLength={20}
            className="font-mono uppercase"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="state">State</Label>
          <Input
            id="state"
            name="state"
            defaultValue={company?.state ?? "Kerala"}
            required
            autoComplete="off"
          />
        </div>
      </div>
      <p className="text-muted text-xs">
        A PO compares this state with the vendor&apos;s GST state: the same state is charged CGST +
        SGST, another state IGST. Spell it the way vendors&apos; states are written, e.g. Kerala.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={company?.phone ?? ""}
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={company?.email ?? ""}
            autoComplete="off"
          />
        </div>
      </div>
      <label className="text-foreground flex items-center gap-2 text-sm">
        <Checkbox name="is_active" value="1" defaultChecked={company?.is_active ?? true} />
        Active — can be chosen for a project
      </label>
    </RecordFormDialog>
  );
}

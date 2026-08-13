"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createFacility, updateFacility } from "@/lib/financial-management/actions";
import { FACILITY_KIND_LABELS, FACILITY_KINDS } from "@/lib/financial-management/kinds";

export type FacilityFormValues = {
  id: string;
  party: string;
  kind: string;
  interestRatePct: number | null;
  startDate: string | null;
  sanctionedAmount: number | null;
  terms: string | null;
};

/**
 * Create and edit share one form. A successful create REDIRECTS into the
 * new facility (so the close-on-success is moot); a successful edit
 * closes and the action's revalidate re-renders the page underneath.
 */
export function FacilityFormDialog({ facility }: { facility?: FacilityFormValues }) {
  return (
    <RecordFormDialog
      label="facility"
      isEdit={!!facility}
      action={facility ? updateFacility.bind(null, facility.id) : createFacility}
    >
      <div className="space-y-1.5">
        <Label htmlFor="facility-party">Bank or investor</Label>
        <Input
          id="facility-party"
          name="party"
          required
          maxLength={120}
          autoFocus
          defaultValue={facility?.party}
          placeholder="Federal Bank — term loan"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="facility-kind">Kind</Label>
          <Select id="facility-kind" name="kind" required defaultValue={facility?.kind ?? ""}>
            <option value="" disabled>
              Pick one…
            </option>
            {FACILITY_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {FACILITY_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="facility-rate">Interest, % a year</Label>
          <Input
            id="facility-rate"
            name="interest_rate_pct"
            inputMode="decimal"
            defaultValue={facility?.interestRatePct ?? ""}
            placeholder="12.5"
          />
          <p className="text-muted text-xs">Blank for equity or a deal with no set rate.</p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="facility-start">Start date</Label>
          <Input
            id="facility-start"
            name="start_date"
            type="date"
            defaultValue={facility?.startDate ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="facility-sanctioned">Sanctioned amount, ₹</Label>
          <Input
            id="facility-sanctioned"
            name="sanctioned_amount"
            inputMode="decimal"
            defaultValue={facility?.sanctionedAmount ?? ""}
            placeholder="2,00,00,000"
          />
          <p className="text-muted text-xs">Blank if no cap was agreed.</p>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="facility-terms">Terms</Label>
        <Textarea
          id="facility-terms"
          name="terms"
          rows={3}
          maxLength={2000}
          defaultValue={facility?.terms ?? ""}
          placeholder="Repayment schedule, security, covenants — in your own words."
        />
      </div>
    </RecordFormDialog>
  );
}

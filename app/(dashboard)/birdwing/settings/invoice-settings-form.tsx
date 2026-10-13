"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldRow, Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { BirdwingSettings } from "@/lib/birdwing/queries";
import { saveInvoiceSettings } from "@/lib/birdwing/settings-actions";
import Link from "next/link";
import { useActionState } from "react";

/**
 * What every invoice prints besides its lines. The letterhead is a Masters
 * company — its legal name, address and GSTIN are kept there, once, and
 * never typed here (PRODUCT.md). Bank, UPI and the cancellation policy
 * are typed here once. An issued invoice keeps what was printed on it;
 * a change here reaches only the next one.
 */
export function InvoiceSettingsForm({
  settings,
  companies,
}: {
  settings: BirdwingSettings;
  companies: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(saveInvoiceSettings, undefined);

  return (
    <Section
      title="On every invoice"
      note={
        settings.company
          ? `Issued by ${settings.company.legal_name || settings.company.name}${settings.company.gstin ? ` · GSTIN ${settings.company.gstin}` : " · no GSTIN in Masters yet"}`
          : "No invoicing company yet — nothing can be issued until one is chosen."
      }
    >
      <form action={formAction} className="space-y-3">
        <fieldset disabled={pending} className="space-y-3">
          <FieldRow cols={2}>
            <div className="space-y-1.5">
              <Label htmlFor="s-company">Invoicing company</Label>
              <Select id="s-company" name="company_id" defaultValue={settings.companyId ?? ""}>
                <option value="">Not chosen</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </Select>
              <p className="text-muted text-xs">
                Not in the list? Add Maloor Eco Farms in{" "}
                <Link href="/masters/companies" className="text-accent">
                  Masters → Companies
                </Link>{" "}
                with its address and GSTIN.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-supply">Place of supply</Label>
              <Input
                id="s-supply"
                name="place_of_supply"
                defaultValue={settings.placeOfSupply ?? ""}
                maxLength={120}
                placeholder="e.g. Tholambra, Kannur, Kerala (32)"
              />
            </div>
          </FieldRow>
          <FieldRow cols={2}>
            <div className="space-y-1.5">
              <Label htmlFor="s-bank">Bank details</Label>
              <Textarea
                id="s-bank"
                name="bank_details"
                rows={4}
                maxLength={600}
                defaultValue={settings.bankDetails ?? ""}
                placeholder={"Account name\nBank · branch\nAccount number\nIFSC"}
              />
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="s-upi">UPI ID</Label>
                <Input
                  id="s-upi"
                  name="upi_id"
                  defaultValue={settings.upiId ?? ""}
                  maxLength={80}
                />
              </div>
              <FieldRow cols={2}>
                <div className="space-y-1.5">
                  <Label htmlFor="s-in">Check-in from</Label>
                  <Input
                    id="s-in"
                    name="checkin_time"
                    type="time"
                    defaultValue={settings.checkinTime ?? ""}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="s-out">Check-out by</Label>
                  <Input
                    id="s-out"
                    name="checkout_time"
                    type="time"
                    defaultValue={settings.checkoutTime ?? ""}
                  />
                </div>
              </FieldRow>
            </div>
          </FieldRow>
          <div className="space-y-1.5">
            <Label htmlFor="s-terms">Terms and cancellation policy</Label>
            <Textarea
              id="s-terms"
              name="invoice_terms"
              rows={4}
              maxLength={2000}
              defaultValue={settings.invoiceTerms ?? ""}
            />
          </div>
        </fieldset>
        <FormMessage error={state?.error} />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

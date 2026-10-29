"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { Textarea } from "@/components/ui/textarea";
import { useUndoBar } from "@/components/ui/undo-bar";
import { deleteVendor, restoreVendor, updateVendor } from "@/lib/kaadal-billing/actions";
import type { Vendor } from "@/lib/kaadal-billing/ledger";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CopyButton } from "./copy-button";

/** A vendor's name and bank details, each saved as the person leaves the field. */
export function VendorForm({ vendor, canDelete }: { vendor: Vendor; canDelete: boolean }) {
  const router = useRouter();
  const show = useUndoBar();
  const [pending, start] = useTransition();
  const [name, setName] = useState(vendor.name);
  const [bank, setBank] = useState(vendor.bank);
  const [error, setError] = useState<string | null>(null);

  const save = (field: "name" | "bank", value: string) => {
    if (value.trim() === vendor[field]) return;
    start(async () => {
      const result = await updateVendor(vendor.id, field, value);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setError(null);
      const before = vendor[field];
      show(field === "bank" ? "Bank details saved" : "Vendor name saved", () =>
        start(async () => {
          const back = await updateVendor(vendor.id, field, before);
          if (back?.error) show(back.error);
          else if (field === "name") setName(before);
          else setBank(before);
        }),
      );
    });
  };

  return (
    <Section title="Vendor details" note="Changes save when you leave the field.">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="vendor-name">Name</Label>
          <Input
            id="vendor-name"
            maxLength={60}
            value={name}
            aria-invalid={Boolean(error) || undefined}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => save("name", name)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vendor-bank">Bank details</Label>
          <Textarea
            id="vendor-bank"
            rows={6}
            maxLength={1000}
            className="font-mono text-xs"
            placeholder="Account name, bank, A/C no., IFSC, branch, UPI"
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            onBlur={() => save("bank", bank)}
          />
        </div>
        <FormMessage error={error} />
        <div className="flex flex-wrap items-center gap-2">
          {bank.trim() ? <CopyButton text={bank} label="Copy bank details" /> : null}
          {canDelete ? (
            <Button
              variant="danger"
              size="sm"
              className="ml-auto"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  // Leave first: the delete refreshes this page, which would otherwise flash "not found".
                  router.push("/kaadal-billing/vendors");
                  const result = await deleteVendor(vendor.id);
                  if (result?.error) {
                    show(result.error);
                    return;
                  }
                  show("Vendor deleted", () =>
                    start(async () => {
                      const back = await restoreVendor(vendor);
                      if (back?.error) show(back.error);
                    }),
                  );
                })
              }
            >
              Delete vendor
            </Button>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

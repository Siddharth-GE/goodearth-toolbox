"use client";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { FieldRow, Section } from "@/components/ui/section";
import { Select } from "@/components/ui/select";
import { UploadButton } from "@/components/ui/upload-button";
import { removeSignature, saveBillSigners, uploadSignature } from "@/lib/bills/signature-actions";
import type { SignatureSettings } from "@/lib/bills/signature-queries";
import { SIGNER_SLOTS } from "@/lib/bills/signatures";
import { useActionState, useState } from "react";

export function SignaturesForm({ settings }: { settings: SignatureSettings }) {
  const [state, formAction, pending] = useActionState(saveBillSigners, undefined);
  const [person, setPerson] = useState("");
  const signed = new Set(settings.kept.map((one) => one.userId));
  const unsigned = (id: string | null) => id != null && !signed.has(id);

  return (
    <div className="space-y-4">
      <Section
        title="Who signs every bill"
        note="Leave a box on Nobody and it prints as a blank line to sign by hand."
      >
        <form action={formAction} className="space-y-3">
          <fieldset disabled={pending}>
            <FieldRow cols={3}>
              {SIGNER_SLOTS.map((slot) => (
                <div key={slot.key} className="space-y-1.5">
                  <Label htmlFor={`signer-${slot.key}`}>{slot.label}</Label>
                  <Select
                    id={`signer-${slot.key}`}
                    name={slot.column}
                    defaultValue={settings.signers[slot.key] ?? ""}
                  >
                    <option value="">Nobody</option>
                    {settings.people.map((one) => (
                      <option key={one.id} value={one.id}>
                        {one.name}
                      </option>
                    ))}
                  </Select>
                  {unsigned(settings.signers[slot.key]) && (
                    <p className="text-muted text-xs">
                      No signature uploaded yet — their name prints alone.
                    </p>
                  )}
                </div>
              ))}
            </FieldRow>
          </fieldset>
          <FormMessage error={state?.error} />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Section>

      <Section
        title="Signatures on file"
        note="A signature on a white background, cropped close. Approvers need one too: it prints on the bills they approve."
      >
        <div className="space-y-4">
          {settings.kept.length === 0 ? (
            <p className="text-muted text-sm">No signatures uploaded yet.</p>
          ) : (
            <ul className="divide-border divide-y">
              {settings.kept.map((one) => (
                <li key={one.userId} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-foreground text-sm font-medium">{one.name}</p>
                    {one.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={one.url}
                        alt={`${one.name}'s signature`}
                        className="border-border h-12 w-auto max-w-[220px] rounded border object-contain"
                      />
                    ) : (
                      <p className="text-muted text-xs">The picture could not be shown.</p>
                    )}
                  </div>
                  <ConfirmDialog
                    trigger={
                      <Button variant="secondary" size="sm">
                        Remove
                      </Button>
                    }
                    title={`Remove ${one.name}'s signature?`}
                    description="Bills printed from now on show their name with a blank line. PDFs already downloaded keep it."
                    confirmLabel="Remove it"
                    pendingLabel="Removing…"
                    onConfirm={() => removeSignature(one.userId)}
                  />
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="signature-person">Upload or replace a signature</Label>
            <div className="flex flex-wrap items-start gap-2">
              <Select
                id="signature-person"
                value={person}
                onChange={(event) => setPerson(event.target.value)}
                className="w-auto min-w-[220px]"
              >
                <option value="">Choose a person</option>
                {settings.people.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name}
                    {signed.has(one.id) ? " (replace)" : ""}
                  </option>
                ))}
              </Select>
              {person && (
                <UploadButton
                  action={uploadSignature}
                  fields={{ user_id: person }}
                  label="Choose the picture"
                  photo
                />
              )}
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

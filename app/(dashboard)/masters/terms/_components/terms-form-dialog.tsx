"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TERMS_KIND_LABEL, TERMS_KINDS, type TermsKind } from "@/lib/masters/constants";
import type { DocumentTermsRow } from "@/lib/masters/terms";
import { createTerms, updateTerms } from "@/lib/masters/terms-actions";

export function TermsFormDialog({
  terms,
  kind,
}: {
  terms?: DocumentTermsRow;
  /** Which list the New button sits on — the form starts on that kind. */
  kind?: TermsKind;
}) {
  const isEdit = !!terms;

  return (
    <RecordFormDialog
      label="Terms"
      wide
      isEdit={isEdit}
      action={isEdit ? updateTerms.bind(null, terms.id) : createTerms}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="kind">For</Label>
          <Select id="kind" name="kind" defaultValue={terms?.kind ?? kind ?? "po"}>
            {TERMS_KINDS.map((value) => (
              <option key={value} value={value}>
                {TERMS_KIND_LABEL[value]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={terms?.name}
            required
            autoComplete="off"
            placeholder="Standard supply terms"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="body">Terms and conditions</Label>
        <Textarea id="body" name="body" rows={12} defaultValue={terms?.body} required />
        <p className="text-muted text-xs">
          Copied onto each new document, where it can still be edited. Changing it here never
          rewrites a document already made.
        </p>
      </div>
      <label className="text-foreground flex items-center gap-2 text-sm">
        <Checkbox name="is_default" value="1" defaultChecked={terms?.is_default ?? false} />
        The default — new documents start with these terms
      </label>
      <label className="text-foreground flex items-center gap-2 text-sm">
        <Checkbox name="is_active" value="1" defaultChecked={terms?.is_active ?? true} />
        Active — can be chosen on a document
      </label>
    </RecordFormDialog>
  );
}

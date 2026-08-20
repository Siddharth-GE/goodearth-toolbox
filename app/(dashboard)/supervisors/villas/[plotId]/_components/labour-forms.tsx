"use client";

import { RecordFormDialog } from "@/components/masters/record-form-dialog";
import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { deleteLabourLog, recordLabourLog, updateLabourLog } from "@/lib/supervisors/actions";
import type { ContractorOption, LabourLogRow, WorkOption } from "@/lib/supervisors/queries";
import { useState, useTransition } from "react";

/** Works flattened server-side; the select groups them by category. */
function WorkSelect({
  works,
  name,
  defaultValue,
}: {
  works: WorkOption[];
  name: string;
  defaultValue?: string;
}) {
  const categories = [...new Set(works.map((work) => work.categoryName))];
  return (
    <Select name={name} defaultValue={defaultValue ?? ""} required>
      <option value="" disabled>
        Pick the work…
      </option>
      {categories.map((category) => (
        <optgroup key={category} label={category}>
          {works
            .filter((work) => work.categoryName === category)
            .map((work) => (
              <option key={work.id} value={work.id}>
                {work.label}
              </option>
            ))}
        </optgroup>
      ))}
    </Select>
  );
}

function CountField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type="number"
        inputMode="numeric"
        min={0}
        max={999}
        step={1}
        defaultValue={defaultValue ?? 0}
      />
    </div>
  );
}

export function LabourLogDialog({
  plotId,
  works,
  contractors,
  log,
  workItemId,
  trigger,
}: {
  plotId: string;
  works: WorkOption[];
  contractors: ContractorOption[];
  /** Present = edit that entry; absent = log a new day. */
  log?: LabourLogRow;
  workItemId?: string;
  trigger?: React.ReactNode;
}) {
  const isEdit = !!log;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <RecordFormDialog
      label="Labour log"
      isEdit={isEdit}
      action={isEdit ? updateLabourLog : recordLabourLog}
      trigger={trigger ?? <Button variant="primary">Log labour</Button>}
    >
      <input type="hidden" name="plot_id" value={plotId} />
      {isEdit && <input type="hidden" name="id" value={log.id} />}

      <div className="space-y-1.5">
        <Label htmlFor="log_date">Date</Label>
        <Input
          id="log_date"
          name="log_date"
          type="date"
          defaultValue={log?.logDate ?? today}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="work_item_id">Work</Label>
        <WorkSelect
          works={works}
          name="work_item_id"
          defaultValue={log?.workItemId ?? workItemId}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contractor_id">Contractor</Label>
        <Select name="contractor_id" defaultValue={log?.contractorId ?? ""} required>
          <option value="" disabled>
            Pick the contractor…
          </option>
          {contractors.map((contractor) => (
            <option key={contractor.id} value={contractor.id}>
              {contractor.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <CountField name="masons" label="Masons" defaultValue={log?.masons} />
        <CountField name="helpers" label="Helpers" defaultValue={log?.helpers} />
        <CountField name="others" label="Others" defaultValue={log?.others} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="note">Note (optional)</Label>
        <Textarea id="note" name="note" rows={2} defaultValue={log?.note ?? ""} />
      </div>
    </RecordFormDialog>
  );
}

export function DeleteLabourLogButton({ logId }: { logId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <span className="inline-flex items-center gap-2">
      <FormMessage error={error} />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await deleteLabourLog(logId);
            setError(result?.error);
          })
        }
      >
        Delete
      </Button>
    </span>
  );
}

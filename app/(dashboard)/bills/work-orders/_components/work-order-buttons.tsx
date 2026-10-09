"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { approveLabourContract, setLabourContractActive } from "@/lib/bills/actions";
import {
  saveWorkOrderAsTemplate,
  setWorkOrderTemplateActive,
} from "@/lib/bills/work-order-actions";
import { useState, useTransition } from "react";

type Result = { error?: string } | undefined;

/**
 * A work order's actions: approve (bill approvers only — the database
 * re-checks, limit included) and the off-switch. Correcting an approved
 * order is switching it off and making a new one.
 */
export function WorkOrderActions({
  orderId,
  isActive,
  showApprove,
}: {
  orderId: string;
  isActive: boolean;
  showApprove: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const run = (action: () => Promise<Result>) =>
    startTransition(async () => {
      setError(undefined);
      const result = await action();
      if (result?.error) setError(result.error);
    });

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {showApprove && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => run(() => approveLabourContract(orderId))}
          >
            {pending ? "Approving…" : "Approve"}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(() => setLabourContractActive(orderId, !isActive))}
        >
          {isActive ? "Switch off" : "Switch back on"}
        </Button>
      </div>
      <FormMessage error={error} size="xs" />
    </div>
  );
}

/** "Save as template": a name, and the order's works and terms are kept for next time. */
export function SaveAsTemplate({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState(false);
  const [saving, startSaving] = useTransition();

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Save as template
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Template name, e.g. Masonry — standard"
        className="h-9 w-64"
        aria-label="Template name"
        autoFocus
      />
      <Button
        size="sm"
        disabled={saving || !name.trim()}
        onClick={() =>
          startSaving(async () => {
            setError(undefined);
            const result = await saveWorkOrderAsTemplate(orderId, name);
            if (result?.error) {
              setError(result.error);
              return;
            }
            setDone(true);
            setOpen(false);
            setName("");
          })
        }
      >
        {saving ? "Saving…" : "Save"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        Cancel
      </Button>
      <FormMessage error={error} success={done ? "Template saved" : undefined} size="xs" />
    </div>
  );
}

/** The templates screen's on/off switch. */
export function TemplateSwitch({
  templateId,
  isActive,
}: {
  templateId: string;
  isActive: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <span className="inline-flex items-center gap-2">
      <FormMessage error={error} size="xs" />
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await setWorkOrderTemplateActive(templateId, !isActive);
            setError(result?.error);
          })
        }
      >
        {isActive ? "Switch off" : "Switch back on"}
      </Button>
    </span>
  );
}

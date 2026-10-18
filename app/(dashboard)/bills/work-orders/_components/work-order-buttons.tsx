"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { approveLabourContract, setLabourContractActive } from "@/lib/bills/actions";
import {
  saveWorkOrderAsTemplate,
  setWorkOrderTemplateActive,
} from "@/lib/bills/work-order-actions";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { useState } from "react";

// Approve is for bill approvers only (the database re-checks, limit included). Correcting an approved order means switching it off and making a new one.
export function WorkOrderActions({
  orderId,
  isActive,
  showApprove,
}: {
  orderId: string;
  isActive: boolean;
  showApprove: boolean;
}) {
  const { pending, error, run } = useActionRunner();

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

export function SaveAsTemplate({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [done, setDone] = useState(false);
  const { pending: saving, error, run } = useActionRunner();

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
        onClick={async () => {
          const result = await run(() => saveWorkOrderAsTemplate(orderId, name));
          if (result?.error) return;
          setDone(true);
          setOpen(false);
          setName("");
        }}
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

export function TemplateSwitch({
  templateId,
  isActive,
}: {
  templateId: string;
  isActive: boolean;
}) {
  const { pending, error, run } = useActionRunner();
  return (
    <span className="inline-flex items-center gap-2">
      <FormMessage error={error} size="xs" />
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => run(() => setWorkOrderTemplateActive(templateId, !isActive))}
      >
        {isActive ? "Switch off" : "Switch back on"}
      </Button>
    </span>
  );
}

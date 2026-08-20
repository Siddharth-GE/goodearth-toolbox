"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Select } from "@/components/ui/select";
import { retagIssueWork } from "@/lib/inventory/actions";
import { useState, useTransition } from "react";

type WorkOption = { id: string; code: string; name: string; category: string };

/**
 * Fix which work a plot issue was tagged with (0080). A label fix with
 * no quantity effect — the audit trail records the change — which is
 * why this is allowed while everything else on an issue is permanent.
 */
export function RetagWork({
  issueId,
  workItemId,
  works,
}: {
  issueId: string;
  workItemId: string | null;
  works: WorkOption[];
}) {
  const [value, setValue] = useState(workItemId ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const categories = [...new Set(works.map((work) => work.category))];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setSaved(false);
        }}
        aria-label="Work this issue served"
        className="max-w-xs"
      >
        <option value="">Pick the work…</option>
        {categories.map((category) => (
          <optgroup key={category} label={category}>
            {works
              .filter((work) => work.category === category)
              .map((work) => (
                <option key={work.id} value={work.id}>
                  {work.code} — {work.name}
                </option>
              ))}
          </optgroup>
        ))}
      </Select>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending || !value || value === workItemId}
        onClick={() =>
          startTransition(async () => {
            const result = await retagIssueWork(issueId, value);
            setError(result?.error);
            setSaved(!result?.error);
          })
        }
      >
        {pending ? "Saving…" : "Save"}
      </Button>
      <FormMessage error={error} success={saved ? "Saved" : undefined} size="xs" />
    </div>
  );
}

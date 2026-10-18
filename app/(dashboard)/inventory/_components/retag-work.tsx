"use client";

import { Button } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/form-message";
import { Select } from "@/components/ui/select";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { retagIssueWork } from "@/lib/inventory/actions";
import { useState } from "react";

type WorkOption = { id: string; code: string; name: string; category: string };

/** A label fix with no quantity effect (audited), so allowed while the rest of an issue is permanent (0080). */
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
  const { pending, error, run } = useActionRunner();
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
        onClick={async () => {
          setSaved(false);
          const result = await run(() => retagIssueWork(issueId, value));
          setSaved(!result?.error);
        }}
      >
        {pending ? "Saving…" : "Save"}
      </Button>
      <FormMessage error={error} success={saved ? "Saved" : undefined} size="xs" />
    </div>
  );
}

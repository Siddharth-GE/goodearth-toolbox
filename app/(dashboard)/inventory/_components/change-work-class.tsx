"use client";

import { ChoiceChips } from "@/components/ui/choice-chips";
import { FormMessage } from "@/components/ui/form-message";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { setIssueWorkClass } from "@/lib/inventory/actions";
import { WORK_CLASSES, WORK_CLASS_LABEL, type WorkClass } from "@/lib/masters/work-classes";
import { useState } from "react";

/** Beside Retag work: what the issue was for, one tap to correct (0132). A label fix with no quantity effect. */
export function ChangeWorkClass({ issueId, workClass }: { issueId: string; workClass: WorkClass }) {
  const [value, setValue] = useState<WorkClass>(workClass);
  const [saved, setSaved] = useState(false);
  const { pending, error, run } = useActionRunner();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ChoiceChips
        label="What this issue was for"
        required
        disabled={pending}
        options={WORK_CLASSES.map((option) => ({ value: option, label: WORK_CLASS_LABEL[option] }))}
        value={value}
        onChange={async (next) => {
          if (!next || next === value) return;
          const before = value;
          setValue(next);
          setSaved(false);
          const result = await run(() => setIssueWorkClass(issueId, next));
          if (result?.error) setValue(before);
          else setSaved(true);
        }}
      />
      <FormMessage error={error} success={saved ? "Saved" : undefined} size="xs" />
    </div>
  );
}

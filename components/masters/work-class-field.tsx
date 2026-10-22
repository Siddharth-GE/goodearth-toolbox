"use client";

import { ChoiceChips } from "@/components/ui/choice-chips";
import { Label } from "@/components/ui/label";
import { WORK_CLASSES, WORK_CLASS_LABEL, type WorkClass } from "@/lib/masters/work-classes";
import { useState } from "react";

/** Standard work, additional work or rework (0132), one tap on a phone; the choice posts as `name`. */
export function WorkClassField({
  name = "work_class",
  defaultValue = "standard",
  onChange,
}: {
  name?: string;
  defaultValue?: WorkClass;
  onChange?: (value: WorkClass) => void;
}) {
  const [value, setValue] = useState<WorkClass>(defaultValue);
  return (
    <div className="space-y-1.5">
      <Label>What was it for?</Label>
      <input type="hidden" name={name} value={value} />
      <ChoiceChips
        label="What was it for?"
        required
        options={WORK_CLASSES.map((option) => ({ value: option, label: WORK_CLASS_LABEL[option] }))}
        value={value}
        onChange={(next) => {
          if (!next) return;
          setValue(next);
          onChange?.(next);
        }}
      />
    </div>
  );
}

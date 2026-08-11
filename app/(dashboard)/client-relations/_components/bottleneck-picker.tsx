"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { setBottlenecks } from "@/lib/client-relations/actions";
import { BOTTLENECKS, type Bottleneck } from "@/lib/client-relations/stages";
import { useState, useTransition } from "react";

/**
 * The sheet's "Bottleneck" column: several at once, saved the moment a box
 * is ticked.
 *
 * Its own component and its own action rather than a field in the
 * save-on-blur block, because a checkbox produces no blur a mouse user
 * would notice — the change would sit unsaved until they happened to
 * click into some other field.
 */
export function BottleneckPicker({
  engagementId,
  values,
}: {
  engagementId: string;
  values: Bottleneck[];
}) {
  const [selected, setSelected] = useState<Bottleneck[]>(values);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  const toggle = (value: Bottleneck) => {
    const next = selected.includes(value)
      ? selected.filter((one) => one !== value)
      : [...selected, value];

    // Optimistic: the tick responds immediately, and only a failure
    // rolls it back — with the reason on screen rather than a silent revert.
    setSelected(next);
    setError(undefined);
    startTransition(async () => {
      const result = await setBottlenecks(engagementId, next);
      if (result?.error) {
        setSelected(selected);
        setError(result.error);
      }
    });
  };

  return (
    <div className="space-y-2">
      <Label>Waiting on</Label>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {BOTTLENECKS.map((option) => (
          <label key={option.value} className="text-foreground flex items-center gap-2 text-sm">
            <Checkbox
              checked={selected.includes(option.value)}
              disabled={pending}
              onChange={() => toggle(option.value)}
            />
            {option.label}
          </label>
        ))}
      </div>
      <FormMessage error={error} size="xs" />
    </div>
  );
}

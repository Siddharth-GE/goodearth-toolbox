"use client";

import { Select } from "@/components/ui/select";
import { setTrailStage } from "@/lib/relay/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** Files a trail under a stage: the correction, not the routine (a trail files itself on creation, 0065). Disabled once finished, or the schedule's past would change. */
export function StagePicker({
  chainId,
  stages,
  current,
  disabled,
}: {
  chainId: string;
  stages: { id: string; name: string }[];
  current: string | null;
  disabled?: boolean;
}) {
  // Plain boolean, not useTransition (see schedule-editor.tsx): a refresh inside a transition leaves the control disabled.
  const [pending, setPending] = useState(false);
  const router = useRouter();

  return (
    <Select
      aria-label="Stage"
      className="h-9 max-w-40 shrink-0 text-xs"
      value={current ?? ""}
      disabled={disabled || pending}
      onChange={async (e) => {
        setPending(true);
        try {
          await setTrailStage(chainId, e.target.value || null);
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
    >
      <option value="">No stage</option>
      {stages.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </Select>
  );
}

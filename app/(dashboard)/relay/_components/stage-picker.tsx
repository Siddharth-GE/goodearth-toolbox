"use client";

import { Select } from "@/components/ui/select";
import { setTrailStage } from "@/lib/relay/actions";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Filing a trail under a stage. Lives on the trail's own page, and on
 * the project page's stragglers panel — since 0065 a trail files itself
 * on creation, so this is the correction, not the routine.
 *
 * Disabled on a finished trail: it has already counted towards the
 * picture, and moving it after the fact rewrites what the schedule said
 * last week.
 */
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
  // Plain boolean rather than useTransition — see the note in
  // schedule-editor.tsx: a refresh inside a transition leaves a
  // long-lived control disabled for as long as the refresh runs.
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

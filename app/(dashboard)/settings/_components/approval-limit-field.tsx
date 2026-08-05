"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import { setBillApprovalLimit } from "@/lib/settings/actions";
import { useState } from "react";

/**
 * The ceiling on a bill approver's authority, saved on blur like the
 * name field. Blank is unlimited — the state every approver was in
 * before limits existed, so clearing it restores the old behaviour
 * rather than reducing someone to nothing.
 */
export function ApprovalLimitField({ userId, limit }: { userId: string; limit: number | null }) {
  const initial = limit === null ? "" : String(limit);
  const [value, setValue] = useState(initial);

  const { flush, error, saved } = useSaveOnBlur<string>({
    initial,
    validate: (raw) => {
      const text = raw.trim();
      if (text === "") return undefined;
      const parsed = Number(text.replace(/,/g, ""));
      if (!Number.isFinite(parsed)) return "Enter an amount, or leave it blank for no limit.";
      if (parsed <= 0) return "Leave it blank for no limit — zero would approve nothing.";
      return undefined;
    },
    save: (raw) => setBillApprovalLimit(userId, raw),
  });

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Input
          value={value}
          placeholder="No limit"
          inputMode="decimal"
          aria-label="Bill approval limit in rupees"
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => flush(value)}
          className="h-9 max-w-40"
        />
        {saved && <FormMessage success="Saved" size="xs" />}
      </div>
      <FormMessage error={error} size="xs" />
    </div>
  );
}

"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { useSaveOnBlur } from "@/lib/hooks/use-save-on-blur";
import { setFullName } from "@/lib/settings/actions";
import { useState } from "react";

/**
 * The person's display name, saved on blur — the name every avatar and
 * "approved by" line across the tools resolves to. Empty until an admin
 * fills it in, because account creation (the Supabase dashboard) never
 * asks for a name.
 */
export function NameField({ userId, name }: { userId: string; name: string | null }) {
  const [value, setValue] = useState(name ?? "");

  const { flush, error, saved } = useSaveOnBlur<string>({
    initial: name ?? "",
    validate: (raw) => {
      if (!raw.trim()) return "The name can't be blank.";
      if (raw.trim().length > 80) return "Keep the name under 80 characters.";
      return undefined;
    },
    save: (raw) => setFullName(userId, raw),
  });

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <Input
          value={value}
          placeholder="Add a name…"
          aria-label="Full name"
          onChange={(event) => setValue(event.target.value)}
          onBlur={() => flush(value)}
          className="h-9 max-w-48"
        />
        {saved && <FormMessage success="Saved" size="xs" />}
      </div>
      <FormMessage error={error} size="xs" className="mt-1" />
    </div>
  );
}

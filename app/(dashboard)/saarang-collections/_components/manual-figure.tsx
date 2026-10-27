"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { formatAmount } from "@/lib/format";
import { saveFigure } from "@/lib/saarang-collections/actions";
import type { FigureProject } from "@/lib/saarang-collections/shared";
import { useState, useTransition } from "react";

/** A figure typed by hand: saved when the person leaves the box. The parent keys it on the saved value so it shows what is stored. */
export function ManualFigure({
  project,
  figure,
  value,
  count = false,
  label,
}: {
  project: FigureProject;
  figure: string;
  value: number | null;
  count?: boolean;
  label: string;
}) {
  const shown = value === null ? "" : count ? String(value) : formatAmount(value);
  const [text, setText] = useState(shown);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();

  const save = () => {
    if (text === shown) return;
    startTransition(async () => {
      const result = await saveFigure(project, figure, text);
      setError(result?.error);
    });
  };

  return (
    <div className="bg-warning/10">
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        inputMode="decimal"
        autoComplete="off"
        placeholder="—"
        aria-label={label}
        className="h-10 min-w-28 rounded-none border-0 bg-transparent px-3 text-right font-mono"
      />
      <FormMessage error={error} size="xs" className="px-3 pb-1 text-right" />
    </div>
  );
}

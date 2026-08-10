"use client";

import { cn } from "@/lib/utils";

/**
 * Departments as toggle chips, because a trail is routinely in more than
 * one — a selections handoff is Design and Purchase, a site handover is
 * Site and Client Relations. A single dropdown would have forced a lie
 * on exactly the trails worth watching.
 *
 * Chips rather than a multi-select box: with six or so options the whole
 * set is visible at once and picking two is two taps, which matters on a
 * phone.
 */
export function DepartmentPicker({
  departments,
  selected,
  onChange,
  disabled,
}: {
  departments: { id: string; name: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  if (departments.length === 0) {
    return (
      <p className="text-muted text-sm">No departments yet — add them on the Activities page.</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {departments.map((d) => {
        const on = selected.includes(d.id);
        return (
          <button
            key={d.id}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() =>
              onChange(on ? selected.filter((id) => id !== d.id) : [...selected, d.id])
            }
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
              on
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border text-muted hover:text-foreground",
            )}
          >
            {d.name}
          </button>
        );
      })}
    </div>
  );
}

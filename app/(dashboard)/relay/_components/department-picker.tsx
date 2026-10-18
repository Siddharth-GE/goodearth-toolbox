"use client";

import { chipClassName } from "@/components/ui/choice-chips";

/** Departments as toggle chips: a trail is often in several (Design and Purchase), and chips keep it two taps on a phone. */
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
            className={chipClassName(on)}
          >
            {d.name}
          </button>
        );
      })}
    </div>
  );
}

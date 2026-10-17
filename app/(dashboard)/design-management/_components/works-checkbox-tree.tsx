"use client";

import { Checkbox } from "@/components/ui/checkbox";
import type { WorksTreeCategory } from "@/lib/masters/works";

/**
 * Checkbox tree of the works vocabulary, shared by the set-default editor and the draft revision editor; the caller owns the checked set, dirty check and save.
 * `onSetMany` sets a whole category one way: toggling each would invert a mixed selection instead of completing it.
 */
export function WorksCheckboxTree({
  tree,
  checked,
  onToggle,
  onSetMany,
  disabled,
}: {
  tree: WorksTreeCategory[];
  checked: Set<string>;
  onToggle: (id: string) => void;
  onSetMany: (ids: string[], check: boolean) => void;
  disabled?: boolean;
}) {
  if (tree.length === 0) {
    return (
      <p className="text-muted text-sm">
        No works exist yet — add them under Masters → Works first.
      </p>
    );
  }

  return (
    <div className="max-h-[28rem] space-y-4 overflow-y-auto pr-1">
      {tree.map(({ category, directItems, groups }) => {
        const items = [...directItems, ...groups.flatMap((g) => g.items)];
        if (items.length === 0) return null;
        const itemIds = items.map((item) => item.id);
        const checkedCount = itemIds.filter((id) => checked.has(id)).length;
        const allChecked = checkedCount === itemIds.length;
        return (
          <div key={category.id}>
            <label className="text-foreground flex items-center gap-2 text-xs font-semibold tracking-wide uppercase">
              <Checkbox
                checked={allChecked}
                indeterminate={checkedCount > 0 && !allChecked}
                onChange={() => onSetMany(itemIds, !allChecked)}
                disabled={disabled}
                aria-label={`Tick every work under ${category.name}`}
              />
              <span>
                {category.code} — {category.name}
              </span>
            </label>
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
              {items.map((item) => (
                <label key={item.id} className="text-foreground flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked.has(item.id)}
                    onChange={() => onToggle(item.id)}
                    disabled={disabled}
                  />
                  <span className={item.is_active ? "" : "text-muted"}>
                    {item.code} — {item.name}
                  </span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { Checkbox } from "@/components/ui/checkbox";
import type { WorksTreeCategory } from "@/lib/masters/works";

/**
 * The works-vocabulary checkbox tree — categories, their groups, and the
 * items inside. Shared by two editors that check different things
 * against the same tree: a drawing set's default work links
 * (sets/_components/works-link-editor.tsx) and one draft revision's own
 * links (villas/[unitId]/_components/draft-revision-editor.tsx). Purely
 * presentational: the caller owns the checked set, the dirty check, and
 * the save.
 *
 * The category header carries its own ticker (founder, 2026-08-22:
 * "make a ticker for a group like foundation that can tick all the
 * works below it") — tick it and every work under the category ticks;
 * part-ticked shows the native half state. `onSetMany` sets the whole
 * list one way, which is not the same as toggling each: toggling a
 * mixed selection would invert it instead of completing it.
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

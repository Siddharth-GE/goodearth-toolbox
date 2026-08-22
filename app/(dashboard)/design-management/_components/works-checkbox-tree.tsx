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
 */
export function WorksCheckboxTree({
  tree,
  checked,
  onToggle,
  disabled,
}: {
  tree: WorksTreeCategory[];
  checked: Set<string>;
  onToggle: (id: string) => void;
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
        return (
          <div key={category.id}>
            <p className="text-foreground text-xs font-semibold tracking-wide uppercase">
              {category.code} — {category.name}
            </p>
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

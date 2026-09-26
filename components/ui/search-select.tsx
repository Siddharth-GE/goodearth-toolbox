"use client";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { useId, useMemo, useState, type KeyboardEvent } from "react";

export type SearchOption = {
  value: string;
  label: string;
  /** A second line in the list: a unit, a price, a code. */
  hint?: string;
  /** Options with the same group are listed under one heading. */
  group?: string;
};

/**
 * A single choice out of a long list, found by typing — the native
 * <Select> scrolled through two thousand materials with no way to search.
 *
 * Filters in the browser (every word typed must appear, in any order),
 * shows at most `limit` matches, and renders the matches in the flow
 * below the box rather than floating over the page, so it behaves inside
 * a dialog's bottom sheet on a phone. The choice travels in a hidden
 * input called `name`, so a plain <form action> sees it like a select.
 */
export function SearchSelect({
  id,
  name,
  options,
  value,
  onChange,
  placeholder = "Type to search…",
  emptyHint,
  limit = 30,
  className,
}: {
  id?: string;
  name?: string;
  options: SearchOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Shown under the box while nothing is typed — "2,058 materials". */
  emptyHint?: string;
  limit?: number;
  className?: string;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const selected = options.find((option) => option.value === value);

  const matches = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    const found: SearchOption[] = [];
    for (const option of options) {
      const haystack = `${option.label} ${option.hint ?? ""}`.toLowerCase();
      if (words.every((word) => haystack.includes(word))) {
        found.push(option);
        if (found.length === limit) break;
      }
    }
    return found;
  }, [options, query, limit]);

  const choose = (option: SearchOption) => {
    onChange(option.value);
    setQuery("");
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((current) => Math.min(current + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && open && matches[active]) {
      // Inside a form, Enter would submit with the half-typed choice.
      event.preventDefault();
      choose(matches[active]);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  const showList = open && query.trim() !== "";

  return (
    <div className={cn("space-y-1.5", className)}>
      {name && <input type="hidden" name={name} value={value} />}
      <div className="relative">
        <Input
          id={id}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && matches[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          value={open ? query : (selected?.label ?? "")}
          placeholder={selected ? selected.label : placeholder}
          onFocus={() => {
            setOpen(true);
            setQuery("");
            setActive(0);
          }}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={cn(selected && "pr-10")}
        />
        {selected && !open && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label={`Clear ${selected.label}`}
            className="text-muted hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {open && query.trim() === "" && emptyHint && (
        <p className="text-muted text-xs">{emptyHint}</p>
      )}

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="border-border/60 bg-surface-raised max-h-72 overflow-y-auto rounded-xl border p-1"
        >
          {matches.length === 0 ? (
            <li className="text-muted px-2.5 py-2 text-sm">Nothing matches “{query.trim()}”.</li>
          ) : (
            matches.map((option, index) => {
              const heading =
                option.group && option.group !== matches[index - 1]?.group ? option.group : null;
              return (
                <li key={option.value} role="presentation">
                  {heading && (
                    <p className="text-muted px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-[0.14em] uppercase">
                      {heading}
                    </p>
                  )}
                  <div
                    id={`${listId}-${index}`}
                    role="option"
                    aria-selected={index === active}
                    // mousedown, not click: the input's blur would close
                    // the list before a click ever landed.
                    onMouseDown={(event) => {
                      event.preventDefault();
                      choose(option);
                    }}
                    onMouseEnter={() => setActive(index)}
                    className={cn(
                      "text-foreground flex cursor-pointer items-baseline justify-between gap-3 rounded-lg px-2.5 py-2 text-sm",
                      index === active && "bg-foreground/[0.05]",
                    )}
                  >
                    <span className="min-w-0">{option.label}</span>
                    {option.hint && (
                      <span className="text-muted shrink-0 text-xs">{option.hint}</span>
                    )}
                  </div>
                </li>
              );
            })
          )}
          {matches.length === limit && (
            <li className="text-muted px-2.5 py-2 text-xs">
              Showing the first {limit} — type more to narrow it down.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

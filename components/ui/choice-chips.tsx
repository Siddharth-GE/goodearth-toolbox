import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * One tap picks a value: a row of chips instead of a dropdown, for a short
 * fixed list a person sets often — a deed's status, who holds the
 * original, a Kaadal stage. The Saarang tracker's choice (root plan.md,
 * seventh piece), and the shape Birdwing's attendance, Relay's department
 * picker and Reporter's builder had each hand-rolled — so it lives here
 * from its fourth copy on.
 *
 * A chosen chip is ink, the toolbox's "this is selected" (DESIGN.md: nav
 * is ink, accent is action); an option marked `good` turns green instead
 * when chosen — Signed, a design check done. Tapping the chosen chip
 * clears it unless the choice is `required`. Saving is the caller's: the
 * chips only say what was tapped.
 */
export type ChoiceOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Chosen, this one reads as good news: green rather than ink. */
  good?: boolean;
};

type Common<T extends string> = {
  options: readonly ChoiceOption<T>[];
  /** Names the group for a screen reader — the field's visible label. */
  label: string;
  disabled?: boolean;
  className?: string;
};

type Single<T extends string> = Common<T> & {
  multiple?: false;
  value: T | null;
  onChange: (value: T | null) => void;
  /** Tapping the chosen chip leaves it chosen instead of clearing it. */
  required?: boolean;
};

type Multiple<T extends string> = Common<T> & {
  multiple: true;
  value: readonly T[];
  onChange: (value: T[]) => void;
};

export function chipClassName(chosen: boolean, good = false): string {
  return cn(
    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-sm leading-tight font-medium",
    "transition-[transform,background-color,border-color] duration-150 ease-out-quint active:scale-[0.98]",
    "focus-visible:ring-accent/25 focus-visible:ring-4 focus-visible:outline-none",
    "disabled:pointer-events-none disabled:opacity-50",
    chosen
      ? good
        ? "border-success bg-success text-success-foreground"
        : "border-foreground bg-foreground text-background"
      : "border-border bg-surface-raised text-foreground/80 hover:bg-foreground/[0.04]",
  );
}

export function ChoiceChips<T extends string>(props: Single<T> | Multiple<T>) {
  const { options, label, disabled, className } = props;
  const isChosen = (value: T) =>
    props.multiple ? props.value.includes(value) : props.value === value;

  const tap = (value: T) => {
    if (props.multiple) {
      props.onChange(
        props.value.includes(value)
          ? props.value.filter((v) => v !== value)
          : [...props.value, value],
      );
    } else if (props.value === value) {
      if (!props.required) props.onChange(null);
    } else {
      props.onChange(value);
    }
  };

  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((option) => {
        const chosen = isChosen(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={chosen}
            disabled={disabled}
            onClick={() => tap(option.value)}
            className={chipClassName(chosen, option.good)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

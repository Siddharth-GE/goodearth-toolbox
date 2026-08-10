"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatCrore } from "@/lib/format";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * The input primitives a model screen needs, and nothing more.
 *
 * These are local to Business Planning rather than shared: DESIGN.md's
 * rule is to build the THIRD copy into components/ui, not the first, and
 * no other tool in the app types forty numbers into one page.
 *
 * The one idea they all share: WHAT YOU TYPE IS TEXT, WHAT THE MODEL
 * HOLDS IS A NUMBER. A field keeps its own string while you are in it,
 * so "1.", "" and "0.0" are all things you can be halfway through
 * typing; it emits a number to the plan on every keystroke that parses.
 * Bind an <input type="number"> straight to a number and clearing it to
 * retype puts NaN through the whole model for as long as the box is
 * empty.
 */

/** Select-on-focus, because every one of these is typed over, not into. */
function selectAll(event: React.FocusEvent<HTMLInputElement>) {
  event.currentTarget.select();
}

function FieldShell({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  htmlFor: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <Label htmlFor={htmlFor} className="text-muted text-xs font-medium">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-muted truncate text-xs">{hint}</p> : null}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  hint,
  suffix,
  step = "any",
  min = 0,
  max,
  className,
}: {
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  hint?: ReactNode;
  /** A unit shown inside the field's right edge: sqft, mo, %. */
  suffix?: string;
  step?: string;
  min?: number;
  max?: number;
  className?: string;
}) {
  const id = useId();
  const [text, setText] = useState(() => String(value));
  // What we last sent up. If `value` arrives different from this, the
  // change came from somewhere else (a reset, a duplicate) and the box
  // should follow it. Without the guard, echoing our own emission back
  // would rewrite "1." to "1" mid-keystroke.
  const emitted = useRef(value);

  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setText(String(value));
    }
  }, [value]);

  return (
    <FieldShell label={label} hint={hint} htmlFor={id} className={className}>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          step={step}
          min={min}
          max={max}
          value={text}
          onFocus={selectAll}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            // An empty box is zero in a plan — there is no "unpriced"
            // here, every assumption has a numeric value — but the box
            // stays visually empty until it loses focus.
            const parsed = next.trim() === "" ? 0 : Number(next);
            if (Number.isFinite(parsed)) {
              emitted.current = parsed;
              onChange(parsed);
            }
          }}
          onBlur={() => setText(String(emitted.current))}
          className={cn("h-9 font-mono", suffix && "pr-12")}
        />
        {suffix ? (
          <span className="text-muted pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs">
            {suffix}
          </span>
        ) : null}
      </div>
    </FieldShell>
  );
}

/**
 * A rupee amount, with the crore/lakh reading of itself underneath.
 *
 * Typing 132000000 and having "₹13.20 Cr" appear below it is the whole
 * point: it is the only way to catch the extra zero, which on a land
 * cost is the difference between a project and a disaster.
 */
export function MoneyField({
  label,
  value,
  onChange,
  hint,
  className,
}: {
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <NumberField
      label={label}
      value={value}
      onChange={onChange}
      step="any"
      className={className}
      hint={
        <>
          <span className="text-foreground font-medium">{formatCrore(value)}</span>
          {hint ? <span> · {hint}</span> : null}
        </>
      }
    />
  );
}

export function PercentField({
  label,
  value,
  onChange,
  hint,
  className,
}: {
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <NumberField
      label={label}
      value={value}
      onChange={onChange}
      suffix="%"
      step="any"
      min={0}
      max={100}
      hint={hint}
      className={className}
    />
  );
}

export function MonthField({
  label,
  value,
  onChange,
  hint,
  className,
}: {
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <NumberField
      label={label}
      value={value}
      onChange={onChange}
      suffix="mo"
      step="1"
      min={1}
      hint={hint}
      className={className}
    />
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <FieldShell label={label} htmlFor={id} className={className}>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="h-9"
      />
    </FieldShell>
  );
}

/** The heading above a group of fields inside a card. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-muted text-xs font-semibold tracking-widest uppercase">{children}</p>;
}

"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatCrore } from "@/lib/format";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Input primitives local to Business Planning (DESIGN.md: build the third copy into
 * components/ui, not the first). What you type is text, what the model holds is a number: a
 * field keeps its own string and emits a number on each keystroke that parses, so clearing a
 * box never puts NaN through the model.
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
  suffix?: string;
  step?: string;
  min?: number;
  max?: number;
  className?: string;
}) {
  const id = useId();
  const [text, setText] = useState(() => String(value));
  // What we last sent up. A `value` that differs came from elsewhere (reset, duplicate) and the
  // box follows it; echoing our own emission would rewrite "1." to "1" mid-keystroke.
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
            // An empty box is zero in a plan, but stays visually empty until it loses focus.
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

/** A rupee amount with its crore/lakh reading underneath, to catch an extra zero. */
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

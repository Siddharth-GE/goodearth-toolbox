"use client";

import { useRef, useState } from "react";

/**
 * Save a row's fields when the user leaves them, not on every keystroke.
 *
 * Three grids each had their own version of this — the Selections line
 * grid, the Budgets pricing grid, and the product margins list — with
 * three different ways of tracking what was already saved, and three
 * different wordings for the same validation message.
 *
 * They also disagreed on the thing that actually matters. Two rolled back
 * their "already saved" marker when the write failed; the Selections one
 * didn't, so a failed save was silently discarded AND the retry was
 * blocked by its own short-circuit. That bug is impossible with this hook
 * because the marker is only advanced after the server confirms.
 *
 * Deliberately outside a transition: the value is already on screen, the
 * save actions don't revalidate, and flashing a row busy on every tab-out
 * makes fast editing feel slow. Only a failure interrupts.
 */
export function useSaveOnBlur<T>({
  initial,
  save,
  validate,
}: {
  /** What the database currently holds. */
  initial: T;
  save: (value: T) => Promise<{ error?: string } | undefined>;
  /** Return a message to block the save, or undefined to allow it. */
  validate?: (value: T) => string | undefined;
}) {
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const persisted = useRef(JSON.stringify(initial));

  const flush = (value: T) => {
    const snapshot = JSON.stringify(value);
    // Nothing changed — tabbing through an untouched row writes nothing.
    if (snapshot === persisted.current) return;

    const problem = validate?.(value);
    if (problem) {
      setError(problem);
      return;
    }
    setError(undefined);

    void save(value).then((result) => {
      if (result?.error) {
        setError(result.error);
        // Not persisted, so the next blur must try again. Advancing the
        // marker before the server confirms is precisely the bug this
        // hook exists to make unrepeatable.
        return;
      }
      persisted.current = snapshot;
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    });
  };

  return { flush, error, setError, saved };
}

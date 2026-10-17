"use client";

import { useRef, useState } from "react";

/**
 * Saves a row's fields on blur, not every keystroke. The "already saved" marker advances only after the server confirms, so a failed save can retry.
 * Outside a transition on purpose: flashing a row busy on every tab-out makes editing feel slow.
 */
export function useSaveOnBlur<T>({
  initial,
  save,
  validate,
}: {
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
        // Not persisted, so the next blur must try again.
        return;
      }
      persisted.current = snapshot;
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    });
  };

  return { flush, error, setError, saved };
}

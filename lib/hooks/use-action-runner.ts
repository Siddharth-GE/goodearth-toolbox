"use client";

import type { ActionState } from "@/lib/action-state";
import { useCallback, useState, useTransition } from "react";

const THROWN = "Something went wrong. Try again.";

/**
 * Runs a server action in a transition and keeps its error for the screen.
 * The old error clears the moment the next attempt starts, so a stale message never outlives a success.
 * `run` resolves with the action's result (`undefined` on success) so the caller can close a dialog or reset a form.
 * An action that throws shows a plain message and is logged, never swallowed.
 */
export function useActionRunner() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  const run = useCallback(<T extends ActionState>(action: () => Promise<T>) => {
    setError(undefined);
    return new Promise<T | { error: string }>((resolve) => {
      startTransition(async () => {
        try {
          const result = await action();
          setError(result?.error);
          resolve(result);
        } catch (thrown) {
          console.error(thrown);
          setError(THROWN);
          resolve({ error: THROWN });
        }
      });
    });
  }, []);

  const clearError = useCallback(() => setError(undefined), []);

  return { pending, error, run, clearError, setError };
}

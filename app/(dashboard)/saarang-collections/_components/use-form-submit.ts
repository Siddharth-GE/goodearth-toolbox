"use client";

import type { ActionState } from "@/lib/action-state";
import { useState, useTransition, type FormEvent } from "react";

/**
 * Submits a form through a server action without React clearing the fields when it fails.
 * `reset` empties the form after a save that worked (an add form); a settings form keeps its values.
 */
export function useFormSubmit(
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>,
  options: { reset?: boolean } = {},
) {
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    startTransition(async () => {
      const result = await action(undefined, data);
      setError(result?.error);
      setSaved(!result?.error);
      if (!result?.error && options.reset) form.reset();
    });
  };

  return { error, saved, pending, onSubmit };
}

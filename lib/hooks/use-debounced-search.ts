"use client";

import { useEffect, useState } from "react";

/**
 * Debounced, abortable search against a Route Handler, not a Server Action: actions dispatch one at a time per client, so keystrokes would queue.
 */
export function useDebouncedSearch<T>({
  url,
  params,
  enabled = true,
  initial,
  delayMs = 200,
}: {
  url: string;
  /** Query values; empty strings are dropped. Re-runs when these change. */
  params: Record<string, string | number>;
  /** False keeps the hook idle — used by dialogs that haven't opened. */
  enabled?: boolean;
  initial: T;
  delayMs?: number;
}) {
  const [result, setResult] = useState<T>(initial);
  // Starts true so the first paint says "Searching…", not an empty result.
  const [loading, setLoading] = useState(enabled);
  const [failed, setFailed] = useState(false);

  // Serialised so the effect re-runs on value changes rather than on the
  // new object identity a caller creates every render.
  const key = JSON.stringify(params);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      const query = new URLSearchParams();
      for (const [name, value] of Object.entries(
        JSON.parse(key) as Record<string, string | number>,
      )) {
        if (value !== "" && value !== undefined && value !== null) query.set(name, String(value));
      }

      try {
        const response = await fetch(`${url}?${query}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`search failed: ${response.status}`);
        setResult((await response.json()) as T);
        setFailed(false);
        setLoading(false);
      } catch (error) {
        // Aborting is the normal result of typing another character.
        if ((error as Error).name === "AbortError") return;
        console.error("search failed:", error);
        setFailed(true);
        setLoading(false);
      }
    }, delayMs);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [url, key, enabled, delayMs]);

  return { result, loading, failed };
}

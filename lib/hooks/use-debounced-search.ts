"use client";

import { useEffect, useState } from "react";

/**
 * Debounced, abortable search against a Route Handler.
 *
 * Written three times before this — in the catalogue picker, the margins
 * browser, and the item-request resolver — with the same 25 lines each
 * time, down to the comment about AbortError. They had already started to
 * drift: one showed "0 products" over an empty table on first paint,
 * another flashed "Nothing matches that" for 200ms before the first
 * search returned.
 *
 * Why a GET and not a Server Action, in the framework's own words: "do
 * not rely on Promise.all to parallelize Server Actions from the client
 * ... use a Route Handler for non-mutation requests." Actions dispatch
 * one at a time per client, so keystrokes queue behind each other, and a
 * revalidating action re-renders the whole route server-side.
 */
export function useDebouncedSearch<T>({
  url,
  params,
  enabled = true,
  initial,
  delayMs = 200,
}: {
  /** Endpoint path, e.g. "/api/catalogue". */
  url: string;
  /** Query values; empty strings are dropped. Re-runs when these change. */
  params: Record<string, string | number>;
  /** False keeps the hook idle — used by dialogs that haven't opened. */
  enabled?: boolean;
  initial: T;
  delayMs?: number;
}) {
  const [result, setResult] = useState<T>(initial);
  // Starts true so the first paint says "Searching…" rather than
  // confidently reporting an empty result it hasn't fetched yet.
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
        // An aborted request is the expected result of typing another
        // character, not a failure worth showing anyone.
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

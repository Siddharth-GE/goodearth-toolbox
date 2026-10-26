"use client";

import { useEffect } from "react";

export const PLATE_COUNT_EVENT = "plate-count";

/** Hands a page's freshly read plate count to the sidebar's bell, so the bell never reads the plate a second time. */
export function PlateCountSync({ count }: { count: number }) {
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(PLATE_COUNT_EVENT, { detail: count }));
  }, [count]);
  return null;
}

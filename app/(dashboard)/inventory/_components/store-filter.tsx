"use client";

import { Select } from "@/components/ui/select";
import { useRouter } from "next/navigation";

/**
 * "Show me one store" — a plain select that navigates, so the choice
 * lives in the URL and the page stays a Server Component. A Server
 * Component cannot hand a function to a Client Component (the hotfix
 * lesson from 2026-08-01), so the base path comes in as a string and
 * the href is built here.
 */
export function StoreFilter({
  stores,
  selected,
  basePath,
}: {
  stores: { id: string; name: string }[];
  selected: string;
  basePath: string;
}) {
  const router = useRouter();

  if (stores.length === 0) return null;

  return (
    <Select
      aria-label="Filter by store"
      value={selected}
      onChange={(event) => {
        const value = event.target.value;
        router.push(value ? `${basePath}?store=${value}` : basePath);
      }}
      className="sm:max-w-xs"
    >
      <option value="">All stores</option>
      {stores.map((store) => (
        <option key={store.id} value={store.id}>
          {store.name}
        </option>
      ))}
    </Select>
  );
}

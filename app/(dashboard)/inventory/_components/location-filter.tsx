"use client";

import { Select } from "@/components/ui/select";
import type { LocationOption } from "@/lib/inventory/queries";
import { useRouter } from "next/navigation";

const GROUP_LABEL = {
  store: "Stores",
  plot: "Plots",
  unit: "Units",
} as const;

/**
 * "Show me one place" — a plain select that navigates, so the choice
 * lives in the URL and the page stays a Server Component. A Server
 * Component cannot hand a function to a Client Component (the hotfix
 * lesson from 2026-08-01), so the base path comes in as a string and
 * the href is built here.
 */
export function LocationFilter({
  locations,
  selected,
  basePath,
}: {
  locations: LocationOption[];
  /** "kind:id", matching the option values below. */
  selected: string;
  basePath: string;
}) {
  const router = useRouter();

  if (locations.length === 0) return null;

  const groups = (["store", "plot", "unit"] as const)
    .map((kind) => ({ kind, options: locations.filter((l) => l.kind === kind) }))
    .filter((group) => group.options.length > 0);

  return (
    <Select
      aria-label="Filter by location"
      value={selected}
      onChange={(event) => {
        const value = event.target.value;
        router.push(value ? `${basePath}?at=${value}` : basePath);
      }}
      className="sm:max-w-xs"
    >
      <option value="">Everywhere</option>
      {groups.map((group) => (
        <optgroup key={group.kind} label={GROUP_LABEL[group.kind]}>
          {group.options.map((location) => (
            <option
              key={`${location.kind}:${location.id}`}
              value={`${location.kind}:${location.id}`}
            >
              {location.name}
            </option>
          ))}
        </optgroup>
      ))}
    </Select>
  );
}

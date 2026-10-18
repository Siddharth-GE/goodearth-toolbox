"use client";

import { Select } from "@/components/ui/select";
import type { LocationOption } from "@/lib/inventory/stock-queries";
import { useRouter } from "next/navigation";

const GROUP_LABEL = {
  store: "Stores",
  plot: "Plots",
} as const;

// A plain select that navigates, so the choice lives in the URL. The base path comes in as a string:
// a Server Component cannot hand a function to a Client Component.
export function LocationFilter({
  locations,
  selected,
  basePath,
  search,
}: {
  locations: LocationOption[];
  selected: string;
  basePath: string;
  search?: string;
}) {
  const router = useRouter();

  if (locations.length === 0) return null;

  const groups = (["store", "plot"] as const)
    .map((kind) => ({ kind, options: locations.filter((l) => l.kind === kind) }))
    .filter((group) => group.options.length > 0);

  return (
    <Select
      aria-label="Filter by location"
      value={selected}
      onChange={(event) => {
        const params = new URLSearchParams();
        if (event.target.value) params.set("at", event.target.value);
        if (search) params.set("q", search);
        const query = params.toString();
        router.push(query ? `${basePath}?${query}` : basePath);
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

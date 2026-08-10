"use client";

import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Narrowing the board. The choice lives in the URL so the list page
 * stays a Server Component — the bill-filters pattern, with one addition:
 * "Gone cold" is a toggle rather than a select, because it is the filter
 * anyone actually reaches for and it should be one tap.
 */
export function TrailFilters({
  people,
  activities,
}: {
  people: { id: string; name: string }[];
  activities: { id: string; name: string }[];
}) {
  const router = useRouter();
  const params = useSearchParams();

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    // Any change to what is being shown resets to the first page.
    next.delete("page");
    const query = next.toString();
    router.push(query ? `/pusher/trails?${query}` : "/pusher/trails");
  };

  const cold = params.get("cold") === "1";
  const status = params.get("status") ?? "running";
  const hasAny = cold || params.get("project") || params.get("person") || params.get("activity");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => set("cold", cold ? "" : "1")}
        className={cn(
          "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
          cold
            ? "border-danger bg-danger text-danger-foreground"
            : "border-border text-muted hover:text-foreground",
        )}
      >
        Gone cold
      </button>

      <Select
        aria-label="Filter by status"
        value={status}
        onChange={(e) => set("status", e.target.value === "running" ? "" : e.target.value)}
        className="h-9 max-w-44 text-xs"
      >
        <option value="running">Still running</option>
        <option value="finished">Finished</option>
        <option value="all">Everything</option>
      </Select>

      <Select
        aria-label="Filter by who is holding it"
        value={params.get("person") ?? ""}
        onChange={(e) => set("person", e.target.value)}
        className="h-9 max-w-44 text-xs"
      >
        <option value="">Anyone&apos;s hand</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Filter by activity"
        value={params.get("activity") ?? ""}
        onChange={(e) => set("activity", e.target.value)}
        className="h-9 max-w-48 text-xs"
      >
        <option value="">Any activity</option>
        {activities.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </Select>

      {hasAny && (
        <button
          type="button"
          onClick={() => router.push("/pusher/trails")}
          className="text-muted hover:text-foreground text-xs font-medium underline underline-offset-2"
        >
          Clear
        </button>
      )}
    </div>
  );
}

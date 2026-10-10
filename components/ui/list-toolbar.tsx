import { LinkButton, Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

/**
 * The one search / filter bar every list shares (plan.md, A4 — the
 * "shared filter toolbar" DESIGN.md held back for the third copy; there
 * were nine).
 *
 * A plain GET form, so it needs no JavaScript and works the same on a
 * site phone: submitting drops `page` and returns to page 1, the choices
 * live in the URL, and the page stays a Server Component. Params the list
 * wants kept (a status tab) ride as hidden fields.
 *
 *   q          the search box, when `search` is given
 *   from, to   a date range, when `dates` is given
 *   <param>    one select per filter
 */
export type ListFilter = {
  param: string;
  label: string;
  /** The "everything" choice, e.g. "All vendors". */
  allLabel: string;
  options: { value: string; label: string }[];
};

export function ListToolbar({
  action,
  values,
  keep = {},
  search,
  dates,
  filters = [],
}: {
  /** The list's own path, e.g. "/bills/list". */
  action: string;
  /** The current value of every param the bar owns. */
  values: Record<string, string | undefined>;
  /** Params to carry through unchanged (a tab's status). */
  keep?: Record<string, string | undefined>;
  search?: { placeholder: string };
  /** Label for the date range, e.g. "Bill date". */
  dates?: { label: string };
  filters?: ListFilter[];
}) {
  const owned = ["q", "from", "to", ...filters.map((filter) => filter.param)];
  const active = owned.some((param) => values[param]);
  const clearHref = (() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(keep)) if (value) params.set(key, value);
    const query = params.toString();
    return query ? `${action}?${query}` : action;
  })();

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      {Object.entries(keep).map(([key, value]) =>
        value ? <input key={key} type="hidden" name={key} value={value} /> : null,
      )}

      {search && (
        <div className="w-full space-y-1.5 sm:w-64">
          <Label htmlFor="list-q">Search</Label>
          <Input
            id="list-q"
            name="q"
            type="search"
            defaultValue={values.q ?? ""}
            placeholder={search.placeholder}
            autoComplete="off"
          />
        </div>
      )}

      {filters.map((filter) => (
        <div key={filter.param} className="w-full space-y-1.5 sm:w-48">
          <Label htmlFor={`list-${filter.param}`}>{filter.label}</Label>
          <Select
            id={`list-${filter.param}`}
            name={filter.param}
            defaultValue={values[filter.param] ?? ""}
          >
            <option value="">{filter.allLabel}</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      ))}

      {dates && (
        <>
          <div className="w-[calc(50%-0.25rem)] space-y-1.5 sm:w-40">
            <Label htmlFor="list-from">{dates.label} from</Label>
            <Input id="list-from" name="from" type="date" defaultValue={values.from ?? ""} />
          </div>
          <div className="w-[calc(50%-0.25rem)] space-y-1.5 sm:w-40">
            <Label htmlFor="list-to">to</Label>
            <Input id="list-to" name="to" type="date" defaultValue={values.to ?? ""} />
          </div>
        </>
      )}

      <div className="flex gap-2">
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {active && (
          <LinkButton href={clearHref} variant="ghost">
            Clear
          </LinkButton>
        )}
      </div>
    </form>
  );
}

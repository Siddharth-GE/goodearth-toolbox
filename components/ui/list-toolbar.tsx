import { LinkButton, Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

/**
 * The one search / filter bar every list shares. A plain GET form: no JavaScript, choices live in the URL, submitting returns to page 1.
 * Params the list wants kept (a status tab) ride as hidden fields. q = search; from, to = date range; <param> = one select per filter.
 */
export type ListFilter = {
  param: string;
  label: string;
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
  action: string;
  values: Record<string, string | undefined>;
  keep?: Record<string, string | undefined>;
  search?: { placeholder: string };
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

import { Button, LinkButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { listDepartments, listPeople } from "@/lib/directory/queries";
import { Users } from "lucide-react";

import { PersonCard } from "../_components/person-card";

export default async function DirectoryPeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; department?: string }>;
}) {
  const { q, department } = await searchParams;

  const [{ people, total }, departments] = await Promise.all([
    listPeople({ search: q, departmentId: department }),
    listDepartments(),
  ]);

  const isFiltered = Boolean(q || department);
  const departmentName = departments.find((row) => row.id === department)?.name;

  return (
    <div className="space-y-4">
      {/* GET form, so a filtered roster is a linkable URL and the back
          button does what it looks like it does. */}
      <form
        action="/directory/people"
        className="flex flex-wrap items-end gap-2"
        // Site staff reach this one-handed; the search field is first so
        // the keyboard opens on the thing they came for.
      >
        <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-64 sm:flex-none">
          <Label htmlFor="q">Search</Label>
          <Input
            id="q"
            name="q"
            type="search"
            defaultValue={q ?? ""}
            placeholder="Name, role or number…"
            autoComplete="off"
            autoCapitalize="none"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="department">Department</Label>
          <Select id="department" name="department" defaultValue={department ?? ""}>
            <option value="">All</option>
            {departments.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {isFiltered && (
          <LinkButton href="/directory/people" variant="ghost">
            Clear
          </LinkButton>
        )}
      </form>

      {/* "N of M" from the real roster, never rows.length. */}
      <p className="text-muted text-sm">
        {isFiltered ? `${people.length} of ${total} people` : `${total} people`}
      </p>

      {people.length === 0 ? (
        <EmptyState
          icon={Users}
          title={
            departmentName ? `Nobody in ${departmentName} yet` : "Nobody matches that search"
          }
          description={
            departmentName
              ? "An admin sets each person's department on their card."
              : "Try part of a name, a role, or a phone number."
          }
          action={<LinkButton href="/directory/people">Show everyone</LinkButton>}
        />
      ) : (
        // A card grid, not a table: ten columns of fifty people is
        // unusable at 390px and there is no honest way to make it one.
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((person) => (
            <PersonCard key={person.id} person={person} />
          ))}
        </div>
      )}
    </div>
  );
}

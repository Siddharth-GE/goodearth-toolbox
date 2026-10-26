"use client";

import { Card } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useActionRunner } from "@/lib/hooks/use-action-runner";
import { setCategoryLead } from "@/lib/supervisors/programme-actions";
import type { CategoryLead } from "@/lib/supervisors/sequence-queries";

function LeadRow({
  category,
  people,
}: {
  category: CategoryLead;
  people: { id: string; name: string }[];
}) {
  const { pending, error, run } = useActionRunner();
  const id = `lead-${category.categoryId}`;
  return (
    <div className="grid items-center gap-1.5 sm:grid-cols-[1fr_16rem]">
      <Label htmlFor={id} className="text-foreground text-sm">
        <span className="text-muted font-mono text-xs">{category.code}</span> {category.name}
      </Label>
      <div className="space-y-1">
        <Select
          id={id}
          value={category.ownerId ?? ""}
          disabled={pending}
          onChange={(event) =>
            run(() =>
              setCategoryLead({ categoryId: category.categoryId, ownerId: event.target.value }),
            )
          }
        >
          <option value="">No lead</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>
        <FormMessage error={error} />
      </div>
    </div>
  );
}

/** Each work category's lead (0158): they own its stages on every villa, unless a villa names its own owner. */
export function CategoryLeads({
  categories,
  people,
}: {
  categories: CategoryLead[];
  people: { id: string; name: string }[];
}) {
  return (
    <Card className="space-y-3 p-5">
      <div>
        <p className="text-foreground text-[15px] font-semibold tracking-tight">
          Who leads each category
        </p>
        <p className="text-muted text-sm">
          A lead owns that category&apos;s stages on every villa — what is coming up, due and late
          sits on their plate. On a villa, a stage can be given its own owner instead.
        </p>
      </div>
      <div className="divide-border space-y-2 divide-y">
        {categories.map((category) => (
          <div key={category.categoryId} className="pt-2 first:pt-0">
            <LeadRow category={category} people={people} />
          </div>
        ))}
      </div>
    </Card>
  );
}

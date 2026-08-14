"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { updateStaffPosting } from "@/lib/directory/actions";
import { todayInIndia } from "@/lib/directory/birthdays";
import { validatePosting } from "@/lib/directory/people";
import { useState } from "react";

type Posting = {
  departmentId: string | null;
  designation: string | null;
  reportsToId: string | null;
  joinedOn: string | null;
};

/**
 * The four columns the company owns, rendered only for an admin.
 *
 * The screen is the courtesy; staff_details_guard() (0060 §4) is the
 * boundary. A non-admin who reaches this action gets a redirect, and one
 * who reaches the table directly gets the guard's own sentence.
 *
 * Text saves on blur, dropdowns and dates save on change — a <select>
 * someone changes and clicks away from blurs too late to trust.
 */
export function PostingFields({
  personId,
  initial,
  departments,
  people,
}: {
  personId: string;
  initial: Posting;
  departments: { id: string; name: string }[];
  /** Active people PLUS whoever is currently selected, even if they have
   *  been deactivated — otherwise saving any other field here silently
   *  clears a reporting line pointing at somebody who has left. */
  people: { id: string; name: string; isActive: boolean }[];
}) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string>();
  const [savedField, setSavedField] = useState<string>();

  const save = async (next: Posting, field: string) => {
    if (JSON.stringify(next) === JSON.stringify(values)) return;
    setValues(next);

    const problem = validatePosting({ personId, ...next }, todayInIndia());
    if (problem) {
      setError(problem);
      return;
    }
    setError(undefined);

    const result = await updateStaffPosting({ personId, ...next });
    if (result?.error) {
      setError(result.error);
      return;
    }
    setSavedField(field);
    setTimeout(() => setSavedField(undefined), 1200);
  };

  const saved = (field: string) =>
    savedField === field ? <FormMessage success="Saved" size="xs" /> : null;

  return (
    <div className="space-y-3">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label>Department</Label>
            {saved("dept")}
          </div>
          <Select
            defaultValue={values.departmentId ?? ""}
            onChange={(event) =>
              void save({ ...values, departmentId: event.target.value || null }, "dept")
            }
          >
            <option value="">Not set</option>
            {departments.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label>Designation</Label>
            {saved("designation")}
          </div>
          <Input
            defaultValue={values.designation ?? ""}
            placeholder="e.g. Site Engineer"
            onBlur={(event) =>
              void save({ ...values, designation: event.target.value || null }, "designation")
            }
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label>Reports to</Label>
            {saved("reportsTo")}
          </div>
          <Select
            defaultValue={values.reportsToId ?? ""}
            onChange={(event) =>
              void save({ ...values, reportsToId: event.target.value || null }, "reportsTo")
            }
          >
            <option value="">Nobody</option>
            {people
              .filter((person) => person.id !== personId)
              .map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                  {!person.isActive && " (inactive)"}
                </option>
              ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label>Joined</Label>
            {saved("joined")}
          </div>
          <Input
            type="date"
            defaultValue={values.joinedOn ?? ""}
            max={todayInIndia()}
            onChange={(event) =>
              void save({ ...values, joinedOn: event.target.value || null }, "joined")
            }
          />
        </div>
      </div>

      <FormMessage error={error} />
    </div>
  );
}

"use client";

import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { updateMyDetails, updateMyName } from "@/lib/directory/actions";
import { todayInIndia } from "@/lib/directory/birthdays";
import { BLOOD_GROUPS, validateMyDetails, validateName } from "@/lib/directory/people";
import { useState } from "react";

type Details = {
  name: string;
  phone: string | null;
  dateOfBirth: string | null;
  bloodGroup: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

/**
 * The person's own half of their card, saved on blur — the same shape as
 * Settings' NameField, for the same reason: a Save button at the bottom
 * of five optional fields makes people fill in all of them or none.
 *
 * TEXT SAVES ON BLUR, THE DROPDOWN SAVES IMMEDIATELY. A <select> someone
 * changes and then clicks away from produces a blur too late to trust —
 * the Client Relations rule, learned there.
 *
 * Validation runs through the same pure functions the Server Action uses
 * (lib/directory/people.ts), so the sentence shown here and the rule
 * applied there cannot drift.
 */
export function MyDetailsForm({ initial }: { initial: Details }) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string>();
  const [savedField, setSavedField] = useState<string>();

  // One flush for the whole card rather than five hooks: these five
  // columns go up in a single UPDATE, so tracking them separately would
  // mean five round trips to save one visit.
  const save = async (next: Details, field: string) => {
    if (JSON.stringify(next) === JSON.stringify(values)) return;
    setValues(next);

    const problem = validateMyDetails(next, todayInIndia());
    if (problem) {
      setError(problem);
      return;
    }
    setError(undefined);

    const result = await updateMyDetails(next);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setSavedField(field);
    setTimeout(() => setSavedField(undefined), 1200);
  };

  const saveName = async (name: string) => {
    if (name === values.name) return;
    setValues({ ...values, name });

    const problem = validateName(name);
    if (problem) {
      setError(problem);
      return;
    }
    setError(undefined);

    const result = await updateMyName(name);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setSavedField("name");
    setTimeout(() => setSavedField(undefined), 1200);
  };

  const saved = (field: string) =>
    savedField === field ? <FormMessage success="Saved" size="xs" /> : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" hint="Fix the spelling if we got it wrong." saved={saved("name")}>
          <Input
            defaultValue={values.name}
            placeholder="Your full name"
            autoComplete="name"
            onBlur={(event) => void saveName(event.target.value)}
          />
        </Field>

        <Field label="Phone" hint="Colleagues tap this to call you." saved={saved("phone")}>
          <Input
            type="tel"
            defaultValue={values.phone ?? ""}
            placeholder="98765 43210"
            autoComplete="tel"
            inputMode="tel"
            onBlur={(event) => void save({ ...values, phone: event.target.value }, "phone")}
          />
        </Field>

        <Field label="Date of birth" hint="Only the day and month are shown." saved={saved("dob")}>
          <Input
            type="date"
            defaultValue={values.dateOfBirth ?? ""}
            max={todayInIndia()}
            onChange={(event) => void save({ ...values, dateOfBirth: event.target.value }, "dob")}
          />
        </Field>

        <Field label="Blood group" saved={saved("blood")}>
          {/* Dropdowns save on change, not on blur — see the header. */}
          <Select
            defaultValue={values.bloodGroup ?? ""}
            onChange={(event) => void save({ ...values, bloodGroup: event.target.value }, "blood")}
          >
            <option value="">Not said</option>
            {BLOOD_GROUPS.map((group) => (
              <option key={group} value={group}>
                {group}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Emergency contact" hint="Who to call, and what they are to you." saved={saved("ecName")}>
          <Input
            defaultValue={values.emergencyContactName ?? ""}
            placeholder="e.g. Reena (wife)"
            onBlur={(event) =>
              void save({ ...values, emergencyContactName: event.target.value }, "ecName")
            }
          />
        </Field>

        <Field label="Emergency number" saved={saved("ecPhone")}>
          <Input
            type="tel"
            defaultValue={values.emergencyContactPhone ?? ""}
            placeholder="98765 43210"
            inputMode="tel"
            onBlur={(event) =>
              void save({ ...values, emergencyContactPhone: event.target.value }, "ecPhone")
            }
          />
        </Field>
      </div>

      <FormMessage error={error} />
    </div>
  );
}

function Field({
  label,
  hint,
  saved,
  children,
}: {
  label: string;
  hint?: string;
  saved: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label>{label}</Label>
        {saved}
      </div>
      {children}
      {hint && <p className="text-muted text-xs">{hint}</p>}
    </div>
  );
}

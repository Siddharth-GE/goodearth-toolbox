import { Section } from "@/components/ui/section";
import { getMyDetails } from "@/lib/directory/queries";
import { formatDate } from "@/lib/format";

import { MyDetailsForm } from "../_components/my-details-form";
import { PersonPhoto } from "../_components/person-photo";

export default async function MyDetailsPage() {
  const me = await getMyDetails();

  return (
    <div className="space-y-4">
      <Section
        title="Yours to keep current"
        note="Everyone who can open the Directory can see these, including your blood group and emergency contact."
      >
        <div className="flex items-start gap-4">
          <div className="hidden sm:block">
            <PersonPhoto name={me.name || "?"} photoPath={me.photoPath} size={56} />
          </div>
          <div className="min-w-0 flex-1">
            <MyDetailsForm
              initial={{
                name: me.name,
                phone: me.phone,
                dateOfBirth: me.dateOfBirth,
                bloodGroup: me.bloodGroup,
                emergencyContactName: me.emergencyContactName,
                emergencyContactPhone: me.emergencyContactPhone,
              }}
            />
          </div>
        </div>
      </Section>

      {/* Shown read-only rather than hidden. Somebody who cannot see their
          own department just asks why it is missing — and the greyed
          fields are where the "an admin sets this" rule becomes obvious
          instead of surprising. */}
      <Section title="Set by an admin" note="Ask an admin if any of this is wrong.">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Email" value={me.email} />
          <Fact label="Department" value={me.departmentName} />
          <Fact label="Designation" value={me.designation} />
          <Fact label="Reports to" value={me.reportsToName} />
          <Fact label="Joined" value={me.joinedOn ? formatDate(me.joinedOn) : null} />
        </dl>
      </Section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-muted text-xs">{label}</dt>
      <dd className="text-foreground mt-0.5 text-sm break-words">
        {value || <span className="text-muted">—</span>}
      </dd>
    </div>
  );
}

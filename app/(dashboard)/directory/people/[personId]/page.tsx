import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { requireUser } from "@/lib/auth/dal";
import { formatPhone } from "@/lib/directory/people";
import { getPerson, listDepartments, listPeopleOptions } from "@/lib/directory/queries";
import { formatDate } from "@/lib/format";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PersonPhoto } from "../../_components/person-photo";
import { PostingFields } from "../../_components/posting-fields";

/** One labelled fact. Renders an em dash rather than vanishing when
 *  empty — a missing phone number is information too, and a card whose
 *  rows come and go has no shape between one person and the next. */
function Detail({
  label,
  value,
  href,
}: {
  label: string;
  value: string | null;
  href?: string | null;
}) {
  return (
    <div>
      <dt className="text-muted text-xs">{label}</dt>
      <dd className="text-foreground mt-0.5 text-sm">
        {value ? (
          href ? (
            <a href={href} className="hover:text-accent break-words">
              {value}
            </a>
          ) : (
            <span className="break-words">{value}</span>
          )
        ) : (
          <span className="text-muted">—</span>
        )}
      </dd>
    </div>
  );
}

export default async function PersonPage({ params }: { params: Promise<{ personId: string }> }) {
  const { personId } = await params;
  const [user, result] = await Promise.all([requireUser(), getPerson(personId)]);
  if (!result) notFound();

  const { person, reportsTo, directReports } = result;
  const isAdmin = user.profile?.role === "admin";

  // The admin's pickers, fetched only when they will be rendered.
  // listPeopleOptions is passed the CURRENT reports-to so a deactivated
  // manager stays selectable — see its comment in queries.ts.
  const [departments, people] = isAdmin
    ? await Promise.all([listDepartments(), listPeopleOptions(person.reportsToId)])
    : [[], []];

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-4">
          <PersonPhoto
            personId={person.id}
            name={person.name}
            photoPath={person.photoPath}
            size={64}
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-foreground text-lg font-semibold">{person.name}</h1>
            {person.designation && <p className="text-muted text-sm">{person.designation}</p>}
            <div className="mt-2 flex flex-wrap gap-1">
              {person.departmentName && <Badge variant="neutral">{person.departmentName}</Badge>}
              {person.isAdmin && <Badge variant="info">Admin</Badge>}
              {!person.isActive && <Badge variant="warning">Inactive</Badge>}
            </div>
          </div>
        </div>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Detail
            label="Phone"
            value={formatPhone(person.phone) || null}
            href={person.phone ? `tel:${person.phone}` : null}
          />
          <Detail
            label="Email"
            value={person.email}
            href={person.email ? `mailto:${person.email}` : null}
          />
          <Detail label="Joined" value={person.joinedOn ? formatDate(person.joinedOn) : null} />
        </dl>
      </Card>

      {/* The same section for everyone: editable for an admin, read-only
          for everybody else. One page, one conditional — nobody has to
          know a second screen exists. */}
      <Section
        title="Where they sit"
        note={
          isAdmin
            ? "These describe the company, not the person — only an admin can change them."
            : "Set by an admin — these describe the company, not the person."
        }
      >
        {isAdmin ? (
          <PostingFields
            personId={person.id}
            initial={{
              departmentId: person.departmentId,
              designation: person.designation,
              reportsToId: person.reportsToId,
              joinedOn: person.joinedOn,
            }}
            departments={departments}
            people={people}
          />
        ) : (
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Department" value={person.departmentName} />
            <Detail label="Designation" value={person.designation} />
            <div>
              <dt className="text-muted text-xs">Reports to</dt>
              <dd className="text-foreground mt-0.5 text-sm">
                {reportsTo ? (
                  <Link href={`/directory/people/${reportsTo.id}`} className="hover:text-accent">
                    {reportsTo.name}
                    {/* A reporting line pointing at somebody deactivated
                        must be visibly odd, never silently absent. */}
                    {!reportsTo.isActive && <span className="text-muted"> (inactive)</span>}
                  </Link>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </dd>
            </div>
          </dl>
        )}

        {directReports.length > 0 && (
          <div className="border-border mt-4 border-t pt-3">
            <p className="text-muted text-xs">
              {directReports.length === 1
                ? "1 person reports to them"
                : `${directReports.length} people report to them`}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
              {directReports.map((report) => (
                <Link
                  key={report.id}
                  href={`/directory/people/${report.id}`}
                  className="text-foreground hover:text-accent text-sm"
                >
                  {report.name}
                  {!report.isActive && <span className="text-muted"> (inactive)</span>}
                </Link>
              ))}
            </div>
          </div>
        )}
      </Section>

      {/* A quieter block, and it says who can see it. Blood group and
          next-of-kin have not been in this app before; someone reading
          their own card should not have to guess how far it travels. */}
      <Section
        title="In an emergency"
        note="Visible to everyone who can open the Directory. Each person fills in their own."
      >
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Blood group" value={person.bloodGroup} />
          <Detail label="Contact" value={person.emergencyContactName} />
          <Detail
            label="Contact number"
            value={formatPhone(person.emergencyContactPhone) || null}
            href={person.emergencyContactPhone ? `tel:${person.emergencyContactPhone}` : null}
          />
        </dl>
      </Section>
    </div>
  );
}

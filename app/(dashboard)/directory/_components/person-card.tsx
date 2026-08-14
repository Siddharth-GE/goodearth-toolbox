import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatPhone } from "@/lib/directory/people";
import type { DirectoryPerson } from "@/lib/directory/queries";
import { Mail, Phone } from "lucide-react";
import Link from "next/link";

import { PersonPhoto } from "./person-photo";

/**
 * One person on the roster.
 *
 * THIS IS A PHONE SCREEN. A site engineer opens the directory standing on
 * site to get a colleague's number, so the number and the address are
 * FULL-WIDTH TAP TARGETS, not 12px icons beside text — `tel:` dials,
 * `mailto:` composes. Everything else on the card is secondary to that.
 *
 * The name links to the full card; the contact rows deliberately do not,
 * so a mis-tap costs a wrong dialler, never a lost number.
 */
export function PersonCard({ person }: { person: DirectoryPerson }) {
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start gap-3">
        <PersonPhoto name={person.name} photoPath={person.photoPath} size={44} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/directory/people/${person.id}`}
            className="text-foreground hover:text-accent block truncate text-sm font-semibold"
          >
            {person.name}
          </Link>
          {person.designation && (
            <p className="text-muted mt-0.5 truncate text-xs">{person.designation}</p>
          )}
          <div className="mt-1.5 flex flex-wrap gap-1">
            {person.departmentName && <Badge variant="neutral">{person.departmentName}</Badge>}
            {!person.isActive && <Badge variant="warning">Inactive</Badge>}
          </div>
        </div>
      </div>

      <div className="border-border mt-3 flex flex-col gap-0.5 border-t pt-2">
        {person.phone ? (
          <a
            href={`tel:${person.phone}`}
            // min-h-11 is the 44px tap target — this row exists to be hit
            // with a thumb, one-handed, outdoors.
            className="text-foreground hover:bg-accent/5 -mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm"
          >
            <Phone className="text-muted size-4 shrink-0" />
            <span className="truncate">{formatPhone(person.phone)}</span>
          </a>
        ) : (
          <p className="text-muted flex min-h-11 items-center gap-2 px-0 text-sm">
            <Phone className="size-4 shrink-0" />
            <span>No number yet</span>
          </p>
        )}

        {person.email && (
          <a
            href={`mailto:${person.email}`}
            className="text-foreground hover:bg-accent/5 -mx-2 flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm"
          >
            <Mail className="text-muted size-4 shrink-0" />
            <span className="truncate">{person.email}</span>
          </a>
        )}
      </div>
    </Card>
  );
}

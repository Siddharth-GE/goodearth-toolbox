import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import { listDepartments } from "@/lib/directory/queries";

import { DepartmentManager } from "../_components/department-manager";

export default async function DepartmentsPage() {
  // The nav hides this tab for non-admins, but that is cosmetic — THIS is
  // the boundary, and it redirects rather than erroring.
  const user = await requireUser();
  await requireAdmin(user);

  // Switched-off departments still show here; this is the screen where
  // you turn one back on.
  const departments = await listDepartments(true);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-foreground text-sm font-semibold">Departments</h2>
        <p className="text-muted mt-0.5 text-sm">
          Where people sit. Tap a name to rename it. Switching one off keeps it on the cards of
          everyone already in it, and hides it from the picker.
        </p>
        <p className="text-muted mt-1.5 text-sm">
          These are separate from Relay&rsquo;s departments, which describe what kind of work a
          trail is rather than where a person sits.
        </p>
      </div>

      <DepartmentManager departments={departments} />
    </div>
  );
}

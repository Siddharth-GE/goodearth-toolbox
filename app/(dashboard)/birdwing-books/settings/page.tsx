import { requireAdmin } from "@/lib/auth/access";
import { requireUser } from "@/lib/auth/dal";
import {
  listHeads,
  listPayRules,
  listProfileOptions,
  listStaff,
} from "@/lib/birdwing-books/queries";
import { HeadsSection, StaffSection } from "./settings-sections";

/** Admin only (0116: every write is is_admin()). Nothing is deleted: a person or head is switched off; a pay rule is followed by a newer one. */
export default async function BooksSettingsPage() {
  const user = await requireUser();
  await requireAdmin(user);
  const [staff, rules, heads, profiles] = await Promise.all([
    listStaff(),
    listPayRules(),
    listHeads(),
    listProfileOptions(),
  ]);

  return (
    <div className="space-y-4">
      <StaffSection staff={staff} rules={rules} profiles={profiles} />
      <HeadsSection heads={heads} />
    </div>
  );
}

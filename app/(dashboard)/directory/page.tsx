import { getWelcomeCounts } from "@/lib/directory/queries";

import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen (founder, 2026-08-13: every Operations and
// Management tool opens on one). No PageTitle here — the layout renders
// the title and nav for every screen in this tool.
//
// The second paragraph says the editing split out loud. That is the
// honest place for it: someone who finds their department greyed out
// should have been told why before they got there, not after.
export default async function DirectoryPage() {
  const counts = await getWelcomeCounts();

  return (
    <ToolWelcome
      icon="Users"
      intro={[
        "Everyone who works here, with their phone number, department and who they report to. On a phone, tapping a number dials it.",
        "Your own contact details are yours to keep current — your name, phone, blood group, emergency contact and date of birth are all on My details. Department, designation, reporting line and joining date are set by an admin.",
      ]}
      stats={[
        { label: "People", value: counts.people, hint: "on the directory" },
        { label: "Departments", value: counts.departments, hint: "you can be in" },
        { label: "Birthdays", value: counts.birthdaysSoon, hint: "in the next 30 days" },
      ]}
      links={[
        { label: "People", href: "/directory/people", primary: true },
        { label: "My details", href: "/directory/me" },
        { label: "Birthdays", href: "/directory/birthdays" },
      ]}
    />
  );
}

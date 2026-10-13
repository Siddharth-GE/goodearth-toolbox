import { requireUser } from "@/lib/auth/dal";
import { getWelcomeCounts } from "@/lib/birdwing-books/queries";
import { ToolWelcome } from "../_components/tool-welcome";

// The welcome screen. Counts only — the rupees are one click in.
export default async function BirdwingBooksPage() {
  const [counts, user] = await Promise.all([getWelcomeCounts(), requireUser()]);
  const isAdmin = user.profile?.role === "admin";

  return (
    <ToolWelcome
      icon="BookOpen"
      intro={[
        "What Birdwing spends, month by month: groceries, gas, power, laundry and the staff — each line in the month it belongs to, with its bill attached when there is one. The old workbook uploads once; uploading it again adds nothing twice.",
        "Attendance is marked day by day. At the month's end each person's salary is worked out from their pay rule, their overtime and the rooms and guests the house had on the days they worked — reviewed, then confirmed once, and it becomes that month's salary line.",
      ]}
      stats={[
        { label: "Lines this month", value: counts.linesThisMonth, hint: "expenses recorded" },
        { label: "Without a bill", value: counts.withoutBill, hint: "this month" },
        { label: "Days not marked", value: counts.attendanceGaps, hint: "this month, so far" },
        {
          label: "Salaries to confirm",
          value: counts.salariesToConfirm,
          hint: "for last month",
        },
      ]}
      links={[
        { label: "Expenses", href: "/birdwing-books/expenses", primary: true },
        { label: "Attendance", href: "/birdwing-books/attendance" },
        { label: "Salaries", href: "/birdwing-books/salaries" },
        { label: "Upload the sheet", href: "/birdwing-books/expenses/upload" },
        ...(isAdmin ? [{ label: "Settings", href: "/birdwing-books/settings" }] : []),
      ]}
    />
  );
}

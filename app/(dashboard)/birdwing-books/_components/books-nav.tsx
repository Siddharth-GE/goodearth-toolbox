import { ToolNav } from "@/components/ui/tool-nav";

/** Real routes, each with its own loading.tsx; Settings for admins only (every write there is). */
const TABS = [
  { key: "expenses", href: "/birdwing-books/expenses", label: "Expenses" },
  { key: "attendance", href: "/birdwing-books/attendance", label: "Attendance" },
  { key: "salaries", href: "/birdwing-books/salaries", label: "Salaries" },
] as const;

const SETTINGS = { key: "settings", href: "/birdwing-books/settings", label: "Settings" } as const;

export function BooksNav({ isAdmin }: { isAdmin: boolean }) {
  return (
    <ToolNav
      root="/birdwing-books"
      tabs={isAdmin ? [...TABS, SETTINGS] : TABS}
      defaultKey="expenses"
    />
  );
}

import { EmptyState } from "@/components/ui/empty-state";
import { getSalaryBoard } from "@/lib/birdwing-books/queries";
import { daysOfMonth, monthLabel } from "@/lib/birdwing-books/shared";
import { todayInIndia } from "@/lib/format";
import { Wallet } from "lucide-react";
import { MonthSwitcher, monthParam } from "../_components/month-switcher";
import { SalaryCardView } from "./salary-card";

/**
 * A month's salaries, person by person: the rule in force, the figures
 * worked out from attendance and the house's occupancy, and — once a
 * reviewer has checked them — the confirmed salary, which becomes that
 * month's salary line in Expenses and closes the month's attendance.
 */
export default async function SalariesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const today = todayInIndia();
  const month = monthParam((await searchParams).month, today);
  const board = await getSalaryBoard(month);
  const daysInMonth = daysOfMonth(month).length;
  const monthOver = `${month}-${String(daysInMonth).padStart(2, "0")}` < today;
  const begun = `${month}-01` <= today;

  return (
    <div className="space-y-4">
      <MonthSwitcher
        month={month}
        hrefFor={(target) => `/birdwing-books/salaries?month=${target}`}
      />
      {!monthOver && begun && (
        <p className="text-warning text-sm">
          {monthLabel(month)} isn&rsquo;t over yet — these are the figures so far.
        </p>
      )}
      {board.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No staff yet"
          description="An admin adds Birdwing's staff and their pay rules in Settings."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {board.map((card) => (
            <SalaryCardView
              key={card.staff.id}
              card={card}
              month={month}
              daysInMonth={daysInMonth}
              canConfirm={begun}
            />
          ))}
        </div>
      )}
    </div>
  );
}

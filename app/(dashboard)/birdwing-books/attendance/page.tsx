import { EmptyState } from "@/components/ui/empty-state";
import { getAttendanceMonth } from "@/lib/birdwing-books/queries";
import { daysOfMonth } from "@/lib/birdwing-books/shared";
import { todayInIndia } from "@/lib/format";
import { Users } from "lucide-react";
import { MonthSwitcher, monthParam } from "../_components/month-switcher";
import { AttendanceBoard, type BoardRecord } from "./attendance-board";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const today = todayInIndia();
  const month = monthParam((await searchParams).month, today);
  const attendance = await getAttendanceMonth(month);

  const days = daysOfMonth(month);
  const records: Record<string, Record<string, BoardRecord>> = {};
  for (const [staffId, byDay] of attendance.records) {
    records[staffId] = Object.fromEntries(byDay);
  }

  return (
    <div className="space-y-4">
      <MonthSwitcher
        month={month}
        hrefFor={(target) => `/birdwing-books/attendance?month=${target}`}
      />
      {attendance.staff.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No staff yet"
          description="An admin adds Birdwing's staff in Settings."
        />
      ) : (
        <AttendanceBoard
          staff={attendance.staff.map(({ id, name, isActive }) => ({ id, name, isActive }))}
          days={days}
          today={today}
          records={records}
          closed={[...attendance.closed]}
        />
      )}
    </div>
  );
}
